#!/usr/bin/env bash
# Android Play Store: release AAB (and optional APK).
#
# Usage:
#   bash scripts/build-android.sh
#   bash scripts/build-android.sh --apk
#
# First-time setup:
#   1. Android Studio / SDK + NDK (Tauri will prompt to install NDK if missing)
#   2. Create upload keystore (one-time), e.g.:
#        keytool -genkey -v -keystore apps/desktop/src-tauri/SubspaceLattice_upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload
#   3. Save keystore at apps/desktop/src-tauri/SubspaceLattice_upload.jks (gitignored)
#   4. Run this script — it writes gen/android/keystore.properties (also gitignored)

set -e

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load android
lattice_env_validate android
lattice_env_cd_root

ROOT="$LATTICE_ROOT"
BRIDGE_DIR="${ROOT}/apps/desktop"
TAURI_DIR="${BRIDGE_DIR}/src-tauri"
ANDROID_DIR="${TAURI_DIR}/gen/android"
if [ -n "${ANDROID_KEYSTORE:-}" ]; then
  KEYSTORE="$(lattice_env_abs_path "$ANDROID_KEYSTORE")"
else
  KEYSTORE="${TAURI_DIR}/SubspaceLattice_upload.jks"
fi
KEY_ALIAS="${ANDROID_KEY_ALIAS:-upload}"
KEYSTORE_PROPS="${ANDROID_DIR}/keystore.properties"
TAURI_BIN="${ROOT}/node_modules/.bin/tauri"
TAURI_LOCAL_CONF=""

BUILD_APK=0
EXTRA_TAURI_ARGS=""

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/build-android.sh [OPTIONS] [-- extra tauri android build args...]

  --apk            Also build APKs (default: AAB only for Play Store)
  --help           Show this help

Environment:
  ANDROID_HOME / ANDROID_SDK_ROOT   Android SDK (auto-detected on macOS)
  ANDROID_KEYSTORE                  Default apps/desktop/src-tauri/SubspaceLattice_upload.jks
  ANDROID_KEY_ALIAS                 Default upload
  ANDROID_KEYSTORE_PASSWORD         Keystore password (prompted if unset)

