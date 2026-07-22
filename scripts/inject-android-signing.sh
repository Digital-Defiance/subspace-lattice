#!/usr/bin/env bash
# Ensure gen/android/app/build.gradle.kts signs release AABs with keystore.properties.
# Fresh `tauri android init` projects omit signingConfigs; Play rejects unsigned bundles.

set -euo pipefail

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load android
lattice_env_cd_root

TAURI_DIR="$(lattice_env_tauri_dir)"
GRADLE_KTS="${TAURI_DIR}/gen/android/app/build.gradle.kts"

die() {
  echo "error: $*" >&2
  exit 1
}

[ -f "$GRADLE_KTS" ] || die "missing ${GRADLE_KTS} — run tauri android init first"

python3 - "$GRADLE_KTS" <<'PY'
from pathlib import Path
import sys

path = Path(sys.argv[1])
text = path.read_text(encoding="utf-8")

if "signingConfigs" in text and 'signingConfig = signingConfigs.getByName("release")' in text:
    print(f"Release signing already configured in {path}", file=sys.stderr)
    raise SystemExit(0)

if "import java.io.FileInputStream" not in text:
    if text.startswith("import java.util.Properties"):
        text = text.replace(
            "import java.util.Properties\n",
            "import java.io.FileInputStream\nimport java.util.Properties\n",
            1,
        )
    else:
        text = "import java.io.FileInputStream\nimport java.util.Properties\n\n" + text

signing_block = """
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            if (keystorePropertiesFile.exists()) {
                val keystoreProperties = Properties()
                keystoreProperties.load(FileInputStream(keystorePropertiesFile))
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["password"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["password"] as String
            }
        }
    }
"""

release_signing = """
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            if (keystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
"""

if "signingConfigs" not in text:
    marker = "    buildTypes {"
    if marker not in text:
        sys.exit(f"error: could not find buildTypes in {path}")
    text = text.replace(marker, signing_block + "\n" + marker, 1)

if 'signingConfig = signingConfigs.getByName("release")' not in text:
    # Insert at the start of the release buildType body.
    import re

    pattern = re.compile(
        r'(getByName\("release"\)\s*\{\n)',
        re.M,
    )
    if not pattern.search(text):
        sys.exit(f'error: could not find getByName("release") in {path}')
    text = pattern.sub(rf"\1{release_signing}", text, count=1)

path.write_text(text, encoding="utf-8")
print(f"Injected release signingConfigs into {path}", file=sys.stderr)
PY
