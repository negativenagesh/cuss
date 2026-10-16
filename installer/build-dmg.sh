#!/usr/bin/env bash
# Build a self-contained, double-click installer disk image: dist/cuss.dmg
#
#   cuss.dmg
#   └── Install CUSS.app          (animated Core Animation installer)
#       └── Contents/Resources/payload/
#           ├── node/bin/node     (Node 22 arm64 runtime, no npm needed on the target Mac)
#           ├── bridge/           (src + node_modules + precompiled native helpers in bin/)
#           └── CUSS Menu.app     (menu bar companion)
#
# Requirements on the BUILD machine only: Xcode Command Line Tools (swiftc), node, hdiutil.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/package.json').version")"
DIST="$ROOT/dist"
STAGE="$DIST/stage"
APP="$STAGE/Install CUSS.app"
RES="$APP/Contents/Resources"
PAYLOAD="$RES/payload"
NODE_BIN="$(command -v node)"
NODE_REAL="$(python3 -c "import os,sys;print(os.path.realpath(sys.argv[1]))" "$NODE_BIN")"

echo "→ CUSS $VERSION · building cuss.dmg"
rm -rf "$STAGE" "$DIST/cuss.dmg" "$DIST/cuss-rw.dmg"
mkdir -p "$PAYLOAD/node/bin" "$APP/Contents/MacOS" "$RES/fonts" "$STAGE/.background"

# 1. Brand assets + native helpers
python3 "$ROOT/assets/brand/generate-brand-assets.py" >/dev/null
bash "$ROOT/bridge/native/build.sh" >/dev/null

# 2. Node runtime (single static binary)
echo "→ payload: node runtime ($(file -b "$NODE_REAL" | cut -d, -f1))"
cp "$NODE_REAL" "$PAYLOAD/node/bin/node"
chmod 755 "$PAYLOAD/node/bin/node"

# 3. Bridge (source + runtime deps + precompiled helpers). Tests and caches are excluded.
echo "→ payload: bridge"
rsync -a --delete \
  --exclude '/test' --exclude '/dist' --exclude '/.vitest' --exclude '*.log' --exclude '.DS_Store' \
  "$ROOT/bridge/" "$PAYLOAD/bridge/"
# drop heavyweight dev-only deps the runtime never loads and remove any dangling symlinks
rm -rf "$PAYLOAD/bridge/node_modules/vitest" "$PAYLOAD/bridge/node_modules/@vitest" "$PAYLOAD/bridge/node_modules/typescript" \
  "$PAYLOAD/bridge/node_modules/.bin/vitest" "$PAYLOAD/bridge/node_modules/.bin/tsc" "$PAYLOAD/bridge/node_modules/.bin/tsserver" 2>/dev/null || true
find "$PAYLOAD" -type l ! -exec test -e {} \; -delete

# 4. Menu bar app (compiled fresh into the payload, not into /Applications)
echo "→ payload: CUSS Menu.app"
MB="$PAYLOAD/CUSS Menu.app"
mkdir -p "$MB/Contents/MacOS" "$MB/Contents/Resources"
/usr/bin/swiftc -O "$ROOT/macos-menubar/CussMenuBar.swift" -framework Cocoa -framework CoreImage -o "$MB/Contents/MacOS/CussMenuBar"
cp "$ROOT/assets/brand/CUSS.icns" "$MB/Contents/Resources/CUSS.icns"
cat > "$MB/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>CussMenuBar</string>
  <key>CFBundleIdentifier</key><string>com.local.cuss.menubar</string>
  <key>CFBundleName</key><string>CUSS Menu</string>
  <key>CFBundleIconFile</key><string>CUSS</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
EOF
codesign --force --deep --sign - "$MB" >/dev/null 2>&1 || true