Output (typical):
  apps/desktop/src-tauri/gen/android/app/build/outputs/bundle/universalRelease/*.aab
EOF
  exit 1
}

detect_android_home() {
  if [ -n "${ANDROID_HOME:-}" ]; then
    printf '%s' "$ANDROID_HOME"
    return 0
  fi
  if [ -n "${ANDROID_SDK_ROOT:-}" ]; then
    printf '%s' "$ANDROID_SDK_ROOT"
    return 0
  fi
  if [ -d "${HOME}/Library/Android/sdk" ]; then
    printf '%s' "${HOME}/Library/Android/sdk"
    return 0
  fi
  if [ -d "${HOME}/Android/Sdk" ]; then
    printf '%s' "${HOME}/Android/Sdk"
    return 0
  fi
  if [ -d "/usr/lib/android-sdk" ]; then
    printf '%s' "/usr/lib/android-sdk"
    return 0
  fi
  return 1
}

ensure_local_properties() {
  local sdk_home="$1"
  local ndk_dir="$2"
  local ndk_version="$3"
  local props="${ANDROID_DIR}/local.properties"
  {
    printf 'sdk.dir=%s\n' "$sdk_home"
    printf 'ndk.dir=%s\n' "$ndk_dir"
    printf 'ndk.version=%s\n' "$ndk_version"
  } > "$props"
  echo "Wrote ${props}" >&2
}

find_sdkmanager() {
  local sdk_home="$1"
  local candidate
  for candidate in \
    "${sdk_home}/cmdline-tools/latest/bin/sdkmanager" \
    "${sdk_home}/cmdline-tools/bin/sdkmanager" \
    "${sdk_home}/tools/bin/sdkmanager"; do
    if [ -x "$candidate" ]; then
      printf '%s' "$candidate"
      return 0
    fi
  done
  return 1
}

ndk_major() {
  printf '%s' "$1" | cut -d. -f1
}

ensure_android_ndk() {
  local sdk_home="$1"
  local ndk_root="${sdk_home}/ndk"
  local chosen="" chosen_dir="" v

  if [ ! -d "$ndk_root" ]; then
    die "No NDK installed under ${ndk_root}.
Install Android Studio → SDK Manager → SDK Tools → NDK (Side by side).
Prefer NDK 28.0.13004108 or newer for Google Play 16 KB page size."
  fi

  if [ -n "${ANDROID_NDK_VERSION:-}" ] && [ -d "${ndk_root}/${ANDROID_NDK_VERSION}" ]; then
    chosen="$ANDROID_NDK_VERSION"
  else
    # Prefer newest NDK r28+, else newest installed.
    for v in $(ls "$ndk_root" 2>/dev/null | sort -V -r); do
      [ -d "${ndk_root}/${v}" ] || continue
      if [ "$(ndk_major "$v")" -ge 28 ]; then
        chosen="$v"
        break
      fi
    done
    if [ -z "$chosen" ]; then
      chosen="$(ls "$ndk_root" 2>/dev/null | sort -V -r | head -1)"
    fi
  fi

  [ -n "$chosen" ] && [ -d "${ndk_root}/${chosen}" ] || die "No NDK found under ${ndk_root}."

  chosen_dir="${ndk_root}/${chosen}"
  export NDK_HOME="$chosen_dir"
  export ANDROID_NDK_VERSION="$chosen"

  ensure_local_properties "$sdk_home" "$chosen_dir" "$chosen"

  if [ "$(ndk_major "$chosen")" -ge 28 ]; then
    echo "Using NDK ${chosen} (16 KB ELF alignment by default)" >&2
    return 0
  fi

  echo "Using NDK ${chosen} (16 KB ELF via build.rs linker flags)" >&2
  echo "Optional: install NDK 28+ in Android Studio → SDK Manager → NDK (Side by side)." >&2

  if [ "${ANDROID_NDK_AUTO_INSTALL:-0}" = "1" ]; then
    local sdkmanager ndk_target="28.0.13004108"
    sdkmanager="$(find_sdkmanager "$sdk_home")" || die "ANDROID_NDK_AUTO_INSTALL=1 but sdkmanager not found.
Install Android SDK Command-line Tools in Android Studio first."
    echo "Installing Android NDK ${ndk_target}..." >&2
    yes | "$sdkmanager" "ndk;${ndk_target}" >/dev/null
    if [ -d "${ndk_root}/${ndk_target}" ]; then
      export NDK_HOME="${ndk_root}/${ndk_target}"
      export ANDROID_NDK_VERSION="$ndk_target"
      ensure_local_properties "$sdk_home" "$NDK_HOME" "$ndk_target"
      echo "Using NDK ${ndk_target} (16 KB ELF alignment by default)" >&2
    fi
  fi
}

verify_16kb_native_libs() {
  local so
  so="$(find "${TAURI_DIR}/target" -path '*/aarch64-linux-android/release/libapp_lib.so' -print 2>/dev/null | head -1)"
  if [ -z "$so" ] || [ ! -f "$so" ]; then
    so="$(find "${ANDROID_DIR}/app/build" -path '*/arm64-v8a/libapp_lib.so' -print 2>/dev/null | head -1)"
  fi
  if [ -z "$so" ] || [ ! -f "$so" ]; then
    echo "Skipping 16 KB ELF check (libapp_lib.so not found)." >&2
    return 0
  fi
  if ! command -v readelf >/dev/null 2>&1; then
    return 0
  fi
  if readelf -l "$so" 2>/dev/null | grep -q 'Align 0x4000'; then
    echo "16 KB ELF alignment OK: ${so}" >&2
    return 0
  fi
  die "Native library is not 16 KB aligned: ${so}
Rebuild after NDK r28 install (cargo clean may be required):
  rm -rf ${TAURI_DIR}/target/aarch64-linux-android"
}

prompt_keystore_password() {
  local tty=/dev/tty attempt=1

  if [ -n "${ANDROID_KEYSTORE_PASSWORD:-}" ]; then
    if verify_keystore_password; then
      return 0
    fi
    die "ANDROID_KEYSTORE_PASSWORD is incorrect for ${KEYSTORE} (alias ${KEY_ALIAS})."
  fi

  if [ ! -r "$tty" ]; then
    die "No TTY to prompt for keystore password. Set ANDROID_KEYSTORE_PASSWORD."
  fi

  while [ "$attempt" -le 3 ]; do
    ANDROID_KEYSTORE_PASSWORD=""
    if [ "$attempt" -eq 1 ]; then
      printf 'Keystore password: ' >"$tty"
    else
      printf 'Keystore password (retry): ' >"$tty"
    fi
    read -rs ANDROID_KEYSTORE_PASSWORD <"$tty" || true
    printf '\n' >"$tty"
    [ -n "${ANDROID_KEYSTORE_PASSWORD:-}" ] || die "Password cannot be empty."
    if verify_keystore_password; then
      return 0
    fi
    attempt=$((attempt + 1))
  done

  die "Could not unlock ${KEYSTORE}.

Use the password from when you ran keytool -genkey.
Verify manually:
  keytool -list -keystore ${KEYSTORE} -alias ${KEY_ALIAS}

If you forgot it, create a new keystore (only before first Play Store upload):
  keytool -genkey -v -keystore ${KEYSTORE} -keyalg RSA -keysize 2048 -validity 10000 -alias ${KEY_ALIAS}"
}

