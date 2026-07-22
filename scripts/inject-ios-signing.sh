#!/usr/bin/env bash
# Patch generated iOS Xcode project for manual App Store signing.
# Discovers gen/apple/*.xcodeproj (Tauri names it from the Rust package).

set -euo pipefail

# shellcheck source=scripts/lib/lattice-env.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/lattice-env.sh"
lattice_env_load ios
lattice_env_cd_root

TAURI_DIR="$(lattice_env_tauri_dir)"
APPLE_DIR="${TAURI_DIR}/gen/apple"

die() {
  echo "error: $*" >&2
  exit 1
}

[ -d "$APPLE_DIR" ] || die "missing ${APPLE_DIR} — run: yarn init:desktop"

PBXPROJ="$(find "$APPLE_DIR" -maxdepth 2 -name 'project.pbxproj' | head -1)"
[ -n "${PBXPROJ:-}" ] && [ -f "$PBXPROJ" ] || die "no project.pbxproj under ${APPLE_DIR}"

IOS_TARGET_DIR="$(find "$APPLE_DIR" -maxdepth 1 -type d -name '*_iOS' | head -1)"
[ -n "${IOS_TARGET_DIR:-}" ] || die "no *_iOS folder under ${APPLE_DIR}"
IOS_TARGET_NAME="$(basename "$IOS_TARGET_DIR")"

TEAM_ID="${APPLE_TEAM_ID:-}"
BUNDLE_ID="${APPLE_BUNDLE_ID:-org.digitaldefiance.app.subspacelattice}"
PUBLISHER="${APPLE_PUBLISHER_NAME:-}"
[ -n "$TEAM_ID" ] || die "APPLE_TEAM_ID required"
[ -n "$BUNDLE_ID" ] || die "APPLE_BUNDLE_ID required"

if [ -n "${APPLE_IOS_PROVISIONING_PROFILE:-}" ]; then
  PROVISION_PROFILE="$(lattice_env_abs_path "$APPLE_IOS_PROVISIONING_PROFILE")"
else
  PROVISION_PROFILE="${TAURI_DIR}/SubspaceLattice_iOS.mobileprovision"
fi
[ -f "$PROVISION_PROFILE" ] || die "missing iOS profile: ${PROVISION_PROFILE}"

PROFILE_SPEC="$(security cms -D -i "$PROVISION_PROFILE" 2>/dev/null | plutil -extract Name raw - 2>/dev/null || true)"
[ -n "$PROFILE_SPEC" ] || die "could not read profile Name from ${PROVISION_PROFILE}"

if [ -n "${APPLE_IOS_SIGN_IDENTITY:-}" ]; then
  SIGN_IDENTITY="$APPLE_IOS_SIGN_IDENTITY"
elif [ -n "$PUBLISHER" ]; then
  SIGN_IDENTITY="Apple Distribution: ${PUBLISHER} (${TEAM_ID})"
else
  SIGN_IDENTITY="Apple Distribution"
fi

python3 - "$PBXPROJ" "$TEAM_ID" "$BUNDLE_ID" "$IOS_TARGET_NAME" "$PROFILE_SPEC" "$SIGN_IDENTITY" <<'PY'
import re
import sys
from pathlib import Path

pbx = Path(sys.argv[1])
team_id = sys.argv[2]
bundle_id = sys.argv[3]
ios_name = sys.argv[4]
profile_spec = sys.argv[5]
sign_identity = sys.argv[6]
text = pbx.read_text(encoding="utf-8")

def set_or_insert(block: str, key: str, value: str) -> str:
    """Set KEY = value; inside a buildSettings = { ... } block body."""
    pattern = re.compile(rf'(^\s*){re.escape(key)}\s*=\s*[^;]*;', re.M)
    line = f"\t\t\t\t{key} = {value};"
    if pattern.search(block):
        return pattern.sub(rf"\1{key} = {value};", block, count=1)
    # Insert after opening buildSettings = {
    return block.replace(
        "buildSettings = {",
        f"buildSettings = {{\n{line}",
        1,
    )

def patch_target_settings(block: str) -> str:
    block = set_or_insert(block, "DEVELOPMENT_TEAM", team_id)
    block = set_or_insert(block, f'"DEVELOPMENT_TEAM[sdk=iphoneos*]"', team_id)
    block = set_or_insert(block, "PRODUCT_BUNDLE_IDENTIFIER", bundle_id)
    block = set_or_insert(block, "CODE_SIGN_STYLE", "Manual")
    block = set_or_insert(block, "CODE_SIGN_IDENTITY", f'"{sign_identity}"')
    block = set_or_insert(
        block, '"CODE_SIGN_IDENTITY[sdk=iphoneos*]"', f'"{sign_identity}"'
    )
    block = set_or_insert(
        block, "PROVISIONING_PROFILE_SPECIFIER", f'"{profile_spec}"'
    )
    block = set_or_insert(
        block,
        '"PROVISIONING_PROFILE_SPECIFIER[sdk=iphoneos*]"',
        f'"{profile_spec}"',
    )
    block = set_or_insert(
        block,
        "CODE_SIGN_ENTITLEMENTS",
        f"{ios_name}/{ios_name}.entitlements",
    )
    block = set_or_insert(block, "INFOPLIST_FILE", f"{ios_name}/Info.plist")
    return block

# Target configs include PRODUCT_BUNDLE_IDENTIFIER; project-level ones do not.
target_cfg = re.compile(
    r"(\t\t[A-F0-9]+ /\* (?:debug|release|Debug|Release) \*/ = \{\n"
    r"\t\t\tisa = XCBuildConfiguration;\n"
    r"\t\t\tbuildSettings = \{.*?\n\t\t\t\};"
    r"\n\t\t\tname = (?:debug|release|Debug|Release);\n\t\t\};)",
    re.S,
)

patched = 0

def repl(match: re.Match[str]) -> str:
    global patched
    block = match.group(1)
    if "PRODUCT_BUNDLE_IDENTIFIER" not in block:
        return block
    patched += 1
    return patch_target_settings(block)

updated = target_cfg.sub(repl, text)
if patched < 1:
    sys.exit(
        "error: could not locate iOS app target buildSettings blocks to inject\n"
        f"(expected PRODUCT_BUNDLE_IDENTIFIER under {pbx})\n"
    )

pbx.write_text(updated, encoding="utf-8")
print(
    f"Patched {pbx} "
    f"(team={team_id}, bundle={bundle_id}, target={ios_name}, "
    f"profile={profile_spec}, configs={patched})",
    file=sys.stderr,
)
PY
