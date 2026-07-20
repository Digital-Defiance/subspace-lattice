#!/usr/bin/env bash
# iOS App Store: archive → export signed .ipa (bash 3.2+).
#
# Tauri manual signing requires BOTH:
#   IOS_CERTIFICATE + IOS_CERTIFICATE_PASSWORD  (distribution .p12, base64)
#   IOS_MOBILE_PROVISION                        (App Store profile, base64)
# Without both, Tauri falls back to cloud signing and uses a placeholder
# "Apple Distribution: Tauri (unset)" cert — export will fail.
#
# Usage:
#   bash scripts/build-ios-appstore.sh
#   bash scripts/build-ios-appstore.sh --upload
# Prompts for the .p12 password (hidden). Set APPLE_IOS_CERTIFICATE_PASSWORD for CI.
#
# Prerequisites (Apple Developer):
#   - App ID matching APPLE_BUNDLE_ID (from .env)
#   - iOS App Store provisioning profile (APPLE_IOS_PROVISIONING_PROFILE)
#   - Apple Distribution .p12 (APPLE_IOS_CERTIFICATE)

set -e

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load ios
lattice_env_validate ios
lattice_env_cd_root

ROOT="$LATTICE_ROOT"

BRIDGE_DIR="${ROOT}/apps/desktop"
TAURI_DIR="${BRIDGE_DIR}/src-tauri"
APPLE_GEN_DIR="${TAURI_DIR}/gen/apple"
IPA_DIR="${APPLE_GEN_DIR}/build/arm64"
TAURI_BIN="${ROOT}/node_modules/.bin/tauri"
# Prefer process/.env APPLE_TEAM_ID (do not overwrite from tauri.conf).
APPLE_TEAM_ID="${APPLE_TEAM_ID}"
if [ -n "${APPLE_IOS_PROVISIONING_PROFILE:-}" ]; then
  PROVISION_PROFILE="$(lattice_env_abs_path "$APPLE_IOS_PROVISIONING_PROFILE")"
else
  PROVISION_PROFILE="${TAURI_DIR}/SubspaceLattice_iOS.mobileprovision"
fi
if [ -n "${APPLE_IOS_CERTIFICATE:-}" ]; then
  CERTIFICATE_P12="$(lattice_env_abs_path "$APPLE_IOS_CERTIFICATE")"
else
  CERTIFICATE_P12="${TAURI_DIR}/SubspaceLattice_iOS.p12"
fi
TAURI_LOCAL_CONF=""

UPLOAD=0
EXTRA_TAURI_ARGS=""

_SAVED_APPLE_API_KEY=""
_SAVED_APPLE_API_ISSUER=""
_SAVED_APPLE_API_KEY_PATH=""

disable_ios_cloud_signing_env() {
  # API keys enable Tauri's cloud signing path, which uses a placeholder cert and
  # looks for "iOS Distribution" instead of your Apple Distribution identity.
  _SAVED_APPLE_API_KEY="${APPLE_API_KEY:-}"
  _SAVED_APPLE_API_ISSUER="${APPLE_API_ISSUER:-}"
  _SAVED_APPLE_API_KEY_PATH="${APPLE_API_KEY_PATH:-}"
  unset APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH
}

restore_ios_cloud_signing_env() {
  [ -n "${_SAVED_APPLE_API_KEY:-}" ] && export APPLE_API_KEY="$_SAVED_APPLE_API_KEY"
  [ -n "${_SAVED_APPLE_API_ISSUER:-}" ] && export APPLE_API_ISSUER="$_SAVED_APPLE_API_ISSUER"
  [ -n "${_SAVED_APPLE_API_KEY_PATH:-}" ] && export APPLE_API_KEY_PATH="$_SAVED_APPLE_API_KEY_PATH"
}

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/build-ios-appstore.sh [OPTIONS] [-- extra tauri ios build args...]

  --upload         Upload the .ipa to App Store Connect (altool + API key)
  --help           Show this help

Required local files (gitignored):
  apps/desktop/src-tauri/SubspaceLattice_iOS.mobileprovision   iOS App Store profile
  apps/desktop/src-tauri/SubspaceLattice_iOS.p12               Apple Distribution cert

Optional environment:
  APPLE_IOS_CERTIFICATE_PASSWORD    .p12 password (prompted if unset)

