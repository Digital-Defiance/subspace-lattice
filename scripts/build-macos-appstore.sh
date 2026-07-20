#!/usr/bin/env bash
# Mac App Store: universal .app → re-sign → signed .pkg (bash 3.2+).
#
# Separate from scripts/build-macos.sh (Developer ID + notarized DMG).
#
# Usage:
#   bash scripts/build-macos-appstore.sh
#   bash scripts/build-macos-appstore.sh 0.2.0
#   bash scripts/build-macos-appstore.sh --version 0.2.0 --upload
#   NONINTERACTIVE=1 bash scripts/build-macos-appstore.sh 0.1.0
#
# Prerequisites (Apple Developer):
#   - App ID matching APPLE_BUNDLE_ID (from .env) with App Sandbox
#   - Mac App Store provisioning profile (APPLE_PROVISIONING_PROFILE)
#   - Apple Distribution certificate (codesign .app)
#   - 3rd Party Mac Developer Installer certificate (productbuild .pkg)
#
# Upload (--upload): App Store Connect API key (APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH).
# Those API vars must NOT be set during `tauri build` — Tauri would try Developer ID notarization.

set -e

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load macos-appstore
lattice_env_validate macos-appstore
lattice_env_cd_root

ROOT="$LATTICE_ROOT"

# Stashed notarization env (restored after tauri build; needed again for --upload).
_SAVED_APPLE_ID=""
_SAVED_APPLE_PASSWORD=""
_SAVED_APPLE_API_KEY=""
_SAVED_APPLE_API_ISSUER=""
_SAVED_APPLE_API_KEY_PATH=""
_SAVED_APPLE_PROVIDER_SHORT_NAME=""

BRIDGE_DIR="${ROOT}/apps/desktop"
TAURI_DIR="${BRIDGE_DIR}/src-tauri"
PKG_JSON="${BRIDGE_DIR}/package.json"
TAURI_CONF="${TAURI_DIR}/tauri.conf.json"
CARGO_TOML="${TAURI_DIR}/Cargo.toml"
APP_BUNDLE_DIR="${TAURI_DIR}/target/universal-apple-darwin/release/bundle/macos"
PKG_OUT_DIR="${TAURI_DIR}/target/universal-apple-darwin/release/bundle/pkg"
ENTITLEMENTS_TEMPLATE="${TAURI_DIR}/Entitlements.AppStore.plist.in"
ENTITLEMENTS_PLIST="${TAURI_DIR}/Entitlements.plist"
_default_provision="${TAURI_DIR}/SubspaceLattice.provisionprofile"
if [ -n "${APPLE_PROVISIONING_PROFILE:-}" ]; then
  PROVISION_PROFILE="$(lattice_env_abs_path "$APPLE_PROVISIONING_PROFILE")"
else
  PROVISION_PROFILE="$_default_provision"
fi
TAURI_BIN="${ROOT}/node_modules/.bin/tauri"
# Required via lattice_env_validate; do not hardcode a team id.
APPLE_TEAM_ID="${APPLE_TEAM_ID}"

EXTRA_TAURI_ARGS=""
APP_VERSION=""
UPLOAD=0
SKIP_BUILD=0
SKIP_RESIGN=0
TAURI_LOCAL_CONF=""

die() {
  echo "error: $*" >&2
  exit 1
}

usage() {
  cat >&2 <<'EOF'
Usage: bash scripts/build-macos-appstore.sh [OPTIONS] [VERSION] [-- extra tauri build args...]

  VERSION          Semver (default: apps/desktop/package.json "version").
                   Updates package.json, tauri.conf.json, Cargo.toml.
  --version VER    Same as positional VERSION (v0.1.0 accepted; leading v stripped)
  --upload         Upload the .pkg to App Store Connect (Transporter API via altool)
  --skip-build     Skip yarn/tauri build; re-sign and package an existing .app
  --skip-resign    Skip manual codesign + productbuild (tauri .app only)

Environment (set before build or enter when prompted):

  APPLE_TEAM_ID                  10-char team id (App ID Prefix)
  APPLE_SIGNING_IDENTITY   Apple Distribution: … (TEAMID) — matched from provisioning profile
  APPLE_INSTALLER_IDENTITY       3rd Party Mac Developer Installer: … (TEAMID)
  APPLE_PROVISIONING_PROFILE     default apps/desktop/src-tauri/SubspaceLattice.provisionprofile

  Upload (--upload)
    APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH
    (saved/restored around tauri build — App Store .app is not Developer ID notarized)

Output:
  apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/<productName>.app
  apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/pkg/<productName>_<version>.pkg
EOF
  exit 1
}