verify_keystore_password() {
  command -v keytool >/dev/null 2>&1 || return 0

  local err_file
  err_file="$(mktemp -t lattice-keystore-err.XXXXXX)"

  if keytool -list \
    -keystore "$KEYSTORE" \
    -alias "$KEY_ALIAS" \
    -storepass "$ANDROID_KEYSTORE_PASSWORD" \
    >"$err_file" 2>&1; then
    rm -f "$err_file"
    return 0
  fi

  if grep -q "keystore password was incorrect" "$err_file" 2>/dev/null; then
    echo "Incorrect keystore password." >&2
  elif grep -q "Alias.*does not exist" "$err_file" 2>/dev/null; then
    echo "Alias \"${KEY_ALIAS}\" not found in keystore. Aliases:" >&2
    keytool -list -keystore "$KEYSTORE" 2>/dev/null | sed -n 's/^[[:space:]]*, \([^,]*\),.*/  \1/p' >&2 || true
    echo "Set ANDROID_KEY_ALIAS to the correct name." >&2
  elif [ -s "$err_file" ]; then
    echo "Keystore check failed:" >&2
    sed 's/^/  /' "$err_file" >&2
  fi
  rm -f "$err_file"
  return 1
}

write_keystore_properties() {
  [ -f "$KEYSTORE" ] || die "Upload keystore not found: ${KEYSTORE}

Create one (one-time):
  keytool -genkey -v -keystore ${KEYSTORE} \\
    -keyalg RSA -keysize 2048 -validity 10000 -alias ${KEY_ALIAS}

Or set ANDROID_KEYSTORE to an existing .jks path."

  prompt_keystore_password

  # Gradle Java Properties — escape so passwords with = : \ survive the load.
  python3 - "$KEYSTORE_PROPS" "$ANDROID_KEYSTORE_PASSWORD" "$KEY_ALIAS" "$KEYSTORE" <<'PY'
from pathlib import Path
import sys

out, password, alias, store = sys.argv[1:5]

def escape(value: str) -> str:
    return (
        value.replace("\\", "\\\\")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t")
    )

Path(out).write_text(
    f"password={escape(password)}\n"
    f"keyAlias={escape(alias)}\n"
    f"storeFile={escape(store)}\n",
    encoding="utf-8",
)
print(f"Wrote {out}", file=sys.stderr)
PY
}

assert_aab_signed() {
  local aab="$1"
  [ -f "$aab" ] || die "AAB not found: ${aab}"

  # bundletool / apksigner prefer a signed *.aab; unsigned ones lack BundleConfig signing.
  if command -v bundletool >/dev/null 2>&1; then
    if bundletool dump manifest --bundle="$aab" >/dev/null 2>&1; then
      :
    fi
  fi

  # Look for a signature block in the AAB zip (signed AABs include META-INF/*.RSA|*.EC|*.DSA).
  if unzip -l "$aab" 2>/dev/null | grep -E -q 'META-INF/.*\.(RSA|EC|DSA)$'; then
    echo "AAB signing OK (META-INF signature present): ${aab}" >&2
    return 0
  fi

  # Some AGP versions put the cert under BUNDLE-METADATA; fall back to jarsigner when Java exists.
  if command -v jarsigner >/dev/null 2>&1; then
    if jarsigner -verify "$aab" >/dev/null 2>&1; then
      echo "AAB signing OK (jarsigner): ${aab}" >&2
      return 0
    fi
  fi

  die "AAB appears unsigned: ${aab}

Play Console: \"All uploaded bundles must be signed.\"
Fix: ensure keystore.properties exists and release signingConfigs are injected, then rebuild:
  bash scripts/inject-android-signing.sh
  ./scripts/build-android.sh"
}

