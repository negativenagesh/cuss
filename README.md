<div align="center">

<img src="./assets/cuss-banner.svg" alt="CUSS — Cybernetic Umbilical Studio & Synth" width="100%" />

# CUSS — Cybernetic Umbilical Studio & Synth

**A mobile engineering workstation for Android and iOS that drives your Mac's local Cursor CLI and IDE over a low-latency local bridge — with zero API keys, zero terminal setup, and full Cursor parity.**

[![Release](https://img.shields.io/badge/RELEASE-v0.5.2-D4FF00?style=for-the-badge&labelColor=07070C)](https://github.com/negativenagesh/cuss/releases)
[![Mac Installer](https://img.shields.io/badge/MACOS_INSTALLER-cuss.dmg-00F0FF?style=for-the-badge&labelColor=07070C)](https://github.com/negativenagesh/cuss/releases)
[![Android APK](https://img.shields.io/badge/ANDROID_APP-cuss.apk-FF2A85?style=for-the-badge&labelColor=07070C)](https://github.com/negativenagesh/cuss/releases)
[![Tests](https://img.shields.io/badge/VITEST-31%2F31_PASSING-10F59B?style=for-the-badge&labelColor=07070C)](#verification-and-test-suite)

</div>

---

## Overview and Why CUSS Exists for Developers

Modern AI-assisted software development happens inside **Cursor** on a developer's workstation, where local repositories, Git credentials, SSH keys, Docker containers, MCP servers, and CLI tools live. However, the moment a developer steps away from their desk, they lose visibility and control over long-running agent tasks, test suites, Git branches, and browser OAuth flows.

**CUSS** solves this by turning your Android phone into a direct, low-latency remote control deck for your Mac's Cursor environment:

1. **Zero API Keys Required**: CUSS drives `/Applications/Cursor.app/Contents/Resources/app/bin/cursor agent` directly using your existing Cursor Pro or Ultra subscription.
2. **Works Even When the Cursor Desktop Window Is Closed**: Because the Mac bridge spawns the standalone `cursor-agent` binary headlessly in your project directory, you can spawn new sessions, stream token-by-token responses, and edit files on your Mac without keeping the Cursor GUI open.
3. **Zero-Terminal Background Operation**: The macOS installer (`cuss.dmg`) installs a native macOS Menu Bar companion (`/Applications/CUSS Menu.app`) and `launchd` background services that keep the Mac Bridge (`:4040`) running automatically on login.

---

## Visual Walkthrough: macOS Installer, Menu Bar App, and Mobile Control Deck

### 1. Self-Contained macOS Installer (`cuss.dmg` -> `Install CUSS.app`)

<p align="center">
  <img src="./assets/screenshots/cuss-installer.png" alt="CUSS macOS Installer" width="49%" />
  <img src="./assets/screenshots/cuss-pairing-qr.png" alt="CUSS Installer Pairing QR" width="49%" />
</p>

- **Left**: Opening `cuss.dmg` and launching `Install CUSS.app` presents a native macOS Core Animation installer. Clicking **INSTALL CUSS** installs a bundled Node 22 (`arm64`) runtime, the NestJS Mac Bridge, precompiled native CoreGraphics/Accessibility helpers (`cuss-mac-input`, `cuss-mac-speech`), and `/Applications/CUSS Menu.app`. Target Macs do not need Node.js, npm, Xcode, or Terminal preinstalled.
- **Right**: Once installation completes, the installer automatically syncs your Cursor Desktop credentials, starts the background `com.cuss.bridge` and `com.cuss.menubar` LaunchAgents, verifies that port `4040` is healthy, and renders an instant **Pairing QR Code** on screen.

---

### 2. Native macOS Menu Bar Companion (`CUSS Menu.app`)

<p align="center">
  <img src="./assets/screenshots/cuss-menubar-hud.png" alt="CUSS macOS Menu Bar and Pairing HUD" width="100%" />
</p>

- **How It Works**: Lives permanently in the top-right macOS status bar (`CUSS`). It polls the local bridge health endpoint (`http://127.0.0.1:4040/api/health`), monitors the optional Expo Go development bundler (`:8081`), and reads your active Cursor account from `~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`.
- **How to Use It**:
  - Click **CUSS** in the top macOS menu bar at any time.
  - Click **Pair Phone — Show QR Code & Control HUD** to display the scannable pairing QR code (`missioncontrol://pair?url=...&token=...`) and live network telemetry.
  - Use **Copy Mac Bridge URL**, **Copy Pairing Token**, **Sync Cursor Desktop Login Now**, or **Restart Background Services** with one click.

---

### 3. Mobile Studio Deck: Plan & Usage, Directory Picker, and Zoomable Live Mirror

<p align="center">
  <img src="./assets/screenshots/cuss-mobile-overview.png" alt="CUSS Mobile Control Deck Overview" width="100%" />
</p>

---

## Technical Capabilities and How to Use Each Feature

### 01 // Zero-Terminal Cursor Authentication (`state.vscdb` + Mobile PKCE OAuth)

- **Technical Mechanism**:
  - Cursor's headless `cursor-agent` binary includes a `FileCredentialManager` activated by setting `AGENT_CLI_CREDENTIAL_STORE=file`, which reads `{ accessToken, refreshToken }` from `~/.cursor/auth.json` (`0600`).
  - On startup, the CUSS Mac Bridge queries `Cursor.app`'s local SQLite state database (`~/Library/Application Support/Cursor/User/globalStorage/state.vscdb`, table `ItemTable`, keys `cursorAuth/accessToken` and `cursorAuth/refreshToken`) and writes `~/.cursor/auth.json` automatically.
  - If `Cursor.app` is not signed in on the Mac, the mobile app generates a cryptographic PKCE challenge (`uuid`, `verifier`, SHA-256 base64url `challenge`) in 0.1ms, opens `https://cursor.com/loginDeepControl` in your phone's browser, polls `https://api2.cursor.sh/auth/poll`, and pushes the resulting tokens to `POST /api/local/auth/complete`.
- **How to Use It**:
  - If you are already signed into Cursor on your Mac, authentication is automatic on first launch.
  - If not signed in, tap **SIGN IN TO CURSOR TO CONTINUE** on the mobile landing screen and approve the login in Chrome or Brave on your phone.
- **Why It Is Useful for Developers**:
  - Eliminates manual `cursor agent login` terminal steps, SSH key forwarding, or copying API keys onto a mobile device.

---

### 02 // Cursor Settings, Plan Quota, and Spend Telemetry (`GET / POST /api/local/settings`)

- **Technical Mechanism**:
  - Queries Cursor's `aiserver.v1.DashboardService/GetPlanInfo`, `GetCurrentPeriodUsage`, and `GetHardLimit` endpoints over HTTPS using your local Cursor access token, and merges the response with `~/.cursor/cli-config.json`, `~/Library/Application Support/Cursor/User/settings.json`, `state.vscdb`, and `~/.cursor/mcp.json`.
- **How to Use It**:
  - Tap **SETTINGS** in the top bar of the Landing screen, the Sessions Dashboard (`CUSS // SESSIONS`), or any Agent Detail screen.
  - **PLAN & USAGE Tab**: Inspect your active subscription tier (`ULTRA` / `PRO`), billing cycle reset countdown, three live usage bars (**Total Included Usage %**, **Auto / Composer 2.5 / Grok 4.7 Bucket %**, and **Named Frontier API %**), USD compute spend breakdown (**Included Credit**, **Provider Bonus Credit**, **Total Compute Value Used**, and **On-Demand Hard Cap status**), the list of models included in the Auto bucket, and total input/output/cache-read tokens across your local CUSS sessions.
  - **GENERAL & DIR Tab**: Toggle Cursor CLI flags (`Max Mode`, `Disable Sandbox`, `Auto-Accept Web Search`, `Attribute Git Commits`, `Attribute PRs`, `Notifications`, `Vim Mode`) and Cursor Desktop editor preferences (`Git Autofetch`, `Terminal Inline Images`, `Auto-Detect OS Color Scheme`, `Format On Save`) — every toggle writes directly to `~/.cursor/cli-config.json` or `settings.json` on your Mac.
  - **MODELS & DEFAULTS Tab**: Configure your default execution mode, model family, reasoning effort, context window (`auto`, `256k`, `1M`), Fast mode, and Extended Thinking.
  - **PRIVACY & PLANS Tab**: Verify `PRIVACY_MODE_NO_TRAINING` / `Ghost Mode` status and open any saved Cursor architecture plan (`~/.cursor/plans/*.md`) in the in-app file viewer.
  - **MCP & BRIDGE Tab**: Inspect all configured MCP servers from `~/.cursor/mcp.json` and manage bridge pairing.
- **Why It Is Useful for Developers**:
  - Gives complete visibility into Cursor quota consumption and lets you switch to Auto-bucket models (`Auto`, `Composer 2.5`, `Grok 4.7`) before hitting named API limits.

---

### 03 // Mac Working Directory Selector and Folder Browser (`DirectoryPickerModal`)

- **Technical Mechanism**:
  - Combines automatic repository discovery (`discoverLocalProjects()` scanning active Cursor workspaces, `~/.cursor/projects`, Git worktrees, and `~/Downloads`) with a live filesystem directory browser (`GET /api/local/browse-dirs?path=...`) that detects `.git` repositories and active branch names.
  - Persists your chosen `selectedCwd` on the Android device (`cuss-device-state-v1.json`) and pre-populates new agent spawns.
- **How to Use It**:
  - **On the Main Landing Page (after Sign-In)**: Tap the **WORK DIR / SELECT DIR** row in the telemetry card to pick a discovered repository or browse any folder on your Mac (`~`, `Downloads`, parent `..`, or custom path). Tap **SPAWN AGENT IN <DIR>** to launch an agent directly in that directory.
  - **On the Sessions Dashboard (`CUSS // SESSIONS`)**: Tap the Working Directory bar beneath the header to switch directories at any time, toggle **THIS DIR / ALL DIRS** to filter sessions by directory, or tap **SPAWN** to start a new chat in the selected folder.
- **Why It Is Useful for Developers**:
  - Lets you hop across multiple repositories, monorepo packages, or Git worktrees from your phone without touching the Mac.

---

### 04 // 5-Mode Cursor Composer, Model Matrix, and `@file` Context Vault

- **Technical Mechanism**:
  - Replicates Cursor's five execution modes (`Agent`, `Plan`, `Ask`, `Debug`, `Multitask`) and passes the corresponding CLI flags and structured mode instructions to `cursor-agent --print --output-format stream-json --stream-partial-output --force --sandbox disabled --approve-mcps`.
  - Pre-warms chat session UUIDs (`create-chat`) in the background so dispatching a prompt begins streaming in milliseconds.
- **How to Use It**:
  - Select your mode pill (`AGENT`, `PLAN`, `ASK`, `DEBUG`, `MULTITASK`) and model (`Auto`, `Grok 4.7`, `Composer 2.5`, `Codex 5.3`, `Claude Opus`, etc.) in the bottom-pinned composer.
  - Tap **`@`** (or type `@filename`) to search workspace files via `GET /api/local/files` and attach `@file` context chips to your turn.
  - Tap the **Context Gauge (`%`)** pill to open the 9-category **Prompt Context Usage Explorer** (*System Prompt*, *Tool Definitions*, *Rules*, *Skills*, *MCP Servers*, *Subagents*, *Attached `@Files`*, *Prompt Cache*, and *Active Conversation*).
- **Why It Is Useful for Developers**:
  - Provides the same granular control over model selection, reasoning effort, context window, and file grounding as the desktop IDE.

---

### 05 // Zoomable Flicker-Free Mac Live Mirror and Pointer-Targeted Live Scroll

- **Technical Mechanism**:
  - **Single-Flight Atomic Capture**: The bridge captures the Mac display (`/usr/sbin/screencapture -x -C -t jpg`, including the live system cursor) into a staging file and atomically renames it, streaming base64 frames over WebSocket (`mirror:subscribe` -> `mirror:frame`).
  - **GPU Double-Buffered Canvas**: The mobile `DoubleBufferedMirrorCanvas` maintains two stacked `<Image>` buffers (Slot A and Slot B) and swaps visibility only inside `onLoad` after decoding finishes, eliminating frame flicker.
  - **2-Finger Pinch-to-Zoom (`1x` – `4x`) & Matrix Inversion**: Pinching with two fingers scales (`1.0x` to `4.0x`) and pans the viewport. Every touch event inverts the `(translateX, translateY, scale)` transformation matrix before mapping to normalized Mac screen coordinates `(nx, ny) in [0, 1]`.
  - **Native CoreGraphics Pointer & Scroll Daemon (`cuss-mac-input.swift`)**: A persistent native Swift daemon reads commands over stdin (`click`, `doubleclick`, `rightclick`, `move`, `moverel`, `scrollat <nx> <ny> <dy> <dx>`), warps the Mac cursor (`CGWarpMouseCursorPosition`), and posts both `.line` and `.pixel` `CGEvent` scroll wheel events to the window under your finger in ~1ms.
- **How to Use It**:
  - Inside any chat session, tap **LIVE MIRROR** in the top bar (and optionally **FULL SCREEN**).
  - **Switch Any Mac App**: Tap any running app in the **OPEN APPS ON MAC NOW** strip, or tap **ALL MAC APPS** to launch/focus any application in `/Applications`.
  - **Zoom In**: Pinch with **2 fingers** on the mirror (or tap the **ZOOM: `1x` / `1.5x` / `2x` / `3x` / `4x`** pills) to inspect small UI elements. Use **PAN ZOOMED VIEW** to pan around with one finger when zoomed in.
  - **Scroll & Click with `TRACKPAD (TAP + DRAG SCROLL)`**:
    - **Tap 1 finger** anywhere on the mirror to click that exact spot on the Mac.
    - **Drag 1 finger up/down/left/right** on the mirror to move the Mac pointer to that window and **live-scroll the Mac window under your finger in real time**.
    - **Long-press (440ms)** to right-click.
- **Why It Is Useful for Developers**:
  - Lets you inspect browser previews, scroll through long files or logs in Cursor/Chrome/Terminal, click OAuth consent buttons, and interact with any Mac GUI window from your phone.

---

### 06 // Live Remote Keyboard with Focused-Field Accessibility Echo (`MacRemoteKeyboard`)

- **Technical Mechanism**:
  - **Per-Keystroke Diff Streaming**: In `LIVE: ON` mode, `onChangeText` diffs the previous and current input strings and streams minimal `type-text` (base64 UTF-8) and `backspace` commands over the WebSocket `mirror:input` fast path (~5ms round-trip with `mirror:input:ack` latency telemetry) into a strictly serialized queue (`macInputChain`).
  - **Native Unicode Injection**: `cuss-mac-input` injects UTF-16 code units via `CGEvent.keyboardSetUnicodeString`, supporting full Unicode, symbols, and punctuation. Pressing **Enter** on the phone keyboard sends virtual key code `36` (`Return`), submitting prompts or search boxes on the Mac.
  - **Focused-Field Echo & Secure Lock**: Queries macOS Accessibility (`AXUIElementCopyAttributeValue` for `kAXFocusedUIElementAttribute`, with automatic `AXManualAccessibility` opt-in for Electron/Chromium apps) to display the focused field's role, title, and live text value with a blinking caret directly beneath the phone input. When `AXSecureTextField` is detected, echo is disabled and the phone input switches to `secureTextEntry`.
- **How to Use It**:
  - Open **LIVE MIRROR**, tap any text input on the mirrored Mac screen (Cursor composer, Google search bar, Slack, Terminal), and type in the phone's **LIVE KEYBOARD** input box.
  - Press **Enter / Send** on your phone keyboard to trigger Return on the Mac (or cycle **ENTER: AUTO / Return / Cmd+Return / Shift+Return** per app).
  - Use **UNDO** to reverse your last typed burst, **PASTE PHONE -> MAC** (`pbcopy` + `Cmd+V`), **COPY MAC -> PHONE** (`pbpaste`), **DICTATE -> MAC** (voice transcription via `cuss-mac-speech` / `SFSpeechRecognizer`), or the **Per-App Quick Action Rails** (for Cursor, VS Code, Chrome, Safari, Terminal, Slack, Finder, and Notes).
- **Why It Is Useful for Developers**:
  - Turns your phone into a real-time wireless keyboard, voice dictation mic, and shortcut deck for any focused Mac application.

---

### 07 // Universal In-App File Viewer, Live Git Studio, and Mac Zsh Terminal

- **Universal File Viewer (`FileViewerModal`)**:
  - **How to Use**: Tap any `@file` chip, inline file path in assistant prose, tool-call file card, or changed file in Git Studio.
  - **What It Renders**: Syntax-highlighted source code with line numbers and live line search, rendered Markdown previews, formatted CSV/TSV data tables, inline images (`png`/`jpg`/`webp`/`gif`), or binary hex/metadata views.
- **Live Git Studio (`GET /api/local/git-diff` & `POST /api/local/git-action`)**:
  - **How to Use**: Tap **GIT** in the top bar of any Mac agent session.
  - **Capabilities**: View uncommitted changed files (`M`, `A`, `D`, `??`), inspect color-coded unified diffs, switch branches, create new branches (`checkout -b`), write a commit message to stage & commit (`git add -A && git commit`), and run `git pull` / `git push`.
- **Unrestricted Mac Shell & OAuth Link Catcher (`POST /api/local/exec-shell`)**:
  - **How to Use**: Tap **SHELL / GCP** in the top bar to run one-tap presets (`git status`, `gcloud auth status`, `gcloud config list`, `npm test`) or arbitrary `zsh` commands in the workspace directory.
  - **OAuth Detection**: Automatically extracts `https://...` login URLs from command output so you can open them in your phone browser or on the Mac browser.

---

## Installation Guide: End Users (`cuss.dmg` + `cuss.apk`)

Download both artifacts from the [**GitHub Releases page**](https://github.com/negativenagesh/cuss/releases):

1. **Install on macOS (`cuss.dmg`)**:
   - Open **`cuss.dmg`** and double-click **`Install CUSS`** (on first launch, right-click -> **Open** to bypass Gatekeeper for ad-hoc signed builds).
   - Click **INSTALL CUSS**. The installer sets up the bundled Node 22 runtime, the Mac Bridge (`:4040`), precompiled native helpers, and **`/Applications/CUSS Menu.app`** (`CUSS` in your top menu bar).
   - When macOS prompts for permissions, allow **Accessibility** (for Live Keyboard injection and focused-field echo) and **Screen Recording** (for Live Mirror capture) for `node`.
2. **Install on Android (`cuss.apk`)**:
   - Download and install **`cuss.apk`** on your Android phone.
   - Open **CUSS** on your phone. If your phone and Mac are on the same Wi-Fi LAN, CUSS auto-discovers and pairs with your Mac bridge; or tap **SCAN** and point your camera at the QR code shown in the macOS installer or in **CUSS -> Pair Phone** in the Mac menu bar.

---

## Developer Setup and Building from Source

```bash
git clone https://github.com/negativenagesh/cuss.git
cd cuss

# Start both the Mac Bridge (:4040) and Expo Go bundler (:8081) in one command:
npm start

# Install permanent macOS LaunchAgents + /Applications/CUSS Menu.app:
npm run menubar:install

# Rebuild native Swift helpers (cuss-mac-input and cuss-mac-speech):
npm run native:build

# Build the self-contained macOS installer disk image (dist/cuss.dmg):
npm run dmg

# Trigger a standalone Android APK build on Expo EAS (requires `npx eas-cli login`):
npm run apk
```

---

## Verification and Test Suite

Run the full test and static type-verification suite from the repository root:

```bash
npm test
```

| Check | Command | Status |
| :--- | :--- | :--- |
| **Bridge Unit & Integration Tests** | `npm --prefix bridge test` | **4 test suites · 31/31 tests passing** (`auth.spec.ts`, `cursor-api.spec.ts`, `local-agent.spec.ts`, `model-catalog.spec.ts`) |
| **Bridge TypeScript Strict Check** | `./bridge/node_modules/.bin/tsc -p bridge/tsconfig.json --noEmit` | **0 errors** |
| **Mobile TypeScript Strict Check** | `./mobile/node_modules/.bin/tsc -p mobile/tsconfig.json --noEmit` | **0 errors** |
| **Expo Doctor Validation** | `cd mobile && npx expo-doctor` | **21/21 checks passed** |

---

## License

MIT
