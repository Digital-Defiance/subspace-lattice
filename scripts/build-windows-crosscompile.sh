#!/usr/bin/env bash
# Cross-compile Subspace Lattice Windows .exe from macOS (binary only).
# Full MSI/MSIX packaging still requires Windows: yarn build:windows / build:windows:store
#
# Usage: bash scripts/build-windows-crosscompile.sh

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  cat <<'EOF'
Usage: bash scripts/build-windows-crosscompile.sh

Cross-compiles the Windows .exe from macOS via cargo-xwin (binary only).
For MSI/NSIS/MSIX packaging, build on Windows:
  yarn build:windows
  yarn build:windows:store
EOF
  exit 0
fi

echo "Cross-compiling Subspace Lattice for Windows (x86_64-pc-windows-msvc)..."

echo ""
echo "Building web frontend..."
yarn nx build web

cd apps/desktop

if ! command -v cargo-xwin >/dev/null 2>&1; then
  echo "cargo-xwin not found — installing..."
  cargo install cargo-xwin
fi

if ! rustup target list --installed | grep -q "x86_64-pc-windows-msvc"; then
  echo "Installing Windows Rust target..."
  rustup target add x86_64-pc-windows-msvc
fi

echo ""
echo "Compiling Rust binary..."
cd src-tauri
cargo xwin build --release --target x86_64-pc-windows-msvc

echo ""
echo "Windows binary built."
echo "  Location: apps/desktop/src-tauri/target/x86_64-pc-windows-msvc/release/"
echo ""
echo "Note: this is the .exe only. For MSI/NSIS/MSIX, build on Windows:"
echo "  yarn build:windows"
echo "  yarn build:windows:store"
