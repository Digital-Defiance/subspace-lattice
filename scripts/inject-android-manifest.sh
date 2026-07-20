#!/usr/bin/env bash
# Patch generated AndroidManifest.xml after `tauri android init` regen:
#   - portrait orientation (phone layout)
#   - Google OAuth redirect scheme from env / .env
# Also write deep-link scheme into gitignored tauri.conf.local.json
# (never rewrite committed tauri.conf.json).

set -e

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load android
lattice_env_cd_root

MANIFEST="${LATTICE_ROOT}/apps/desktop/src-tauri/gen/android/app/src/main/AndroidManifest.xml"
TAURI_CONF="${LATTICE_ROOT}/apps/desktop/src-tauri/tauri.conf.json"
TAURI_LOCAL="${LATTICE_ROOT}/apps/desktop/src-tauri/tauri.conf.local.json"
ROOT_ENV="${LATTICE_ROOT}/.env"
APP_ENV="${LATTICE_ROOT}/apps/desktop/.env"

die() {
  echo "error: $*" >&2
  exit 1
}

[ -f "$MANIFEST" ] || die "missing ${MANIFEST} — run: yarn tauri android init (from apps/desktop)"
[ -f "$TAURI_CONF" ] || die "missing ${TAURI_CONF}"

GRADLE_KTS="${LATTICE_ROOT}/apps/desktop/src-tauri/gen/android/app/build.gradle.kts"
[ -f "$GRADLE_KTS" ] || die "missing ${GRADLE_KTS}"

# Ensure local override exists / is refreshed from env (includes OAuth schemes).
if [ -n "${APPLE_BUNDLE_ID:-}" ]; then
  node "${LATTICE_ROOT}/scripts/tauri-config-from-env.mjs" --write "$TAURI_LOCAL" >/dev/null
fi

# Tauri emits Kotlin under APPLE_BUNDLE_ID, but gen/android often still has
# com.example.subspacelattice in build.gradle.kts — that makes BuildConfig resolve to the
# wrong package (Logger.kt: Unresolved reference: BuildConfig).
if [ -z "${APPLE_BUNDLE_ID:-}" ]; then
  die "APPLE_BUNDLE_ID is required to patch Android applicationId/namespace"
fi
python3 - "$GRADLE_KTS" "$APPLE_BUNDLE_ID" <<'PY'
import re
import sys
from pathlib import Path

gradle_path = Path(sys.argv[1])
bundle_id = sys.argv[2]
text = gradle_path.read_text(encoding="utf-8")
updated = text
updated = re.sub(
    r'namespace\s*=\s*"[^"]*"',
    f'namespace = "{bundle_id}"',
    updated,
    count=1,
)
updated = re.sub(
    r'applicationId\s*=\s*"[^"]*"',
    f'applicationId = "{bundle_id}"',
    updated,
    count=1,
)
if updated == text:
    print(f"Android applicationId/namespace already {bundle_id}")
else:
    gradle_path.write_text(updated, encoding="utf-8")
    print(f"Patched Android applicationId/namespace → {bundle_id}")
PY

python3 - "$ROOT_ENV" "$APP_ENV" "$MANIFEST" "$TAURI_LOCAL" <<'PY'
import json
import os
import re
import sys
from pathlib import Path

root_env_file = Path(sys.argv[1])
app_env_file = Path(sys.argv[2])
manifest_path = Path(sys.argv[3])
tauri_local_path = Path(sys.argv[4])

def load_env_file(path):
    values = {}
    if not path.is_file():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            values[key] = value
    return values

def reversed_client_id_scheme(client_id):
    bare = client_id.removesuffix(".apps.googleusercontent.com")
    return f"com.googleusercontent.apps.{bare}"