Optional overrides:
  APPLE_IOS_PROVISIONING_PROFILE    Path to .mobileprovision
  APPLE_IOS_CERTIFICATE             Path to .p12
  APPLE_TEAM_ID / APPLE_BUNDLE_ID / APPLE_PUBLISHER_NAME  (required; see .env.example)

Upload (--upload) also requires:
  APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH

Output:
  apps/desktop/src-tauri/gen/apple/build/arm64/<Product Name>.ipa
EOF
  exit 1
}

read_product_name() {
  node -e "
    const j = require(process.argv[1]);
    process.stdout.write(String(j.productName || 'Subspace Lattice'));
  " "${TAURI_DIR}/tauri.conf.json"
}

read_bundle_identifier() {
  if [ -n "${APPLE_BUNDLE_ID:-}" ]; then
    printf '%s' "$APPLE_BUNDLE_ID"
    return 0
  fi
  die "APPLE_BUNDLE_ID is required (set in process ENV or .env — see .env.example)"
}

SIGNING_KEYCHAIN=""
SIGNING_KEYCHAIN_DIR=""
_SAVED_KEYCHAINS=""

delete_temp_keychain() {
  local kc="$1"
  local dir="$2"
  if [ -n "$kc" ]; then
    security delete-keychain "$kc" >/dev/null 2>&1 || true
  fi
  if [ -n "$dir" ] && [ -d "$dir" ]; then
    rm -rf "$dir"
  fi
}

restore_signing_keychain() {
  if [ -n "${_SAVED_KEYCHAINS:-}" ]; then
    # shellcheck disable=SC2086
    security list-keychains -s ${_SAVED_KEYCHAINS} >/dev/null 2>&1 || true
  fi
  delete_temp_keychain "$SIGNING_KEYCHAIN" "$SIGNING_KEYCHAIN_DIR"
  SIGNING_KEYCHAIN=""
  SIGNING_KEYCHAIN_DIR=""
}

prepare_signing_keychain() {
  _SAVED_KEYCHAINS="$(security list-keychains | sed 's/^[[:space:]]*"//;s/"$//;s/" "/ /g')"
  SIGNING_KEYCHAIN_DIR="$(mktemp -d -t lattice-sign.XXXXXX)" || die "failed to create temp directory for signing keychain"
  SIGNING_KEYCHAIN="${SIGNING_KEYCHAIN_DIR}/signing.keychain-db"
  security delete-keychain "$SIGNING_KEYCHAIN" >/dev/null 2>&1 || true
  security create-keychain -p "" "$SIGNING_KEYCHAIN" >/dev/null || die "failed to create signing keychain at ${SIGNING_KEYCHAIN}"
  security set-keychain-settings -lut 3600 "$SIGNING_KEYCHAIN" >/dev/null
  security unlock-keychain -p "" "$SIGNING_KEYCHAIN" >/dev/null
  security import "$CERTIFICATE_P12" -k "$SIGNING_KEYCHAIN" \
    -P "$APPLE_IOS_CERTIFICATE_PASSWORD" \
    -A \
    -T /usr/bin/codesign \
    -T /usr/bin/xcodebuild \
    -T /usr/bin/security >/dev/null || die "failed to import ${CERTIFICATE_P12} into signing keychain"
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" "$SIGNING_KEYCHAIN" >/dev/null
  # shellcheck disable=SC2086
  security list-keychains -s "$SIGNING_KEYCHAIN" ${_SAVED_KEYCHAINS} >/dev/null
  trap restore_signing_keychain EXIT
  echo "Imported distribution certificate into build keychain." >&2
}

write_export_options_plist() {
  local profile_name="$1"
  local bundle_id="$2"
  local export_plist="${APPLE_GEN_DIR}/ExportOptions.plist"
  cat > "$export_plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>${APPLE_TEAM_ID}</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>signingCertificate</key>
  <string>Apple Distribution</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>${bundle_id}</key>
    <string>${profile_name}</string>
  </dict>
</dict>
</plist>
EOF
  echo "Wrote export options → ${export_plist}" >&2
}

