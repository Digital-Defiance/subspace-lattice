#!/usr/bin/env bash
# Optional: inject Google OAuth URL scheme into generated iOS Info.plist.
# No-op if VITE_GOOGLE_IOS_CLIENT_ID / redirect scheme env is unset.

set -euo pipefail

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load ios
lattice_env_cd_root

APPLE_DIR="$(lattice_env_tauri_dir)/gen/apple"
PLIST="$(find "$APPLE_DIR" -maxdepth 2 -path '*_iOS/Info.plist' | head -1)"

die() {
  echo "error: $*" >&2
  exit 1
}

[ -n "${PLIST:-}" ] && [ -f "$PLIST" ] || die "missing *_iOS/Info.plist — run: yarn init:desktop"

SCHEME="${VITE_GOOGLE_OAUTH_REDIRECT_SCHEME:-}"
if [ -z "$SCHEME" ] && [ -n "${VITE_GOOGLE_IOS_CLIENT_ID:-}" ]; then
  bare="${VITE_GOOGLE_IOS_CLIENT_ID%.apps.googleusercontent.com}"
  SCHEME="com.googleusercontent.apps.${bare}"
fi

if [ -z "$SCHEME" ]; then
  echo "No iOS OAuth scheme configured — skipping Info.plist deep-link inject."
  exit 0
fi

python3 - "$PLIST" "$SCHEME" <<'PY'
import plistlib
import sys
from pathlib import Path

path = Path(sys.argv[1])
scheme = sys.argv[2]
with path.open("rb") as f:
    data = plistlib.load(f)

types = data.setdefault("CFBundleURLTypes", [])
already = False
for entry in types:
    schemes = entry.get("CFBundleURLSchemes") or []
    if scheme in schemes:
        already = True
        break
if not already:
    types.append(
        {
            "CFBundleURLName": "google-oauth",
            "CFBundleURLSchemes": [scheme],
        }
    )
    with path.open("wb") as f:
        plistlib.dump(data, f, sort_keys=False)
    print(f"Injected OAuth scheme {scheme} into {path}")
else:
    print(f"OAuth scheme {scheme} already present in {path}")
PY