looks_like_version() {
  case "$1" in
    v[0-9]*.[0-9]*.[0-9]**) return 0 ;;
    [0-9]*.[0-9]*.[0-9]**) return 0 ;;
    *) return 1 ;;
  esac
}

normalize_version() {
  printf '%s' "$1" | sed 's/^v//'
}

read_product_name() {
  [ -f "$TAURI_CONF" ] || die "missing ${TAURI_CONF}"
  node -e "
    const j = require(process.argv[1]);
    process.stdout.write(String(j.productName || 'Subspace Lattice'));
  " "$TAURI_CONF"
}

read_bundle_identifier() {
  if [ -n "${APPLE_BUNDLE_ID:-}" ]; then
    printf '%s' "$APPLE_BUNDLE_ID"
    return 0
  fi
  [ -f "$TAURI_CONF" ] || die "missing ${TAURI_CONF}"
  node -e "
    const j = require(process.argv[1]);
    const id = String(j.identifier || '');
    if (!id || id === 'org.digitaldefiance.app.subspacelattice' || id === 'com.digitaldefiance.subspacelattice') {
      console.error('error: set APPLE_BUNDLE_ID in .env (see .env.example)');
      process.exit(1);
    }
    process.stdout.write(id);
  " "$TAURI_CONF"
}

read_version_from_package_json() {
  if [ ! -f "$PKG_JSON" ]; then
    return 1
  fi
  node -e "const p=require(process.argv[1]); if(p.version) process.stdout.write(String(p.version));" "$PKG_JSON" 2>/dev/null
}

apply_app_version() {
  _ver="$1"
  if [ -z "$_ver" ]; then
    die "empty version"
  fi
  if ! looks_like_version "$_ver" && ! looks_like_version "v${_ver}"; then
    die "invalid semver: ${_ver} (expected e.g. 0.1.0 or v0.1.0)"
  fi
  _ver="$(normalize_version "$_ver")"
  command -v node >/dev/null 2>&1 || die "node is required to set app version"

  echo "Setting app version to ${_ver} (package.json, tauri.conf.json, Cargo.toml, mobile build codes)..." >&2
  node "${ROOT}/scripts/app-version.mjs" set "$_ver" >/dev/null || die "failed to set app version"

  APP_VERSION="$_ver"
  export APP_VERSION
}

resolve_app_version() {
  if [ -n "${APP_VERSION:-}" ]; then
    APP_VERSION="$(normalize_version "$APP_VERSION")"
    return 0
  fi
  _from_pkg="$(read_version_from_package_json || true)"
  if [ -n "$_from_pkg" ]; then
    APP_VERSION="$(normalize_version "$_from_pkg")"
    return 0
  fi
  die "could not determine version; pass 0.1.0 or set apps/desktop/package.json version"
}

is_interactive() {
  [ -z "${CI:-}" ] && [ "${NONINTERACTIVE:-}" != "1" ]
}

prompt_nonempty() {
  var_name="$1"
  prompt_text="$2"
  value=""
  while [ -z "$value" ]; do
    read -r -p "${prompt_text}: " value
    value="$(printf '%s' "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  done
  eval "$var_name=\$value"
  export "$var_name"
}

infer_team_from_identity() {
  _identity="$1"
  _var="$2"
  eval "_current=\${${_var}:-}"
  if [ -n "$_current" ]; then
    return 0
  fi
  _team="$(printf '%s' "$_identity" | sed -n 's/.*(\([A-Z0-9][A-Z0-9]*\)).*/\1/p' | head -1)"
  if [ -n "$_team" ]; then
    eval "$_var=\$_team"
    export "$_var"
    echo "${_var}: inferred ${_team} from signing identity." >&2
  fi
}

filter_identities_for_team() {
  _team="${APPLE_TEAM_ID:-}"
  if [ -n "$_team" ]; then
    grep "(${_team})" || true
  else
    cat
  fi
}

disable_tauri_notarization_env() {
  echo "Skipping Tauri notarization (Mac App Store uses Apple Distribution, not Developer ID)." >&2
  _SAVED_APPLE_ID="${APPLE_ID:-}"
  _SAVED_APPLE_PASSWORD="${APPLE_PASSWORD:-}"
  _SAVED_APPLE_API_KEY="${APPLE_API_KEY:-}"
  _SAVED_APPLE_API_ISSUER="${APPLE_API_ISSUER:-}"
  _SAVED_APPLE_API_KEY_PATH="${APPLE_API_KEY_PATH:-}"
  _SAVED_APPLE_PROVIDER_SHORT_NAME="${APPLE_PROVIDER_SHORT_NAME:-}"
  _SAVED_APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:-}"
  unset APPLE_ID APPLE_PASSWORD APPLE_API_KEY APPLE_API_ISSUER APPLE_API_KEY_PATH APPLE_PROVIDER_SHORT_NAME
  unset APPLE_SIGNING_IDENTITY
}