def resolve_android_oauth_scheme(env):
    override = env.get("VITE_GOOGLE_OAUTH_REDIRECT_SCHEME_ANDROID")
    if override:
        return override
    client_id = env.get("VITE_GOOGLE_DESKTOP_CLIENT_ID") or env.get(
        "VITE_GOOGLE_ANDROID_CLIENT_ID"
    )
    if not client_id:
        return None
    return reversed_client_id_scheme(client_id)

env = {}
env.update(load_env_file(root_env_file))
env.update(load_env_file(app_env_file))
for key in (
    "VITE_GOOGLE_OAUTH_REDIRECT_SCHEME_ANDROID",
    "VITE_GOOGLE_DESKTOP_CLIENT_ID",
    "VITE_GOOGLE_ANDROID_CLIENT_ID",
    "APPLE_BUNDLE_ID",
):
    if key in os.environ and os.environ[key]:
        env[key] = os.environ[key]

content = manifest_path.read_text(encoding="utf-8")
updated = content

updated = re.sub(
    r'android:screenOrientation="sensorLandscape"',
    'android:screenOrientation="userPortrait"',
    updated,
)
updated = re.sub(
    r'android:screenOrientation="landscape"',
    'android:screenOrientation="userPortrait"',
    updated,
)

scheme = resolve_android_oauth_scheme(env)
if scheme:
    scheme_pattern = re.compile(r'android:scheme="com\.googleusercontent\.apps\.[^"]*"')
    if not scheme_pattern.search(updated):
        # Also try empty / placeholder schemes
        generic = re.compile(r'android:scheme="[^"]*"')
        # Only patch inside deep-link / oauth intent filters when possible
        if 'android:scheme=' in updated:
            print(
                "warning: AndroidManifest has no com.googleusercontent.apps.* scheme to patch; "
                "leaving existing schemes",
                file=sys.stderr,
            )
        else:
            print(
                "warning: AndroidManifest has no android:scheme to patch",
                file=sys.stderr,
            )
    else:
        updated = scheme_pattern.sub(f'android:scheme="{scheme}"', updated, count=1)
else:
    print(
        "warning: Google Android OAuth scheme not configured — set "
        "VITE_GOOGLE_DESKTOP_CLIENT_ID (or VITE_GOOGLE_ANDROID_CLIENT_ID) "
        "in .env / apps/desktop/.env or the environment",
        file=sys.stderr,
    )

if updated == content:
    print(f"AndroidManifest already up to date: {manifest_path}")
else:
    manifest_path.write_text(updated, encoding="utf-8")
    if scheme:
        print(f"Patched AndroidManifest (portrait + OAuth scheme {scheme}): {manifest_path}")
    else:
        print(f"Patched AndroidManifest (portrait): {manifest_path}")

# Keep plugins.deep-link.mobile in the *local* override (gitignored).
if scheme:
    if tauri_local_path.is_file():
        conf = json.loads(tauri_local_path.read_text(encoding="utf-8"))
    else:
        conf = {}
    plugins = conf.setdefault("plugins", {})
    deep_link = plugins.setdefault("deep-link", {})
    mobile = deep_link.setdefault("mobile", [])
    entry = next(
        (
            item
            for item in mobile
            if isinstance(item, dict)
            and any(
                isinstance(s, str) and s.startswith("com.googleusercontent.apps.")
                for s in (item.get("scheme") or [])
            )
        ),
        None,
    )
    desired = {"scheme": [scheme], "appLink": False}
    if entry is None:
        mobile.append(desired)
        changed = True
    else:
        changed = entry.get("scheme") != [scheme] or entry.get("appLink") is not False
        entry["scheme"] = [scheme]
        entry["appLink"] = False
    if changed or not tauri_local_path.is_file():
        tauri_local_path.write_text(
            json.dumps(conf, indent=2) + "\n", encoding="utf-8"
        )
        print(f"Patched tauri.conf.local.json deep-link mobile scheme: {scheme}")
    else:
        print(f"tauri.conf.local.json deep-link mobile scheme already up to date: {scheme}")
PY
