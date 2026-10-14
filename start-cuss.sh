#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE_DIR="$ROOT_DIR/bridge"
MOBILE_DIR="$ROOT_DIR/mobile"
PLIST_PATH="$HOME/Library/LaunchAgents/com.cuss.bridge.plist"
LOG_FILE="/tmp/cuss-bridge.log"

if [[ "${1:-}" == "--install-service" ]]; then
  mkdir -p "$HOME/Library/LaunchAgents"
  NODE_BIN="$(command -v node)"
  NODE_DIR="$(dirname "$NODE_BIN")"
  cat > "$PLIST_PATH" <<EOF
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
  <string>$LOG_FILE</string>
  <key>StandardErrorPath</key>
  <string>$LOG_FILE</string>
</dict>
</plist>
EOF
  /usr/sbin/lsof -ti :4040 | xargs kill -9 2>/dev/null || true
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  launchctl load "$PLIST_PATH"
  echo "✓ Installed macOS background service (com.cuss.bridge). The CUSS Mac Bridge now runs automatically in the background!"
  exit 0
fi

if [[ "${1:-}" == "--uninstall-service" ]]; then
  launchctl unload "$PLIST_PATH" 2>/dev/null || true
  rm -f "$PLIST_PATH"
  echo "✓ Removed macOS background service (com.cuss.bridge)."
  exit 0
fi

echo "═══════════════════════════════════════════════════════════════"
echo "  CUSS // CYBERNETIC UMBILICAL STUDIO — ONE-TERMINAL LAUNCHER  "
echo "═══════════════════════════════════════════════════════════════"

if [[ ! -d "$BRIDGE_DIR/node_modules" ]]; then
  echo "→ Installing Mac Bridge dependencies..."
  (cd "$BRIDGE_DIR" && npm install)
fi

if [[ ! -d "$MOBILE_DIR/node_modules" ]]; then
  echo "→ Installing Mobile Expo dependencies..."
  (cd "$MOBILE_DIR" && npm install)
fi

# Always ensure the latest Mac Bridge is running on port 4040
/usr/sbin/lsof -ti :4040 | xargs kill -9 2>/dev/null || true
echo "→ Starting CUSS Mac Bridge on port 4040..."
(cd "$BRIDGE_DIR" && nohup npm start > "$LOG_FILE" 2>&1 &)
sleep 2

# Print the Bridge Pairing URL & Token right here so no second terminal is ever needed
if [[ -f "$LOG_FILE" ]]; then
  echo ""
  grep -E "LAN|Tailscale|Pairing token|missioncontrol://" "$LOG_FILE" | tail -n 8 || true
  echo ""
fi

echo "→ Cursor Account Login is handled directly inside the mobile app ('SIGN IN TO CURSOR TO CONTINUE')."
echo "→ Starting Expo Go server in this terminal..."
echo "═══════════════════════════════════════════════════════════════"

cd "$MOBILE_DIR"
exec npx expo start "$@"
