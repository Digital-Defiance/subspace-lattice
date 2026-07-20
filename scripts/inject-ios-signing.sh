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

# Directory next to .xcodeproj that holds Info.plist (e.g. app_iOS)
IOS_TARGET_DIR="$(find "$APPLE_DIR" -maxdepth 1 -type d -name '*_iOS' | head -1)"
[ -n "${IOS_TARGET_DIR:-}" ] || die "no *_iOS folder under ${APPLE_DIR}"
IOS_TARGET_NAME="$(basename "$IOS_TARGET_DIR")"

TEAM_ID="${APPLE_TEAM_ID:-}"
BUNDLE_ID="${APPLE_BUNDLE_ID:-org.digitaldefiance.app.subspacelattice}"
[ -n "$TEAM_ID" ] || die "APPLE_TEAM_ID required"

python3 - "$PBXPROJ" "$TEAM_ID" "$BUNDLE_ID" "$IOS_TARGET_NAME" <<'PY'
import re
import sys
from pathlib import Path

pbx = Path(sys.argv[1])
team_id = sys.argv[2]
bundle_id = sys.argv[3]
ios_name = sys.argv[4]
text = pbx.read_text(encoding="utf-8")

# Ensure DEVELOPMENT_TEAM and PRODUCT_BUNDLE_IDENTIFIER on Debug/Release.
def patch_block(block: str) -> str:
    if "DEVELOPMENT_TEAM" in block:
        block = re.sub(
            r'DEVELOPMENT_TEAM\s*=\s*[^;]+;',
            f'DEVELOPMENT_TEAM = {team_id};',
            block,
        )
    else:
        block = block.replace(
            "buildSettings = {",
            f"buildSettings = {{\n\t\t\t\tDEVELOPMENT_TEAM = {team_id};",
            1,
        )
    if "PRODUCT_BUNDLE_IDENTIFIER" in block:
        block = re.sub(
            r'PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;',
            f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};',
            block,
        )
    else:
        block = block.replace(
            "buildSettings = {",
            f'buildSettings = {{\n\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = {bundle_id};',
            1,
        )
    # Prefer manual signing for App Store export scripts
    if "CODE_SIGN_STYLE" in block:
        block = re.sub(
            r'CODE_SIGN_STYLE\s*=\s*[^;]+;',
            "CODE_SIGN_STYLE = Manual;",
            block,
        )
    # Keep entitlements / Info.plist paths aligned with discovered target
    block = re.sub(
        r'CODE_SIGN_ENTITLEMENTS\s*=\s*[^;]+;',
        f"CODE_SIGN_ENTITLEMENTS = {ios_name}/{ios_name}.entitlements;",
        block,
    )
    block = re.sub(
        r'INFOPLIST_FILE\s*=\s*[^;]+;',
        f"INFOPLIST_FILE = {ios_name}/Info.plist;",
        block,
    )
    return block

pattern = re.compile(
    r"(/\* Debug \*/ = \{.*?buildSettings = \{.*?};\s*name = Debug;)",
    re.S,
)
matches = list(pattern.finditer(text))
if not matches:
    # Fallback: any buildSettings with name = Debug|Release under iOS target is fine;
    # inject team into all DEVELOPMENT_TEAM occurrences.
    updated = re.sub(
        r'DEVELOPMENT_TEAM\s*=\s*[^;]+;',
        f'DEVELOPMENT_TEAM = {team_id};',
        text,
    )
    updated = re.sub(
        r'PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;',
        f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};',
        updated,
    )
    if updated == text and "DEVELOPMENT_TEAM" not in text:
        sys.exit(
            "error: could not locate iOS buildSettings blocks to inject\n"
        )
    pbx.write_text(updated, encoding="utf-8")
    print(f"Patched DEVELOPMENT_TEAM / PRODUCT_BUNDLE_IDENTIFIER in {pbx}")
    raise SystemExit(0)

# Prefer rewriting whole file via DEVELOPMENT_TEAM / PRODUCT_BUNDLE_IDENTIFIER globals
updated = text
updated = re.sub(
    r'DEVELOPMENT_TEAM\s*=\s*[^;]+;',
    f'DEVELOPMENT_TEAM = {team_id};',
    updated,
)
updated = re.sub(
    r'PRODUCT_BUNDLE_IDENTIFIER\s*=\s*[^;]+;',
    f'PRODUCT_BUNDLE_IDENTIFIER = {bundle_id};',
    updated,
)
if "DEVELOPMENT_TEAM" not in updated:
    sys.exit("error: DEVELOPMENT_TEAM not present after patch attempt")

pbx.write_text(updated, encoding="utf-8")
print(f"Patched {pbx} (team={team_id}, bundle={bundle_id}, target={ios_name})")
PY