restore_notarization_env() {
  if [ -n "$_SAVED_APPLE_ID" ]; then export APPLE_ID="$_SAVED_APPLE_ID"; else unset APPLE_ID; fi
  if [ -n "$_SAVED_APPLE_PASSWORD" ]; then export APPLE_PASSWORD="$_SAVED_APPLE_PASSWORD"; else unset APPLE_PASSWORD; fi
  if [ -n "$_SAVED_APPLE_API_KEY" ]; then export APPLE_API_KEY="$_SAVED_APPLE_API_KEY"; else unset APPLE_API_KEY; fi
  if [ -n "$_SAVED_APPLE_API_ISSUER" ]; then export APPLE_API_ISSUER="$_SAVED_APPLE_API_ISSUER"; else unset APPLE_API_ISSUER; fi
  if [ -n "$_SAVED_APPLE_API_KEY_PATH" ]; then export APPLE_API_KEY_PATH="$_SAVED_APPLE_API_KEY_PATH"; else unset APPLE_API_KEY_PATH; fi
  if [ -n "$_SAVED_APPLE_PROVIDER_SHORT_NAME" ]; then export APPLE_PROVIDER_SHORT_NAME="$_SAVED_APPLE_PROVIDER_SHORT_NAME"; else unset APPLE_PROVIDER_SHORT_NAME; fi
  # App Store signing identity always comes from the provisioning profile after the Tauri build.
  unset APPLE_SIGNING_IDENTITY
}

list_distribution_identities() {
  security find-identity -p codesigning 2>/dev/null \
    | egrep 'Apple Distribution:|3rd Party Mac Developer Application:' \
    | sed -n 's/.*"\([^"]*\)".*/\1/p' \
    | sort -u \
    | filter_identities_for_team
}

profile_plist_path() {
  _profile="$1"
  _out="$2"
  security cms -D -i "$_profile" > "$_out" 2>/dev/null
}

profile_team_id() {
  _profile="$1"
  python3 - "$_profile" <<'PY'
import plistlib
import subprocess
import sys

profile = sys.argv[1]
plist = subprocess.check_output(["security", "cms", "-D", "-i", profile])
data = plistlib.loads(plist)
teams = data.get("TeamIdentifier") or []
if teams:
    print(teams[0])
PY
}

profile_signing_cert_hash() {
  _profile="$1"
  python3 - "$_profile" <<'PY'
import hashlib
import plistlib
import subprocess
import sys

profile = sys.argv[1]
plist = subprocess.check_output(["security", "cms", "-D", "-i", profile])
data = plistlib.loads(plist)
certs = data.get("DeveloperCertificates") or []
if not certs:
    sys.exit(1)
print(hashlib.sha1(certs[0]).hexdigest().upper())
PY
}

profile_signing_identity_name() {
  _profile="$1"
  python3 - "$_profile" <<'PY'
import plistlib
import subprocess
import sys

profile = sys.argv[1]
plist = subprocess.check_output(["security", "cms", "-D", "-i", profile])
data = plistlib.loads(plist)
certs = data.get("DeveloperCertificates") or []
if not certs:
    sys.exit(1)
subject = subprocess.check_output(
    ["openssl", "x509", "-inform", "DER", "-subject", "-noout"],
    input=certs[0],
    text=True,
).strip()
for token in subject.split("/"):
    if token.startswith("CN="):
        print(token[3:])
        break
PY
}

identity_name_for_hash() {
  _want="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
  security find-identity -p codesigning -v 2>/dev/null \
    | grep "$_want" \
    | sed -n 's/.*"\([^"]*\)".*/\1/p' \
    | head -1
}

signing_identity_from_provisioning_profile() {
  _profile="$1"
  _hash="$(profile_signing_cert_hash "$_profile")" || return 1
  [ -n "$_hash" ] || return 1
  _identity="$(identity_name_for_hash "$_hash")"
  if [ -n "$_identity" ]; then
    printf '%s' "$_identity"
    return 0
  fi
  profile_signing_identity_name "$_profile"
}

reject_developer_id_signing_identity() {
  case "${APPLE_SIGNING_IDENTITY:-}" in
    "Developer ID Application:"*)
      echo "warning: ignoring Developer ID APPLE_SIGNING_IDENTITY for Mac App Store builds." >&2
      unset APPLE_SIGNING_IDENTITY
      ;;
  esac
}

