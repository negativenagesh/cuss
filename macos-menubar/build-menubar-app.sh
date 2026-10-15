#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BRIDGE_DIR="$ROOT_DIR/bridge"
MOBILE_DIR="$ROOT_DIR/mobile"
APP_NAME="CUSS Menu.app"
APP_DIR="/Applications/$APP_NAME"
CONTENTS_DIR="$APP_DIR/Contents"
MACOS_DIR="$CONTENTS_DIR/MacOS"

PLIST_MENUBAR="$HOME/Library/LaunchAgents/com.cuss.menubar.plist"
PLIST_BRIDGE="$HOME/Library/LaunchAgents/com.cuss.bridge.plist"
PLIST_EXPO="$HOME/Library/LaunchAgents/com.cuss.expo.plist"

NODE_BIN="$(command -v node)"
NODE_DIR="$(dirname "$NODE_BIN")"

mkdir -p "$HOME/Library/LaunchAgents"

# 1. Install/Update Background Mac Bridge Daemon (Port 4040)
cat > "$PLIST_BRIDGE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cuss.bridge</string>
  <key>WorkingDirectory</key>
  <string>$BRIDGE_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$BRIDGE_DIR/node_modules/.bin/tsx</string>
    <string>$BRIDGE_DIR/src/main.ts</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/cuss-bridge.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/cuss-bridge.log</string>
</dict>
</plist>
EOF

# 2. Install/Update Background Expo Go Server Daemon (Port 8081)
cat > "$PLIST_EXPO" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cuss.expo</string>
  <key>WorkingDirectory</key>
  <string>$MOBILE_DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>$NODE_DIR:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>CI</key>
    <string>0</string>
  </dict>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE_BIN</string>
    <string>$MOBILE_DIR/node_modules/.bin/expo</string>
    <string>start</string>
    <string>--port</string>
    <string>8081</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/cuss-expo.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/cuss-expo.log</string>
</dict>
</plist>
EOF

if [[ "${1:-}" == "--restart-daemons-only" ]]; then
  /usr/sbin/lsof -ti :4040 | xargs kill -9 2>/dev/null || true
  launchctl unload "$PLIST_BRIDGE" 2>/dev/null || true
  launchctl load "$PLIST_BRIDGE"
  if ! /usr/sbin/lsof -ti :8081 >/dev/null 2>&1; then
    launchctl unload "$PLIST_EXPO" 2>/dev/null || true
    launchctl load "$PLIST_EXPO"
  fi
  exit 0
fi

echo "→ Building native macOS Menu Bar app: $APP_DIR ..."
pkill -f "CussMenuBar" 2>/dev/null || true
rm -rf "$APP_DIR"
mkdir -p "$MACOS_DIR"

/usr/bin/swiftc -O "$SCRIPT_DIR/CussMenuBar.swift" \
  -framework Cocoa \
  -framework CoreImage \
  -o "$MACOS_DIR/CussMenuBar"
mkdir -p "$CONTENTS_DIR/Resources"
cp "$ROOT_DIR/assets/brand/CUSS.icns" "$CONTENTS_DIR/Resources/CUSS.icns"

# Developer checkout: point the Menu Bar app at this repo
mkdir -p "$HOME/.config/mission-control"
printf '{"home":"%s","node":"%s","mode":"dev"}\n' "$ROOT_DIR" "$NODE_BIN" > "$HOME/.config/mission-control/install.json"

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
  <key>CFBundleIconFile</key>
  <string>CUSS</string>
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

cat > "$PLIST_MENUBAR" <<EOF
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

/usr/sbin/lsof -ti :4040 | xargs kill -9 2>/dev/null || true
launchctl unload "$PLIST_BRIDGE" 2>/dev/null || true
launchctl load "$PLIST_BRIDGE"

if ! /usr/sbin/lsof -ti :8081 >/dev/null 2>&1; then
  launchctl unload "$PLIST_EXPO" 2>/dev/null || true
  launchctl load "$PLIST_EXPO"
fi

launchctl unload "$PLIST_MENUBAR" 2>/dev/null || true
launchctl load "$PLIST_MENUBAR"

echo "✓ Installed '/Applications/CUSS Menu.app' + Bridge Daemon (4040) + Expo Daemon (8081)!"