# 5. Installer app
echo "→ Install CUSS.app"
/usr/bin/swiftc -O "$ROOT/installer/CussInstaller.swift" -framework Cocoa -framework CoreImage -framework QuartzCore -o "$APP/Contents/MacOS/CussInstaller"
cp "$ROOT/mobile/assets/fonts/Unbounded-Variable.ttf" "$ROOT/mobile/assets/fonts/SpaceMono-Bold.ttf" "$ROOT/mobile/assets/fonts/SpaceMono-Regular.ttf" "$RES/fonts/"
cp "$ROOT/assets/brand/CUSS.icns" "$RES/CUSS.icns"
cat > "$APP/Contents/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleExecutable</key><string>CussInstaller</string>
  <key>CFBundleIdentifier</key><string>com.local.cuss.installer</string>
  <key>CFBundleName</key><string>Install CUSS</string>
  <key>CFBundleDisplayName</key><string>Install CUSS</string>
  <key>CFBundleIconFile</key><string>CUSS</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSApplicationCategoryType</key><string>public.app-category.developer-tools</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSHumanReadableCopyright</key><string>CUSS — Cybernetic Umbilical Studio &amp; Synth</string>
</dict></plist>
EOF
xattr -cr "$STAGE" 2>/dev/null || true
codesign --force --deep --sign - "$MB"
codesign --force --deep --sign - "$APP"
codesign --verify --deep --strict "$APP"

# 6. DMG window dressing
cp "$ROOT/assets/brand/dmg-background.png" "$STAGE/.background/background.png"
cat > "$STAGE/READ ME.txt" <<'EOF'
CUSS — Cybernetic Umbilical Studio & Synth
==========================================
Drive Cursor on this Mac from your Android phone. Zero API keys. Zero terminal.

1. Double-click "Install CUSS".
   (First launch on a new Mac: right-click → Open, because the build is not notarized.)
2. When macOS asks, allow Accessibility and Screen Recording for "node"
   so the Live Keyboard echo and the Live Mirror work.
3. Install cuss.apk on your Android phone, open it, tap SCAN, and point it at
   the QR code shown by the installer or by ⚡ CUSS in your Mac menu bar.

Uninstall: quit ⚡ CUSS from the menu bar, then delete
  /Applications/CUSS Menu.app
  ~/Library/Application Support/CUSS
  ~/Library/LaunchAgents/com.cuss.*.plist
EOF

# 7. Writable DMG → Finder layout via AppleScript → compressed read-only UDZO
SIZE_MB=$(( $(du -sm "$STAGE" | cut -f1) + 80 ))
echo "→ hdiutil create (stage ${SIZE_MB}MB)"
hdiutil create -quiet -srcfolder "$STAGE" -volname "CUSS" -fs HFS+ -fsargs "-c c=64,a=16,e=16" -format UDRW -size "${SIZE_MB}m" "$DIST/cuss-rw.dmg"
MOUNT_DIR="/Volumes/CUSS"
hdiutil detach "$MOUNT_DIR" -quiet 2>/dev/null || true
DEV="$(hdiutil attach -readwrite -noverify -noautoopen "$DIST/cuss-rw.dmg" | awk '/Apple_HFS/ {print $1}')"
sleep 1
osascript <<EOF >/dev/null 2>&1 || echo "  (Finder layout skipped — grant Automation permission to customize the window)"
tell application "Finder"
  tell disk "CUSS"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {120, 100, 780, 500}
    set theViewOptions to the icon view options of container window
    set arrangement of theViewOptions to not arranged
    set icon size of theViewOptions to 132
    set text size of theViewOptions to 13
    set background picture of theViewOptions to file ".background:background.png"
    set position of item "Install CUSS.app" of container window to {330, 250}
    set position of item "READ ME.txt" of container window to {560, 345}
    close
    open
    update without registering applications
    delay 1
    close
  end tell
end tell
EOF
sync
hdiutil detach "$DEV" -quiet || hdiutil detach "$DEV" -force -quiet
hdiutil convert -quiet "$DIST/cuss-rw.dmg" -format UDZO -imagekey zlib-level=9 -o "$DIST/cuss.dmg"
rm -f "$DIST/cuss-rw.dmg"
rm -rf "$STAGE"
echo "✓ $(du -h "$DIST/cuss.dmg" | cut -f1)  $DIST/cuss.dmg"