ensure_app_store_signing_identity() {
  reject_developer_id_signing_identity

  _profile_identity="$(signing_identity_from_provisioning_profile "$PROVISION_PROFILE" || true)"
  if [ -n "$_profile_identity" ]; then
    if [ -n "${APPLE_SIGNING_IDENTITY:-}" ]; then
      _current="$APPLE_SIGNING_IDENTITY"
      if is_signing_hash "$_current"; then
        _current="$(identity_name_for_hash "$_current")"
      fi
      if [ "$_current" != "$_profile_identity" ]; then
        echo "warning: APPLE_SIGNING_IDENTITY does not match the provisioning profile certificate." >&2
        echo "  profile: ${_profile_identity}" >&2
        echo "  current: ${APPLE_SIGNING_IDENTITY}" >&2
        echo "Using the provisioning profile certificate for App Store signing." >&2
      fi
    fi
    APPLE_SIGNING_IDENTITY="$_profile_identity"
    export APPLE_SIGNING_IDENTITY
    _profile_team="$(profile_team_id "$PROVISION_PROFILE" || true)"
    if [ -n "$_profile_team" ]; then
      if [ -n "${APPLE_TEAM_ID:-}" ] && [ "$APPLE_TEAM_ID" != "$_profile_team" ]; then
        echo "warning: APPLE_TEAM_ID=${APPLE_TEAM_ID} does not match provisioning profile team ${_profile_team}; using profile team." >&2
      fi
      APPLE_TEAM_ID="$_profile_team"
      export APPLE_TEAM_ID
    else
      infer_team_from_identity "$_profile_identity" APPLE_TEAM_ID
    fi
    echo "APPLE_SIGNING_IDENTITY: matched provisioning profile (${APPLE_SIGNING_IDENTITY})" >&2
    return 0
  fi

  _profile_cn="$(profile_signing_identity_name "$PROVISION_PROFILE" || true)"
  die "could not find the provisioning profile signing certificate in your keychain.
Expected: ${_profile_cn:-Apple Distribution certificate for ${APPLE_TEAM_ID}}
Installed App Store identities:
$(list_distribution_identities | sed 's/^/  /')"
}

list_installer_identities() {
  # Installer certs are not code-signing identities; do not use -p codesigning.
  security find-identity 2>/dev/null \
    | grep '3rd Party Mac Developer Installer:' \
    | sed -n 's/.*"\(3rd Party Mac Developer Installer:[^"]*\)".*/\1/p' \
    | sort -u \
    | filter_identities_for_team
}

is_signing_hash() {
  [ "$(printf '%s' "$1" | wc -c | tr -d ' ')" -eq 40 ] \
    && printf '%s' "$1" | grep -Eq '^[A-F0-9]{40}$'
}

installer_common_name() {
  security find-identity 2>/dev/null \
    | grep '3rd Party Mac Developer Installer:' \
    | filter_identities_for_team \
    | sed -n 's/.*"\(3rd Party Mac Developer Installer:[^"]*\)".*/\1/p' \
    | head -1
}

cert_end_epoch() {
  _pem="$1"
  _end="$(openssl x509 -in "$_pem" -noout -enddate 2>/dev/null | cut -d= -f2-)"
  [ -n "$_end" ] || return 1
  date -j -f "%b %d %H:%M:%S %Y %Z" "$_end" "+%s" 2>/dev/null \
    || date -d "$_end" "+%s" 2>/dev/null \
    || return 1
}

cert_sha1_hash() {
  _pem="$1"
  openssl x509 -in "$_pem" -outform DER 2>/dev/null | openssl dgst -sha1 2>/dev/null | awk '{print toupper($2)}'
}

split_certs_pem_to_dir() {
  _cn="$1"
  _dir="$2"
  python3 - "$_cn" "$_dir" <<'PY'
import subprocess, re, sys, os
cn, out_dir = sys.argv[1], sys.argv[2]
try:
    pem = subprocess.check_output(
        ["security", "find-certificate", "-a", "-c", cn, "-p", "login.keychain-db"],
        stderr=subprocess.DEVNULL,
    )
except subprocess.CalledProcessError:
    sys.exit(0)
for i, block in enumerate(
    re.findall(rb"-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----", pem, re.S), 1
):
    with open(os.path.join(out_dir, f"c{i}.pem"), "wb") as f:
        f.write(block + b"\n")
PY
}

describe_installer_hash() {
  _hash="$1"
  _pem="$(_installer_pem_for_hash "$_hash")" || return 1
  _serial="$(openssl x509 -in "$_pem" -noout -serial 2>/dev/null | sed 's/serial=//')"
  _end="$(openssl x509 -in "$_pem" -noout -enddate 2>/dev/null | cut -d= -f2-)"
  echo "  ${_hash}  serial=${_serial}  expires=${_end}" >&2
}