assert_manual_signing_env() {
  if [ -z "${IOS_CERTIFICATE:-}" ] || [ "${#IOS_CERTIFICATE}" -lt 100 ]; then
    die "IOS_CERTIFICATE was not loaded. Run: yarn build:ios-appstore"
  fi
  if [ -z "${IOS_MOBILE_PROVISION:-}" ] || [ "${#IOS_MOBILE_PROVISION}" -lt 100 ]; then
    die "IOS_MOBILE_PROVISION was not loaded. Run: yarn build:ios-appstore"
  fi
  if [ -z "${IOS_CERTIFICATE_PASSWORD:-}" ]; then
    die "IOS_CERTIFICATE_PASSWORD was not loaded. Run: yarn build:ios-appstore"
  fi
}

profile_plist_value() {
  local key="$1" file="$2"
  security cms -D -i "$file" 2>/dev/null | plutil -extract "$key" raw - 2>/dev/null || true
}

profile_platforms() {
  local file="$1"
  security cms -D -i "$file" 2>/dev/null | plutil -extract Platform json -o - - 2>/dev/null || true
}

ensure_provisioning_profile() {
  [ -f "$PROVISION_PROFILE" ] || die "iOS App Store provisioning profile not found: ${PROVISION_PROFILE}

Create one at https://developer.apple.com/account/resources/profiles/list
  1. Profiles → + → Distribution → App Store Connect (iOS — not Mac)
  2. App ID → ${APPLE_BUNDLE_ID}
  3. Certificate → Apple Distribution: ${APPLE_PUBLISHER_NAME}
  4. Download and save as:
       ${PROVISION_PROFILE}

This is separate from the Mac App Store provisioning profile."

  local platforms app_id name uuid dest
  platforms="$(profile_platforms "$PROVISION_PROFILE")"
  app_id="$(profile_plist_value Entitlements.application-identifier "$PROVISION_PROFILE")"
  name="$(profile_plist_value Name "$PROVISION_PROFILE")"

  case "$platforms" in
    *IOS*|*iOS*|*iphoneos*) ;;
    *OSX*|*macOS*)
      die "Profile is for macOS, not iOS: ${PROVISION_PROFILE}"
      ;;
    *)
      die "Could not verify iOS platform for profile: ${PROVISION_PROFILE}
Platforms: ${platforms:-unknown}"
      ;;
  esac

  case "$app_id" in
    *"${APPLE_BUNDLE_ID}") ;;
    *)
      die "Profile App ID mismatch (expected ${APPLE_BUNDLE_ID}): ${app_id:-unknown}"
      ;;
  esac

  uuid="$(profile_plist_value UUID "$PROVISION_PROFILE")"
  [ -n "$uuid" ] || die "Could not read UUID from ${PROVISION_PROFILE}"
  dest="${HOME}/Library/MobileDevice/Provisioning Profiles/${uuid}.mobileprovision"
  mkdir -p "${HOME}/Library/MobileDevice/Provisioning Profiles"
  cp "$PROVISION_PROFILE" "$dest"
  echo "Installed iOS profile: ${name:-$uuid}" >&2

  IOS_MOBILE_PROVISION="$(base64 < "$PROVISION_PROFILE" | tr -d '\n')"
  export IOS_MOBILE_PROVISION
}

prompt_certificate_password() {
  if [ -n "${APPLE_IOS_CERTIFICATE_PASSWORD:-}" ]; then
    return 0
  fi

  local tty=/dev/tty attempt=1
  if [ ! -r "$tty" ]; then
    die "No TTY available to prompt for .p12 password.
Set APPLE_IOS_CERTIFICATE_PASSWORD for non-interactive builds."
  fi

  while [ "$attempt" -le 2 ]; do
    if [ "$attempt" -eq 1 ]; then
      printf 'P12 export password: ' >"$tty"
    else
      printf 'P12 export password (retry): ' >"$tty"
    fi
    APPLE_IOS_CERTIFICATE_PASSWORD=""
    read -rs APPLE_IOS_CERTIFICATE_PASSWORD <"$tty" || true
    printf '\n' >"$tty"
    [ -n "${APPLE_IOS_CERTIFICATE_PASSWORD:-}" ] || die "Password cannot be empty."
    if verify_certificate_password; then
      return 0
    fi
    attempt=$((attempt + 1))
  done

  die "Could not unlock ${CERTIFICATE_P12}.

Common fixes:
  - Re-export: select the certificate AND its private key (both rows) before Export
  - Use Apple Distribution: ${APPLE_PUBLISHER_NAME} (${APPLE_TEAM_ID}), not iOS Distribution
  - Try a simpler export password (letters/numbers only), then re-export
  - Skip this check: APPLE_IOS_SKIP_P12_VERIFY=1 yarn build:ios-appstore"
}

