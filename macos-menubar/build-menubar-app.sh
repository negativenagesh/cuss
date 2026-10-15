#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="CUSS Menu.app"
APP_DIR="/Applications/$APP_NAME"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"
PLIST_LAUNCH="$HOME/Library/LaunchAgents/com.cuss.menubar.plist"

echo "→ Building native macOS Menu Bar app: $APP_DIR ..."
pkill -f "CussMenuBar" 2>/dev/null || true
rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"

/usr/bin/swiftc -O "$SCRIPT_DIR/CussMenuBar.swift" \
  -framework Cocoa \
  -o "$MACOS_DIR/CussMenuBar"

cat > "$CONTENTS_DIR/Info.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>CussMenuBar</string>
  <key>CFBundleIdentifier</key>
  <string>com.local.cuss.menubar</string>
  <key>CFBundleName</key>
  <string>CUSS Menu</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>0.5.0</string>
  <key>LSUIElement</key>
  <true/>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST_LAUNCH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cuss.menubar</string>
  <key>ProgramArguments</key>
  <array>
    <string>$MACOS_DIR/CussMenuBar</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>
EOF

launchctl unload "$PLIST_LAUNCH" 2>/dev/null || true
launchctl load "$PLIST_LAUNCH"

echo "✓ Installed and launched '/Applications/CUSS Menu.app' in your top macOS Menu Bar (⚡ CUSS)!"