_installer_pem_for_hash() {
  _want="$1"
  _cn="$(installer_common_name)" || return 1
  _tmpdir="$(mktemp -d -t w12-cert.XXXXXX)"
  split_certs_pem_to_dir "$_cn" "$_tmpdir"
  for _pem in "$_tmpdir"/c*.pem; do
    [ -f "$_pem" ] || continue
    _hash="$(cert_sha1_hash "$_pem")"
    if [ "$_hash" = "$_want" ]; then
      cat "$_pem"
      rm -rf "$_tmpdir"
      return 0
    fi
  done
  rm -rf "$_tmpdir"
  return 1
}

resolve_installer_signing_identity() {
  if is_signing_hash "${APPLE_INSTALLER_IDENTITY:-}"; then
    echo "APPLE_INSTALLER_IDENTITY: using hash ${APPLE_INSTALLER_IDENTITY}" >&2
    describe_installer_hash "$APPLE_INSTALLER_IDENTITY" || true
    return 0
  fi

  _cn="$(installer_common_name)" || die "no 3rd Party Mac Developer Installer certificate for team ${APPLE_TEAM_ID}"
  _tmpdir="$(mktemp -d -t w12-cert.XXXXXX)"
  split_certs_pem_to_dir "$_cn" "$_tmpdir"

  _best_hash=""
  _best_epoch=0
  _count=0
  for _pem in "$_tmpdir"/c*.pem; do
    [ -f "$_pem" ] || continue
    _count=$((_count + 1))
    _hash="$(cert_sha1_hash "$_pem")"
    _epoch="$(cert_end_epoch "$_pem")"
    [ -n "$_hash" ] || continue
    [ -n "$_epoch" ] || continue
    if [ "$_epoch" -gt "$_best_epoch" ]; then
      _best_epoch="$_epoch"
      _best_hash="$_hash"
    fi
  done
  rm -rf "$_tmpdir"

  if [ "$_count" -eq 0 ]; then
    die "no 3rd Party Mac Developer Installer certificate for team ${APPLE_TEAM_ID}.
Create one in Xcode → Settings → Accounts → Manage Certificates → + Mac Installer Distribution"
  fi

  if [ "$_count" -gt 1 ]; then
    echo "warning: ${_count} Mac Installer Distribution certs in keychain; using newest by expiry." >&2
    echo "Delete revoked/old installer certs in Keychain Access → My Certificates if upload fails." >&2
    security find-identity 2>/dev/null \
      | grep '3rd Party Mac Developer Installer:' \
      | filter_identities_for_team \
      | sed -n 's/^[[:space:]]*[0-9]*)[[:space:]]*\([A-F0-9]\{40\}\)[[:space:]]*.*/\1/p' \
      | sort -u \
      | while IFS= read -r _h; do
        [ -n "$_h" ] && describe_installer_hash "$_h"
      done
  fi

  APPLE_INSTALLER_IDENTITY="$_best_hash"
  export APPLE_INSTALLER_IDENTITY
  echo "APPLE_INSTALLER_IDENTITY: auto-selected hash ${APPLE_INSTALLER_IDENTITY}" >&2
  describe_installer_hash "$APPLE_INSTALLER_IDENTITY"
}

verify_pkg_signature() {
  _pkg="$1"
  echo "PKG signature:" >&2
  pkgutil --check-signature "$_pkg" >&2 || die "pkg signature check failed: ${_pkg}"
}

auto_select_identity() {
  _list_fn="$1"
  _var="$2"
  eval "_current=\${${_var}:-}"
  if [ -n "$_current" ]; then
    return 0
  fi

  _tmp="$(mktemp -t w12-mas-sign.XXXXXX)"
  "$_list_fn" > "$_tmp"
  _count=0
  _single=""
  while IFS= read -r _line; do
    [ -z "$_line" ] && continue
    _count=$((_count + 1))
    _single="$_line"
  done < "$_tmp"
  rm -f "$_tmp"

  if [ "$_count" -eq 1 ]; then
    eval "$_var=\$_single"
    export "$_var"
    echo "${_var}: auto-selected ${_single}" >&2
    return 0
  fi

  if [ "$_count" -gt 1 ]; then
    echo "warning: multiple identities; set ${_var}." >&2
    "$_list_fn" | while IFS= read -r _line; do
      [ -n "$_line" ] && echo "  - ${_line}" >&2
    done
  else
    echo "warning: no matching identity in keychain for ${_var}." >&2
  fi

  if ! is_interactive; then
    die "${_var} is not set"
  fi

  prompt_nonempty "$_var" "$_var"
}