verify_certificate_password() {
  if [ "${APPLE_IOS_SKIP_P12_VERIFY:-0}" = "1" ]; then
    echo "Skipping .p12 verification (APPLE_IOS_SKIP_P12_VERIFY=1)." >&2
    return 0
  fi

  local kc_dir kc err_file
  err_file="$(mktemp -t lattice-verify-err.XXXXXX)"
  kc_dir="$(mktemp -d -t lattice-verify.XXXXXX)" || return 1
  kc="${kc_dir}/verify.keychain-db"
  security delete-keychain "$kc" >/dev/null 2>&1 || true
  if ! security create-keychain -p "" "$kc" >/dev/null 2>&1; then
    rm -rf "$kc_dir"
    rm -f "$err_file"
    return 1
  fi
  security set-keychain-settings -lut 21600 "$kc" >/dev/null 2>&1 || true
  security unlock-keychain -p "" "$kc" >/dev/null 2>&1 || true

  if security import "$CERTIFICATE_P12" -k "$kc" \
    -P "$APPLE_IOS_CERTIFICATE_PASSWORD" \
    -A \
    -T /usr/bin/codesign \
    -T /usr/bin/security \
    >"$err_file" 2>&1; then
    delete_temp_keychain "$kc" "$kc_dir"
    rm -f "$err_file"
    return 0
  fi

  # OpenSSL 3 often needs -legacy for Keychain-exported .p12 files.
  if command -v openssl >/dev/null 2>&1; then
    IOS_P12_PASS="$APPLE_IOS_CERTIFICATE_PASSWORD"
    export IOS_P12_PASS
    if openssl pkcs12 -legacy -in "$CERTIFICATE_P12" \
      -passin env:IOS_P12_PASS -nokeys -noout >/dev/null 2>&1 \
      || openssl pkcs12 -in "$CERTIFICATE_P12" \
      -passin env:IOS_P12_PASS -nokeys -noout >/dev/null 2>&1; then
      unset IOS_P12_PASS
      delete_temp_keychain "$kc" "$kc_dir"
      rm -f "$err_file"
      return 0
    fi
    unset IOS_P12_PASS
  fi

  if [ -s "$err_file" ]; then
    echo "Could not unlock .p12:" >&2
    sed 's/^/  /' "$err_file" >&2
  fi
  delete_temp_keychain "$kc" "$kc_dir"
  rm -f "$err_file"
  return 1
}

ensure_distribution_certificate() {
  [ -f "$CERTIFICATE_P12" ] || die "Apple Distribution .p12 not found: ${CERTIFICATE_P12}

Export from Keychain Access (one-time):
  1. Keychain Access → My Certificates
  2. Expand \"Apple Distribution: ${APPLE_PUBLISHER_NAME} (${APPLE_TEAM_ID})\"
  3. Select the certificate AND its private key (both highlighted)
  4. File → Export Items… → Personal Information Exchange (.p12)
  5. Save as: ${CERTIFICATE_P12}
  6. Run this script — it will prompt for that password

Or set APPLE_IOS_CERTIFICATE to another .p12 path."

  prompt_certificate_password
  # verify runs inside prompt (with retry); skip second check when password came from env.
  if [ -n "${APPLE_IOS_CERTIFICATE_PASSWORD:-}" ] && ! verify_certificate_password; then
    die "Could not unlock ${CERTIFICATE_P12}. Check APPLE_IOS_CERTIFICATE_PASSWORD."
  fi

  IOS_CERTIFICATE="$(base64 < "$CERTIFICATE_P12" | tr -d '\n')"
  IOS_CERTIFICATE_PASSWORD="$APPLE_IOS_CERTIFICATE_PASSWORD"
  export IOS_CERTIFICATE IOS_CERTIFICATE_PASSWORD
  echo "Using distribution certificate: ${CERTIFICATE_P12}" >&2
}

find_ipa() {
  local product="$1"
  local candidates=(
    "${IPA_DIR}/${product}.ipa"
    "${APPLE_GEN_DIR}/build/${product}.ipa"
  )
  local c
  for c in "${candidates[@]}"; do
    if [ -f "$c" ]; then
      printf '%s' "$c"
      return 0
    fi
  done
  find "${APPLE_GEN_DIR}/build" -name "*.ipa" -print 2>/dev/null | head -1
}

