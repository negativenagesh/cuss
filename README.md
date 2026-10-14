<div align="center">

<img src="./assets/cuss-banner.svg" alt="CUSS — Cybernetic Umbilical Studio & Synth" width="100%" />

<br />

# **CUSS** // Cybernetic Umbilical Studio & Synth

**A Neo-Y2K Brutalist-Cybernetic Mobile Control Deck (Expo / Android & iOS) that drives your Mac's local Cursor CLI & IDE headlessly — with Zero API Keys.**

[![GitHub Stars](https://img.shields.io/github/stars/negativenagesh/cuss?style=for-the-badge&logo=github&color=D4FF00&labelColor=07070C)](https://github.com/negativenagesh/cuss/stargazers)
[![GitHub Forks](https://img.shields.io/github/forks/negativenagesh/cuss?style=for-the-badge&logo=github&color=00F0FF&labelColor=07070C)](https://github.com/negativenagesh/cuss/network/members)
[![Expo SDK 55](https://img.shields.io/badge/EXPO_GO-SDK_55-D4FF00?style=for-the-badge&logo=expo&logoColor=07070C&labelColor=10111A)](https://expo.dev)
[![NestJS Bridge](https://img.shields.io/badge/MAC_BRIDGE-NESTJS_10-00F0FF?style=for-the-badge&logo=nestjs&logoColor=00F0FF&labelColor=10111A)](./bridge)
[![Cursor Native CLI](https://img.shields.io/badge/ENGINE-CURSOR_AGENT_CLI-FF2A85?style=for-the-badge&labelColor=10111A)](./SPEC.md)
[![Tests 31/31 Passing](https://img.shields.io/badge/VITEST-31%2F31_PASSING-10F59B?style=for-the-badge&logo=vitest&labelColor=10111A)](./bridge/test)
[![License Apache-2.0](https://img.shields.io/badge/LICENSE-APACHE_2.0-A855F7?style=for-the-badge&labelColor=10111A)](./LICENSE)

</div>

---

## ⚡ Star Feature Tiles

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>🧬 01 // Zero-API-Key Mac Umbilical</h3>
      <p>Drives <code>/Applications/Cursor.app/Contents/Resources/app/bin/cursor agent</code> directly on your Mac using your logged-in Cursor Ultra/Pro account. <b>Works even when the Cursor desktop GUI window is closed.</b></p>
    </td>
    <td width="33%" valign="top">
      <h3>🎛️ 02 // Full 5-Mode Composer &amp; Model Matrix</h3>
      <p>Switch between <b>Agent</b>, <b>Plan</b>, <b>Ask</b>, <b>Debug</b>, and <b>Multitask</b>. Defaults to <b>Auto</b> with <b>Grok 4.7 / 4.6 / 4.5</b>, <b>Composer 2.5</b>, <b>Codex 5.3</b>, and <b>Claude Opus 5.5 / 5</b> pinned at the top + 4D Effort/Context/Fast/Thinking toggles.</p>
    </td>
    <td width="33%" valign="top">
      <h3>👁️ 03 // Universal In-App File Renderer</h3>
      <p>Tap <b>any file</b> anywhere in CUSS (<code>@file</code> chips, inline code paths, tool calls, Git Diff rows, Context Explorer) to view &amp; render <b>Markdown</b>, <b>CSV/TSV grids</b>, <b>Images</b>, <b>Source Code with live search</b>, or <b>Binary hex dumps</b> right on your phone.</p>
    </td>
  </tr>
  <tr>
    <td width="33%" valign="top">
      <h3>🌿 04 // Live Git Studio &amp; Worktrees</h3>
      <p>Inspect uncommitted files, view color-coded unified diffs, switch or create Git branches (<code>checkout -b</code>), stage &amp; commit changes, and run <code>git pull</code> / <code>git push</code> directly from Android.</p>
    </td>
    <td width="33%" valign="top">
      <h3>🔐 05 // Terminal, GCP OAuth &amp; Mac Screen Peek</h3>
      <p>Run unrestricted Zsh/CLI commands (<code>--force --sandbox disabled --approve-mcps</code>). Detects OAuth URLs (e.g. <code>gcloud auth login</code>) so you can authenticate in <b>Android Chrome/Brave</b> or open on your Mac and watch via <b>Mac Live Screen Peek</b>.</p>
    </td>
    <td width="33%" valign="top">
      <h3>💾 06 // Saved on Android + Motion Craft</h3>
      <p>All chat sessions and full message transcripts persist locally on your Android device via <code>expo-file-system</code>. Built with 100% custom display typography (<b>LC Mogi</b>, <b>Unbounded</b>, <b>Syne</b>, <b>Space Grotesk</b>, <b>Space Mono</b>) and 3-layer choreography.</p>
    </td>
  </tr>
</table>

---

## 🧠 How CUSS Works Without Cursor Open on Your Mac

You **never** need the `Cursor.app` GUI window open on your Mac to use CUSS from your phone:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ 📱 ANDROID PHONE (Expo Go — CUSS Mobile Deck)                           │
│  • Landing Brand Stage -> Dashboard (3D Three.js Agent Field)           │
│  • Single-Box Live Streaming Chat + Collapsible Thought Process         │
│  • Local Android Persistence (Paths.document/cuss-chat-<id>.json)       │
│  • In-App File Renderer · Git Studio · Voice Mic · Context Explorer     │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ REST + WebSocket (/ws)
                                │ Over Wi-Fi (LAN) or Tailscale (Anywhere)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ 💻 MAC BRIDGE (bridge/ — NestJS on Port 4040)                           │
│  • Bearer Pairing-Token Guard (constant-time verification + QR code)    │
│  • Spawns headless CLI: /Applications/Cursor.app/.../bin/cursor agent   │
│  • Reads ~/.cursor/projects/*/agent-transcripts/<id>/<id>.jsonl         │
│  • Reads globalStorage/storage.json, ide_state.json, mcp.json & plans   │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │ NDJSON Stream (--output-format stream-json)
                                ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ ⚙️ HEADLESS CURSOR AGENT CLI + MAC WORKSPACE                            │
│  • Uses your Mac's `cursor agent login` session (Zero API keys!)        │
│  • Full PATH access: git, gcloud, bq, node, python, homebrew, MCPs      │
│  • Shared disk transcripts: chats seamlessly resume in Cursor IDE/CLI   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Complete Step-by-Step Setup & Build Guide (Mac + Android Expo Go)

### Prerequisites
1. **macOS** with [Cursor](https://cursor.com) installed at `/Applications/Cursor.app` and **Node.js 20+**.
2. **Android phone** (or iOS device) with the **Expo Go** app installed from Google Play / App Store.
3. *(Optional for remote access outside home Wi-Fi)* [Tailscale](https://tailscale.com) installed on both your Mac and Android phone.

---

### Step 1 — One-Time Cursor CLI Login on Your Mac
Verify that Cursor's headless CLI is logged into your Cursor account (no API key needed):

```bash
/Applications/Cursor.app/Contents/Resources/app/bin/cursor agent login
/Applications/Cursor.app/Contents/Resources/app/bin/cursor agent whoami
```

---

### Step 2 — Clone the Repo & Start the Mac Bridge (`bridge/`)
Open a terminal on your Mac:

```bash
cd ~/Downloads
git clone https://github.com/negativenagesh/cuss.git
cd cuss/bridge

# Install dependencies & run the test suite (31/31 tests)
npm install
npm test

# Start the Mac bridge on port 4040
npm start
```

When `npm start` launches, your Mac terminal prints:
- A **QR Code** (`missioncontrol://pair?url=http://<YOUR_MAC_IP>:4040&token=<48_CHAR_HEX_TOKEN>`)
- Your **LAN URL** (e.g. `http://192.168.1.x:4040`) and **Tailscale URL** (e.g. `http://100.x.y.z:4040`)
- Your **Pairing Token** (stored safely at `~/.config/mission-control/config.json`)

---

### Step 3 — Launch the Mobile App in Expo Go (`mobile/`)
Open a **second terminal** on your Mac:

```bash
cd ~/Downloads/cuss/mobile

# Install dependencies
npm install

# Start the Expo development server (use --tunnel if on different networks)
npx expo start -c
```

1. Open **Expo Go** on your Android phone and scan the **Expo QR code** from the second terminal.
2. Once CUSS loads on your phone, either:
   - Scan the **Bridge Pairing QR Code** from the first terminal, **OR**
   - Tap **ENTER IP & TOKEN MANUALLY** and enter `http://<YOUR_MAC_IP>:4040` and your pairing token.
3. You will land on the centered **CUSS Studio Landing Screen** — tap **`EXPLORE CUSS`** to enter your live sessions deck!

---

## 🎨 Design System & Motion Architecture (`@motion-design`)

| Layer / Role | Implementation Details |
| :--- | :--- |
| **Typography** | **LC Mogi** (`LCMogi-A/B/C/VF`) for liquid-brutalist hero wordmarks · **Unbounded** & **Syne** for geometric display headers · **Space Grotesk** for chat prose · **Space Mono** for code, diffs, paths, and token telemetry. |
| **Color Palette** | **Obsidian Void** (`#07070C`) · **Synth Surface** (`#10111A`) · **Acid Lime** (`#D4FF00`) · **Electric Cyan** (`#00F0FF`) · **Hyper Magenta** (`#FF2A85`) · **Ultraviolet** (`#A855F7`) · **Solar Amber** (`#FFB703`). |
| **Motion Craft** | Built on `LottieFiles/motion-design-skill`: **MD3 Emphasized Decelerate** (`cubic-bezier(0.05, 0.7, 0.1, 1)`) entrances, **Disney Anticipation + Squash/Overshoot** (`SpringButton`), and **`CussSmallArtLoader`** (Lottie cyber-core + 5-bar staggered wave equalizer + live `0.1s` timer) during every wait state. |
| **Context Explorer** | Replicates Cursor IDE's 9-category `PromptContextUsageTree`: *System Prompt*, *Tool Definitions*, *Rules*, *Skills*, *MCP Servers*, *Subagents*, *Attached & Read `@Files`*, *Prompt Cache*, and *Active Conversation*. |

---

## 🧪 Verification & Test Results

| Suite / Check | Command | Result |
| :--- | :--- | :--- |
| **Bridge Unit & Integration Tests** | `cd bridge && npm test` | **4 test files · 31/31 tests passing** (`auth.spec.ts`, `cursor-api.spec.ts`, `local-agent.spec.ts`, `model-catalog.spec.ts`) |
| **Bridge TypeScript Strict Check** | `cd bridge && npx tsc --noEmit` | **0 errors** |
| **Mobile TypeScript Strict Check** | `cd mobile && npx tsc --noEmit` | **0 errors** |
| **Expo Android Production Bundle** | `cd mobile && npx expo export --platform android` | **Clean Hermes bytecode bundle (`.hbc`) + 10 bundled TTF fonts verified** |

---

## 📂 Repository Structure

```text
cuss/
├── assets/
│   └── cuss-banner.svg                 # Bespoke Neo-Y2K brutalist vector brand banner
├── bridge/                             # Mac NestJS + WebSocket + Cursor CLI Bridge (Port 4040)
│   ├── src/
│   │   ├── main.ts                     # Bridge bootstrap, LAN/Tailscale QR generator
│   │   ├── local-agent.ts              # Headless `cursor agent` runner, Git, Shell, Screen & Speech
│   │   ├── local-agents.controller.ts  # REST endpoints (/api/local/*)
│   │   ├── model-catalog.ts            # 4D Model Matrix, IDE state, JSONL parser & File Reader
│   │   ├── live.gateway.ts             # Real-time WebSocket (/ws) event multiplexor
│   │   ├── cursor-api.ts               # Optional Cursor Cloud Agents v1 client
│   │   └── auth.guard.ts               # Constant-time Bearer pairing-token guard
│   └── test/                           # 31 Vitest unit & integration specs
├── mobile/                             # Expo SDK 55 / React Native Android & iOS App
│   ├── App.tsx                         # Custom font loader & navigation stack
│   ├── assets/fonts/                   # Bundled LC Mogi, Unbounded, Syne, Space Grotesk & Space Mono
│   └── src/
│       ├── store.ts                    # Zustand state + Android device persistence (expo-file-system)
│       ├── theme.ts                    # CUSS color palette & @motion-design constants
│       ├── api/                        # REST client.ts & auto-reconnecting WebSocket live.ts
│       ├── components/
│       │   ├── CussArt.tsx             # Lottie Cyber-Core, CussSmallArtLoader & Synth Wave Bars
│       │   ├── CussIcons.tsx           # SpringButton, Context Ring & custom vector icons
│       │   ├── CursorComposer.tsx      # 5-Mode switcher, 4D Model Matrix, @File drawer & Voice Mic
│       │   ├── ContextUsageSheet.tsx   # 9-Category Cursor Context Window Explorer
│       │   ├── MarkdownRenderer.tsx    # AST Markdown, ThinkingAccordion, ToolCallBlock & FileViewerModal
│       │   ├── WorkspaceVaultDropdown.tsx # Sculptural IDE Vault & Mac Disk Tree navigator
│       │   └── AgentField.tsx          # 3D Three.js / WebGL orbital agent reactor
│       └── screens/
│           ├── LandingScreen.tsx       # Centered artistic CUSS monolith & Explore Studio entry
│           ├── DashboardScreen.tsx     # Live sessions, 3D reactor, IDE sync, Rename & Delete
│           ├── AgentDetailScreen.tsx   # Single-box streaming chat, Git Studio, Shell/GCP & Mac Peek
│           ├── CreateAgentScreen.tsx   # Workspace Vault picker & agent launcher
│           └── PairScreen.tsx          # QR reticle scanner & manual LAN/Tailscale pairing
├── SPEC.md                             # Reverse-engineering & protocol specification
├── plan.md                             # Design, typography & motion architecture blueprint
└── REA-TASK.md                         # REA verification notes
```

---

## 📄 License

Licensed under the **Apache License 2.0** — see [`LICENSE`](./LICENSE) for details.