ensure_team_id() {
  infer_team_from_identity "${APPLE_SIGNING_IDENTITY:-}" APPLE_TEAM_ID
  infer_team_from_identity "${APPLE_INSTALLER_IDENTITY:-}" APPLE_TEAM_ID
  if [ -n "${APPLE_TEAM_ID:-}" ]; then
    return 0
  fi
  if ! is_interactive; then
    die "APPLE_TEAM_ID is not set"
  fi
  prompt_nonempty APPLE_TEAM_ID "APPLE_TEAM_ID (10-char App ID Prefix)"
}

generate_entitlements() {
  [ -f "$ENTITLEMENTS_TEMPLATE" ] || die "missing ${ENTITLEMENTS_TEMPLATE}"
  ensure_team_id
  _bundle_id="$(read_bundle_identifier)"
  sed \
    -e "s/@@TEAM_ID@@/${APPLE_TEAM_ID}/g" \
    -e "s/@@BUNDLE_ID@@/${_bundle_id}/g" \
    "$ENTITLEMENTS_TEMPLATE" > "$ENTITLEMENTS_PLIST"
  echo "Wrote ${ENTITLEMENTS_PLIST}" >&2
}

ensure_provisioning_profile() {
  if [ ! -f "$PROVISION_PROFILE" ]; then
    die "Mac App Store provisioning profile not found: ${PROVISION_PROFILE}
Download from developer.apple.com → Profiles (Mac App Store) and save as:
  ${TAURI_DIR}/SubspaceLattice.provisionprofile
Or set APPLE_PROVISIONING_PROFILE to another path."
  fi

  _profile_name="$(basename "$PROVISION_PROFILE")"
  _profile_dest="${TAURI_DIR}/${_profile_name}"
  if [ "$PROVISION_PROFILE" != "$_profile_dest" ]; then
    cp -f "$PROVISION_PROFILE" "$_profile_dest"
    echo "Copied provisioning profile → ${_profile_dest}" >&2
  fi
  PROVISION_PROFILE="$_profile_dest"
  strip_app_store_extended_attributes "$_profile_dest"
  PROVISION_PROFILE_BASENAME="$_profile_name"
  export PROVISION_PROFILE_BASENAME
  echo "Provisioning profile: ${_profile_dest}" >&2
}

tauri_build_config() {
  node -e "
    const profile = './' + process.argv[1];
    process.stdout.write(JSON.stringify({
      build: { beforeBuildCommand: '' },
      bundle: {
        macOS: {
          entitlements: './Entitlements.plist',
          files: { 'embedded.provisionprofile': profile }
        }
      }
    }));
  " "$PROVISION_PROFILE_BASENAME"
}

find_built_app() {
  _name="$1"
  _expected="${APP_BUNDLE_DIR}/${_name}.app"
  if [ -d "$_expected" ]; then
    printf '%s' "$_expected"
    return 0
  fi
  _newest="$(ls -1dt "${APP_BUNDLE_DIR}"/*.app 2>/dev/null | head -1)"
  if [ -n "$_newest" ] && [ -d "$_newest" ]; then
    printf '%s' "$_newest"
    return 0
  fi
  return 1
}

pkg_asset_basename() {
  printf '%s_%s.pkg' "$1" "$2"
}

verify_app_sandbox_entitlement() {
  _app="$1"
  if ! codesign -d --entitlements :- "$_app" 2>/dev/null | grep -q 'com.apple.security.app-sandbox'; then
    die "app sandbox entitlement missing on ${_app}; re-sign failed"
  fi
  echo "Verified com.apple.security.app-sandbox on bundle." >&2
}

strip_app_store_extended_attributes() {
  _path="$1"
  if [ ! -e "$_path" ]; then
    return 0
  fi
  echo "Stripping extended attributes from ${_path}..." >&2
  xattr -cr "$_path" 2>/dev/null || true
}

verify_no_quarantine_attributes() {
  _path="$1"
  _label="${2:-$1}"
  _hits="$(xattr -lr "$_path" 2>/dev/null | grep 'com.apple.quarantine' || true)"
  if [ -n "$_hits" ]; then
    die "com.apple.quarantine still present on ${_label}. App Store uploads reject quarantined files.
${_hits}
Run: xattr -cr \"${_path}\" and rebuild."
  fi
}