upload_ipa() {
  local ipa="$1"
  [ -f "$ipa" ] || die "IPA not found: ${ipa}"
  [ -n "${APPLE_API_KEY:-}" ] || die "--upload requires APPLE_API_KEY"
  [ -n "${APPLE_API_ISSUER:-}" ] || die "--upload requires APPLE_API_ISSUER"
  [ -n "${APPLE_API_KEY_PATH:-}" ] || die "--upload requires APPLE_API_KEY_PATH"

  echo "Uploading ${ipa} to App Store Connect..." >&2
  xcrun altool --upload-app \
    -f "$ipa" \
    -t ios \
    --apiKey "$APPLE_API_KEY" \
    --apiIssuer "$APPLE_API_ISSUER"
  echo "Upload complete. Check App Store Connect → TestFlight." >&2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --upload) UPLOAD=1; shift ;;
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

if [ "$(uname -s)" != "Darwin" ]; then
  die "iOS App Store build must run on macOS"
fi

[ -x "$TAURI_BIN" ] || TAURI_BIN="$(command -v tauri || true)"
[ -n "$TAURI_BIN" ] || die "tauri CLI not found; run yarn install from repo root"

PRODUCT_NAME="$(read_product_name)"
BUNDLE_ID="$(read_bundle_identifier)"
ensure_provisioning_profile
ensure_distribution_certificate
prepare_signing_keychain

PROFILE_NAME="$(profile_plist_value Name "$PROVISION_PROFILE")"
write_export_options_plist "${PROFILE_NAME:-Subspace Lattice App Store}" "$BUNDLE_ID"
assert_manual_signing_env

export APPLE_DEVELOPMENT_TEAM="$APPLE_TEAM_ID"

echo "" >&2
echo "iOS App Store build:" >&2
echo "  PRODUCT_NAME=${PRODUCT_NAME}" >&2
echo "  APPLE_TEAM_ID=${APPLE_TEAM_ID}" >&2
echo "  BUNDLE_ID=${BUNDLE_ID}" >&2
echo "  PROFILE_NAME=${PROFILE_NAME:-unknown}" >&2
echo "  PROVISIONING_PROFILE=${PROVISION_PROFILE}" >&2
echo "  CERTIFICATE=${CERTIFICATE_P12}" >&2
echo "  IOS_CERTIFICATE_BYTES=${#IOS_CERTIFICATE}" >&2
echo "  IOS_MOBILE_PROVISION_BYTES=${#IOS_MOBILE_PROVISION}" >&2
echo "  SIGNING=manual (Apple Distribution)" >&2
echo "" >&2

echo "Building frontend..." >&2
yarn build:all

TAURI_LOCAL_CONF="$(lattice_env_write_tauri_local_config)"

echo "Syncing iOS app icons..." >&2
bash "${ROOT}/scripts/sync-ios-icons.sh"
bash "${ROOT}/scripts/ensure-tauri-cli-links.sh"

echo "Injecting iOS code signing into Xcode project..." >&2
bash "${ROOT}/scripts/inject-ios-signing.sh"
bash "${ROOT}/scripts/inject-ios-oauth-plist.sh"

echo "Archiving and exporting iOS .ipa (manual signing)..." >&2
cd "$BRIDGE_DIR"
disable_ios_cloud_signing_env
# Tauri corrupts project.pbxproj when IOS_* env vars are set (issue #14462).
# Signing is injected above; cert/profile come from the build keychain + installed profile.
unset IOS_CERTIFICATE IOS_CERTIFICATE_PASSWORD IOS_MOBILE_PROVISION
_tauri_status=0
# shellcheck disable=SC2086
"$TAURI_BIN" ios build \
  --export-method app-store-connect \
  --config "$TAURI_LOCAL_CONF" \
  ${EXTRA_TAURI_ARGS} || _tauri_status=$?
restore_ios_cloud_signing_env
[ "$_tauri_status" -eq 0 ] || exit "$_tauri_status"

IPA_PATH="$(find_ipa "$PRODUCT_NAME")"
[ -n "${IPA_PATH:-}" ] && [ -f "$IPA_PATH" ] || die "IPA not found under ${APPLE_GEN_DIR}/build/"

echo "IPA: ${IPA_PATH}" >&2

if [ "$UPLOAD" -eq 1 ]; then
  upload_ipa "$IPA_PATH"
fi

echo "Done."