find_aab() {
  find "${ANDROID_DIR}/app/build/outputs/bundle" -name "*.aab" -print 2>/dev/null | head -1
}

find_apk() {
  find "${ANDROID_DIR}/app/build/outputs/apk" -name "*.apk" -print 2>/dev/null | head -1
}

# gen/android must be a real `tauri android init` tree (app/ + gradle), not an empty stub.
ensure_android_project() {
  local marker="${ANDROID_DIR}/app/src/main/AndroidManifest.xml"
  if [ -f "$marker" ]; then
    return 0
  fi

  echo "Android project missing — running tauri android init…" >&2
  if [ -d "$ANDROID_DIR" ] && [ ! -f "$marker" ]; then
    echo "Removing incomplete ${ANDROID_DIR} before android init…" >&2
    rm -rf "$ANDROID_DIR"
  fi

  [ -x "$TAURI_BIN" ] || TAURI_BIN="$(command -v tauri || true)"
  [ -n "$TAURI_BIN" ] || die "tauri CLI not found; run yarn install from repo root"

  (
    cd "$BRIDGE_DIR"
    "$TAURI_BIN" android init
  ) || die "tauri android init failed"

  [ -f "$marker" ] || die "tauri android init did not create ${marker}"
}

while [ $# -gt 0 ]; do
  case "$1" in
    --apk) BUILD_APK=1; shift ;;
    -h|--help) usage ;;
    --)
      shift
      while [ $# -gt 0 ]; do
        EXTRA_TAURI_ARGS="${EXTRA_TAURI_ARGS} $1"
        shift
      done
      break
      ;;
    *)
      EXTRA_TAURI_ARGS="${EXTRA_TAURI_ARGS} $1"
      shift
      ;;
  esac
done

[ -x "$TAURI_BIN" ] || TAURI_BIN="$(command -v tauri || true)"
[ -n "$TAURI_BIN" ] || die "tauri CLI not found; run yarn install from repo root"
ensure_android_project

_sdk="$(detect_android_home)" || die "Android SDK not found. Install Android Studio or set ANDROID_HOME."
export ANDROID_HOME="$_sdk"
export ANDROID_SDK_ROOT="$_sdk"
ensure_android_ndk "$_sdk"
bash "${ROOT}/scripts/ensure-tauri-cli-links.sh"
bash "${ROOT}/scripts/inject-android-manifest.sh"
bash "${ROOT}/scripts/inject-android-signing.sh"
echo "Syncing Android app icons..." >&2
bash "${ROOT}/scripts/sync-android-icons.sh"
write_keystore_properties

TAURI_LOCAL_CONF="$(lattice_env_write_tauri_local_config)"

echo "" >&2
echo "Android release build:" >&2
echo "  ANDROID_HOME=${ANDROID_HOME}" >&2
echo "  NDK_HOME=${NDK_HOME}" >&2
echo "  ANDROID_NDK_VERSION=${ANDROID_NDK_VERSION}" >&2
echo "  KEYSTORE=${KEYSTORE}" >&2
echo "  KEY_ALIAS=${KEY_ALIAS}" >&2
echo "  BUNDLE_ID=${APPLE_BUNDLE_ID}" >&2
echo "" >&2

cd "$BRIDGE_DIR"
_tauri_args="--aab"
if [ "$BUILD_APK" -eq 1 ]; then
  _tauri_args="--aab --apk"
fi

# shellcheck disable=SC2086
"$TAURI_BIN" android build ${_tauri_args} --config "$TAURI_LOCAL_CONF" ${EXTRA_TAURI_ARGS}

AAB_PATH="$(find_aab)"
[ -n "${AAB_PATH:-}" ] && [ -f "$AAB_PATH" ] || die "AAB not found under ${ANDROID_DIR}/app/build/outputs/bundle/"

assert_aab_signed "$AAB_PATH"
verify_16kb_native_libs

echo "AAB: ${AAB_PATH}" >&2

if [ "$BUILD_APK" -eq 1 ]; then
  APK_PATH="$(find_apk)"
  if [ -n "${APK_PATH:-}" ] && [ -f "$APK_PATH" ]; then
    echo "APK: ${APK_PATH}" >&2
  fi
fi

echo "Upload the .aab in Google Play Console → Release → Production (or internal testing)." >&2
echo "Done."