sign_and_package_app() {
  _app="$1"
  _product_name="$2"
  _pkg_name="$(pkg_asset_basename "$_product_name" "$APP_VERSION")"
  mkdir -p "$PKG_OUT_DIR"
  _pkg="${PKG_OUT_DIR}/${_pkg_name}"
  _embedded_profile="${_app}/Contents/embedded.provisionprofile"

  ensure_app_store_signing_identity
  cp -f "$PROVISION_PROFILE" "$_embedded_profile"
  strip_app_store_extended_attributes "$_app"
  verify_no_quarantine_attributes "$_app" "$_app"

  echo "Re-signing app for Mac App Store..." >&2
  echo "  identity: ${APPLE_SIGNING_IDENTITY}" >&2
  echo "  profile: ${_embedded_profile}" >&2

  if [ -d "${_app}/Contents/Frameworks" ]; then
    find "${_app}/Contents/Frameworks" -depth \( -name '*.dylib' -o -name '*.framework' \) -print0 2>/dev/null \
      | while IFS= read -r -d '' _item; do
          codesign --force --sign "$APPLE_SIGNING_IDENTITY" \
            --options runtime \
            --timestamp \
            "$_item"
        done
  fi

  _main_bin="${_app}/Contents/MacOS/app"
  if [ ! -f "$_main_bin" ]; then
    _main_bin="$(find "${_app}/Contents/MacOS" -type f -perm +111 | head -1)"
  fi
  [ -n "$_main_bin" ] && [ -f "$_main_bin" ] || die "main executable not found in ${_app}/Contents/MacOS"

  codesign --force --sign "$APPLE_SIGNING_IDENTITY" \
    --entitlements "$ENTITLEMENTS_PLIST" \
    --options runtime \
    --timestamp \
    "$_main_bin"

  codesign --force --sign "$APPLE_SIGNING_IDENTITY" \
    --entitlements "$ENTITLEMENTS_PLIST" \
    --options runtime \
    --timestamp \
    "$_app"

  verify_app_sandbox_entitlement "$_app"
  codesign --verify --deep --strict --verbose=2 "$_app" >&2 || die "codesign verify failed for ${_app}"
  verify_no_quarantine_attributes "$_app" "$_app"

  echo "Creating signed .pkg..." >&2
  xcrun productbuild \
    --sign "$APPLE_INSTALLER_IDENTITY" \
    --timestamp \
    --component "$_app" /Applications \
    "$_pkg"

  echo "PKG: ${_pkg}" >&2
  verify_pkg_signature "$_pkg"
  PKG_PATH="$_pkg"
  export PKG_PATH
}

has_upload_api_key() {
  [ -n "${APPLE_API_KEY:-}" ] && [ -n "${APPLE_API_ISSUER:-}" ] && [ -n "${APPLE_API_KEY_PATH:-}" ]
}

resolve_apple_api_key_path() {
  [ -n "${APPLE_API_KEY_PATH:-}" ] || return 1

  case "$APPLE_API_KEY_PATH" in
    "~/"*) APPLE_API_KEY_PATH="${HOME}/${APPLE_API_KEY_PATH#~/}" ;;
    "~") APPLE_API_KEY_PATH="$HOME" ;;
  esac

  if [ -f "$APPLE_API_KEY_PATH" ]; then
    export APPLE_API_KEY_PATH
    return 0
  fi

  if [ ! -d "$APPLE_API_KEY_PATH" ]; then
    die "APPLE_API_KEY_PATH not found: ${APPLE_API_KEY_PATH}
Set to the .p8 file, e.g. ${HOME}/private_keys/AuthKey_XXXXXXXXXX.p8"
  fi

  _dir="$APPLE_API_KEY_PATH"
  if [ -n "${APPLE_API_KEY:-}" ] && [ -f "${_dir}/AuthKey_${APPLE_API_KEY}.p8" ]; then
    APPLE_API_KEY_PATH="${_dir}/AuthKey_${APPLE_API_KEY}.p8"
    export APPLE_API_KEY_PATH
    echo "APPLE_API_KEY_PATH: using ${APPLE_API_KEY_PATH}" >&2
    return 0
  fi

  _match="$(ls -1 "${_dir}"/AuthKey_*.p8 2>/dev/null | head -1)"
  if [ -n "$_match" ] && [ -f "$_match" ]; then
    APPLE_API_KEY_PATH="$_match"
    export APPLE_API_KEY_PATH
    echo "APPLE_API_KEY_PATH: using ${APPLE_API_KEY_PATH}" >&2
    return 0
  fi

  die "No AuthKey_*.p8 in directory: ${_dir}
Download the key from App Store Connect → Integrations → App Store Connect API.
Set APPLE_API_KEY_PATH to the .p8 file path (not the folder)."
}

