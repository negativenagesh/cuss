#!/usr/bin/env bash
# Precompile the CUSS native macOS helpers into bridge/bin so installed users never need Xcode tools.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="$DIR/../bin"
mkdir -p "$OUT"
ARCH_FLAGS=()
if [[ "${CUSS_UNIVERSAL:-0}" == "1" ]]; then ARCH_FLAGS=(-target arm64-apple-macos12 ); fi
/usr/bin/swiftc -O "$DIR/cuss-mac-input.swift"  -framework Cocoa -framework ApplicationServices -o "$OUT/cuss-mac-input"
/usr/bin/swiftc -O "$DIR/cuss-mac-speech.swift" -framework Speech -o "$OUT/cuss-mac-speech"
codesign --force --sign - "$OUT/cuss-mac-input" "$OUT/cuss-mac-speech" >/dev/null 2>&1 || true
echo "✓ built $OUT/cuss-mac-input and $OUT/cuss-mac-speech"