ensure_upload_credentials() {
  if has_upload_api_key; then
    resolve_apple_api_key_path
    return 0
  fi

  if ! is_interactive; then
    die "upload requires APPLE_API_KEY, APPLE_API_ISSUER, APPLE_API_KEY_PATH"
  fi

  [ -n "${APPLE_API_ISSUER:-}" ] || prompt_nonempty APPLE_API_ISSUER "APPLE_API_ISSUER"
  [ -n "${APPLE_API_KEY:-}" ] || prompt_nonempty APPLE_API_KEY "APPLE_API_KEY"
  [ -n "${APPLE_API_KEY_PATH:-}" ] || prompt_nonempty APPLE_API_KEY_PATH "APPLE_API_KEY_PATH (.p8 file or directory)"
  resolve_apple_api_key_path
}

upload_pkg() {
  _pkg="$1"
  ensure_upload_credentials
  echo "Uploading to App Store Connect..." >&2
  xcrun altool --upload-app \
    -f "$_pkg" \
    -t macos \
    --apiKey "$APPLE_API_KEY" \
    --apiIssuer "$APPLE_API_ISSUER"
  echo "Upload complete. Check App Store Connect → TestFlight." >&2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --upload) UPLOAD=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-resign) SKIP_RESIGN=1; shift ;;
    --version)
      shift
      [ -n "${1:-}" ] || die "--version requires a value"
      APP_VERSION="$(normalize_version "$1")"
      shift
      ;;
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
      if [ -z "${APP_VERSION:-}" ] && looks_like_version "$1"; then
        APP_VERSION="$(normalize_version "$1")"
        shift
      else
        EXTRA_TAURI_ARGS="${EXTRA_TAURI_ARGS} $1"
        shift
      fi
      ;;
  esac
done

resolve_app_version
apply_app_version "$APP_VERSION"

if [ "$(uname -s)" != "Darwin" ]; then
  die "macOS App Store build must run on macOS"
fi

if [ -z "${BASH_VERSION:-}" ]; then
  die "run with bash: bash scripts/build-macos-appstore.sh"
fi

[ -x "$TAURI_BIN" ] || TAURI_BIN="$(command -v tauri || true)"
[ -n "$TAURI_BIN" ] || die "tauri CLI not found; run yarn install from repo root"

PRODUCT_NAME="$(read_product_name)"
BUNDLE_ID="$(read_bundle_identifier)"

ensure_provisioning_profile
generate_entitlements
ensure_app_store_signing_identity
ensure_team_id
resolve_installer_signing_identity

echo "" >&2
echo "Mac App Store build:" >&2
echo "  APP_VERSION=${APP_VERSION}" >&2
echo "  PRODUCT_NAME=${PRODUCT_NAME}" >&2
echo "  BUNDLE_ID=${BUNDLE_ID}" >&2
echo "  APPLE_TEAM_ID=${APPLE_TEAM_ID}" >&2
echo "  APPLE_SIGNING_IDENTITY=${APPLE_SIGNING_IDENTITY}" >&2
echo "  APPLE_INSTALLER_IDENTITY=${APPLE_INSTALLER_IDENTITY}" >&2
echo "  PROVISIONING_PROFILE=${PROVISION_PROFILE}" >&2
echo "" >&2

_TAURI_BUILD_CONFIG="$(tauri_build_config)"

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "Building frontend..." >&2
  yarn build:all

  TAURI_LOCAL_CONF="$(lattice_env_write_tauri_local_config)"

  echo "Building universal .app (Tauri, Mac App Store)..." >&2
  cd "$BRIDGE_DIR"
  disable_tauri_notarization_env
  _tauri_status=0
  # shellcheck disable=SC2086
  "$TAURI_BIN" build \
    --target universal-apple-darwin \
    --bundles app \
    --config "$_TAURI_BUILD_CONFIG" \
    --config "$TAURI_LOCAL_CONF" \
    ${EXTRA_TAURI_ARGS} || _tauri_status=$?
  restore_notarization_env
  [ "$_tauri_status" -eq 0 ] || exit "$_tauri_status"
else
  echo "Skipping build (--skip-build)." >&2
fi

APP_PATH="$(find_built_app "$PRODUCT_NAME")" || die ".app not found under ${APP_BUNDLE_DIR}/"

if [ "$SKIP_RESIGN" -eq 0 ]; then
  sign_and_package_app "$APP_PATH" "$PRODUCT_NAME"
else
  echo "Skipping re-sign and .pkg (--skip-resign). App: ${APP_PATH}" >&2
fi

if [ "$UPLOAD" -eq 1 ]; then
  [ -n "${PKG_PATH:-}" ] || die "--upload requires a built .pkg (omit --skip-resign)"
  upload_pkg "$PKG_PATH"
fi

echo "Done."
