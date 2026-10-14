# CUSS — Quirky Mobile Control Deck for Cursor (`plan.md`)

> **Brand Identity:** **CUSS** (*Cybernetic Umbilical Studio & Synth*)
> **Design Persona:** Quirky, Brutalist-Cybernetic, Neo-Y2K Experimental Lab
> **Motion System:** Built on [`LottieFiles/motion-design-skill`](https://github.com/LottieFiles/motion-design-skill) (Three Pillars + Three Motion Layers + Disney Principles)
> **Reverse-Engineering Authority:** REA Live Browser Capture (`ev_72cac7c7…`), REA Static JS Graph (`ev_dccf2fdf…`), and Local `cursor agent` CLI (`v3.24.18`)

---

## 1. What We Reverse-Engineered from Cursor's Chat & Composer (REA Evidence)

Using REA's browser inspection (`ev_df9bd4a0…`), reload network capture (`ev_72cac7c7…`), static chunk analysis (`23oxtabjy4dot.js`, `1wp23zqi6f03_.js`, `24h8se95pqk1s.js`, `0c8muoeta79_v.js`), and the local `cursor agent` binary on this Mac, we mapped every control inside Cursor's chat composer:

### 1.1 Execution Modes (`agentMode` & CLI `--mode`)
| Mode | Cursor Internal ID | CLI / Bridge Mapping | Purpose |
|---|---|---|---|
| **Agent** | `agent` | Default (`--trust`) | Full autonomy: reads, edits, writes files, and runs shell commands on the Mac |
| **Plan** | `plan` (`supportsPlanMode`) | `--mode plan` | Read-only architectural exploration; proposes a step-by-step implementation blueprint before editing |
| **Ask** | `ask` | `--mode ask` | Read-only Q&A mode for deep codebase explanations and trace walk-throughs without touching files |
| **Debug** | `debug` (`@debug` subagent) | Structured Debug Prompt + `--trust` | Hypothesis-driven root-cause analysis, log inspection, and targeted bug isolation |
| **Multitask** | `multitask` (`selectedSubagents`) | Parallel Subagent / Multi-Chat Dispatch | Spawns or delegates across specialized subagents (`@explore`, `@debug`, `@shell`, `@computerUse`) or parallel prompts |

### 1.2 Logged-In Account Model Catalog & 4D Parameter Matrix
From `/api/background-composer/available-models` (REA capture `ev_72cac7c7…`) and `cursor agent --list-models` on your logged-in Mac (`subrahmanya.gaonkar@opptra.com`), Cursor organizes **90+ model variants** into base families with **4 orthogonal parameter controls**:

1. **Effort / Reasoning (`effort` / `reasoning` / `reasoning_effort`)**
   - Values: `none` · `minimal` · `low` · `medium` · `high` · `xhigh` (Extra High) · `max`
   - Controls how deeply the model reasons before emitting actions (hotkey-cycleable in Cursor).
2. **Context Window (`context` & `supportsMaxMode`)**
   - Values: `200k` · `256k` · `272k` · `300k` · `500k` · `1m` (1M Max Mode context window).
3. **Fast Mode (`fast`)**
   - Values: `false` · `true` — high-speed turbo inference toggle (represented by the lightning bolt icon in Cursor's picker).
4. **Extended Thinking (`thinking`)**
   - Values: `false` · `true` — toggles explicit `thinking` stream blocks on models that support both thinking and non-thinking variants (e.g. `Claude Opus 5`, `Claude Opus 4.8`, `Claude Sonnet 5`, `Claude Haiku 5.5`).

**How the Mac CLI consumes them (CONFIRMED):**
`cursor agent` accepts either:
- The resolved variant slug from `cursor agent --list-models` (e.g. `claude-opus-5-5-high-fast`, `claude-opus-5-thinking-xhigh-fast`, `gpt-5.6-sol-high-fast`, `grok-4.7-xhigh-fast`), OR
- The bracket override syntax: `--model 'claude-opus-5-5[context=1m,effort=high,fast=true]'`.

Our bridge will expose `GET /api/local/models`, which runs `cursor agent --list-models` live on your Mac and groups the returned slugs into families with their exact available `effort`, `context`, `fast`, and `thinking` options.

### 1.3 Structured Prompt Context & Attachments (`1wp23zqi6f03_.js` & `24h8se95pqk1s.js`)
Cursor's composer maintains a structured selection state alongside prompt text:
- **`@Files` & `@Folders` (`selectedDocuments` / `attachedCodeChunks`)**: Attaches specific workspace files so the agent focuses on exact modules.
- **`@Git` Context**: Injects current branch and uncommitted diff status (`git status --short` / `git branch --show-current`).
- **`/Slash` Commands (`cursorCommands`)**: Quick workflow directives (`/plan`, `/review`, `/test`, `/fix`, `/simplify`).
- **Subagent Badges (`selectedSubagents`)**: `@explore`, `@debug`, `@shell`, `@computerUse`.
- **Context Meter**: Displays active token usage (`inputTokens + cacheReadTokens`) relative to the selected context window (`300K` or `1M`).

### 1.4 Deep Local Mac Cursor System Files (Discovered in v0.4.0)
By inspecting Cursor's local filesystem state on this Mac (`~/.cursor/` and `~/Library/Application Support/Cursor/`), we uncovered five additional native data sources:
1. **Unrestricted Shell & MCP Execution Flags (`cursor agent --help` + `d4deb3a3.jsonl` forensic analysis)**:
   - Without `--force` (`--yolo`), `--sandbox disabled`, and `--approve-mcps`, headless `--print` runs reject shell commands (`gcloud`, `bq`, `curl`, etc.). Passing `--force --sandbox disabled --approve-mcps` unlocks full tool, shell, and MCP execution, and returns command `stdout` inside `tool_call.shellToolCall.result.success.interleavedOutput`.
2. **`~/Library/Application Support/Cursor/User/globalStorage/storage.json`**:
   - `windowsState.lastActiveWindow.folder`: reveals the **exact workspace folder currently open in the Cursor IDE window on this Mac** (e.g. `/Users/subramanyadattatrayag/Downloads/opptra-scrapers`).
   - `profileAssociations.workspaces`: lists all historical Cursor IDE workspaces on this Mac.
3. **`~/.cursor/ide_state.json`**:
   - `recentlyViewedFiles`: lists the exact files the user was just viewing/editing in the Mac Cursor IDE.
4. **`~/.cursor/projects/<project-slug>/agent-transcripts/<sessionId>/<sessionId>.jsonl`**:
   - Stores persistent JSONL transcripts (`role: user | assistant`, `message.content[]` with `text` and `tool_use` blocks) for **all** IDE and CLI agent sessions. Reading these files lets CUSS load full conversation history even after a bridge restart and lets the phone browse/resume chats started directly in the Mac IDE.
5. **`~/.cursor/plans/*.plan.md` & `~/.cursor/mcp.json`**:
   - Stores saved Cursor architectural plans (`~/.cursor/plans/`) and configured MCP servers (`21st`, `headroom`, `rea`).

---

## 2. Quirky Visual Direction & Typography System ("CUSS")

### 2.1 Typography Hierarchy (100% Custom Bundled Fonts — No Generic System Fonts)
All fonts are bundled locally as genuine TrueType files in `mobile/assets/fonts/` and loaded via `expo-font`:

| Role | Font Family | File(s) in `mobile/assets/fonts/` | Why It Fits **CUSS** |
|---|---|---|---|
| **Brand Wordmark, Hero Counters & Screen Titles** | **LC Mogi** | `LCMogi-A.ttf`, `LCMogi-B.ttf`, `LCMogi-C.ttf`, `LCMogi-VF.ttf` | Wild, liquid-quirky experimental display letterforms that give **CUSS** an unmistakable underground studio silhouette |
| **Mode Badges, Section Headers & Stat Pills** | **Unbounded** & **Syne** | `Unbounded-Variable.ttf`, `Syne-Variable.ttf` | Wide-stance, eccentric art-house geometric display type with high contrast and quirky proportions |
| **Chat Copy, Parsed Markdown & UI Controls** | **Space Grotesk** | `SpaceGrotesk-Medium.ttf`, `SpaceGrotesk-Bold.ttf` | Quirky neo-grotesque with pronounced ink traps — effortless to read at small sizes while keeping weirdness alive |
| **Code Blocks, Tool Calls, Paths & Token Telemetry** | **Space Mono** | `SpaceMono-Regular.ttf`, `SpaceMono-Bold.ttf` | Eccentric rectilinear monospace designed for retro-futuristic technical readouts |

### 2.2 Color Palette & Quirky Brutalist Art Language
- **Obsidian Void (`#07070C`)**: Primary canvas background.
- **Synth Surface (`#11121C`) & Elevated Plate (`#191B2A`)**: Brutalist cards with crisp `1.5px` exposed structural borders (`#2A2D45`) and offset hard-edge neo-brutalist accents.
- **Acid Lime (`#D4FF00`)**: Primary active energy, running agents, and CTA highlights.
- **Hyper Magenta (`#FF2A85`)**: Thinking state, high-effort / Max-mode badges, and error alerts.
- **Electric Cyan (`#00F0FF`)**: Tool execution, `@file` context chips, and Mac terminal bridge link.
- **Warm Bone (`#F4F0EA`) & Muted Pewter (`#989EC2`)**: High-contrast readable prose.
- **Bespoke Generative SVG Art**:
  - Custom wireframe cyber-sigils, corner crosshair registration marks (`+`), diagonal hazard stripes, and animated Lottie JSON mascots (*CUSS Eye*, *Neural Synapse*, *Orbital Core*) where empty gaps used to be.
- **Strict Zero-Emoji Rule**: Every emoji (`💻`, `☁️`, `🖥`, `✕`, `✅`, `❌`) is eliminated and replaced with custom interactive `react-native-svg` / `lucide-react-native` vector icons that animate on press.

---

## 3. Motion Architecture (`LottieFiles/motion-design-skill`)

Following the installed `motion-design` skill's **8-Step Checklist** and **Three Pillars**:

1. **Motion Personality Archetype**: **Energetic + Playful Hybrid**
   - **Signature Easing**: `cubic-bezier(0.05, 0.7, 0.1, 1)` (MD3 Emphasized Decelerate) for entrances; `cubic-bezier(0.3, 0, 1, 1)` for exits.
   - **Interactive Spring**: `stiffness: 280, damping: 18` (snappy 8–12% overshoot on mode pills, model options, and send button).
   - **Duration Palette**: Quick `120ms` (button/icon press), Standard `240ms` (card/drawer transition), Slow `420ms` (modal/hero reveal).
2. **Three Motion Layers on Every Screen**:
   - **Primary Layer**:
     - Dashboard 3D `AgentField` orbital core + satellite orbs (`@react-three/fiber` + `three`).
     - Spring-animated Composer Dock that glides smoothly with the keyboard.
     - Staggered card & message entrances (`35ms` micro-cascade, `<350ms` total budget per the 1/3 Rule).
   - **Secondary Layer**:
     - Interactive vector icons with Disney **anticipation + squash-and-stretch** (`scale: 0.92` on press → `1.08` overshoot → `1.0` settle + `8°` icon tilt).
     - Collapsible `Thinking` and `Tool Call` drawers with rotating chevron vectors and border glow transitions.
   - **Ambient Layer** (`<20%` visual energy):
     - Custom **Lottie** animations (`lottie-react-native`) in the header status badge, empty-state illustration, and thinking indicator.
     - Slow breathing rings (`2400ms` sine oscillation `0.97 ↔ 1.03`) and subtle rotating brutalist starburst sigils (`18s/rev` linear).

---

## 4. Step-by-Step Implementation Plan

### Step 1 — Upgrade Mac Bridge (`bridge/`) for Full Cursor Parity
1. **`GET /api/local/models`**:
   - Executes `cursor agent --list-models` on the Mac, parses every available model ID and label for the logged-in user, and groups them into model families (`Auto`, `Claude Opus 5.5`, `Claude Opus 5`, `Claude Sonnet 5.5`, `Claude Sonnet 5`, `GPT-5.6 Sol`, `GPT-5.6 Luna`, `GPT-5.6 Terra`, `Codex 5.3`, `GPT-5.5`, `Grok 4.7`, `Grok 4.6`, `Composer 2.5`, `Gemini 4 Argon`, `Gemini 3.8 Flash`, `Muse Spark 1.3`, `Claude Haiku 5.5`, `Kimi K3`, `GLM 5.3`, etc.) with their supported `effort`, `context`, `fast`, and `thinking` options.
2. **`GET /api/local/projects`**:
   - Scans known Cursor workspaces (`~/.cursor/projects`, `~/Downloads`, current repo) and returns quick-pick project directories with their current Git branch.
3. **`GET /api/local/files?cwd=...&q=...`**:
   - Lists workspace files (ignoring `node_modules`, `.git`, `dist`) so the mobile composer's `@File` drawer can search and attach real files from the Mac.
4. **Enhanced `POST /api/local/agents` & `POST /api/local/agents/:id/prompt`**:
   - Accepts `mode` (`agent` | `plan` | `ask` | `debug` | `multitask`), `model` (resolved slug or bracket expression `model[context=...,effort=...,fast=...]`), `attachments` (`@file` paths & `@git` diff flag), and `subagents`.
   - Maps `--mode plan` and `--mode ask` directly to the CLI flags, handles `debug` with root-cause instrumentation framing, and handles `multitask` by dispatching subagent directives or parallel tasks.

### Step 2 — Upgrade Mobile App (`mobile/`) into **CUSS**
1. **Install Dependencies & Load Fonts**:
   - Install `lottie-react-native`, `react-native-svg`, `lucide-react-native`, `expo-font`.
   - Load `LCMogi-A`, `LCMogi-B`, `LCMogi-C`, `LCMogi-VF`, `Unbounded`, `Syne`, `SpaceGrotesk-Medium`, `SpaceGrotesk-Bold`, `SpaceMono-Regular`, `SpaceMono-Bold` at boot.
2. **Build Custom Vector Icon & Quirky Art System (`src/components/CussIcons.tsx` & `src/components/CussArt.tsx`)**:
   - Interactive animated vector icons (`AnimatedPressableIcon`) + Lottie JSON animations (`CussLottie.tsx`) + brutalist SVG cyber-art banners. Zero emojis anywhere.
3. **Build Structured Markdown & Activity Stream Renderer (`src/components/MarkdownView.tsx`)**:
   - Parses headings, bold, italic, inline code, fenced code blocks (with language tag, line numbers, and copy action), lists, blockquotes, and tables into styled React Native views using `SpaceGrotesk` and `SpaceMono`.
   - Collapsible `Thinking` accordion & expandable `Tool Call` cards with custom SVG tool icons.
4. **Build Keyboard-Aware Cursor Composer Dock (`src/components/CursorComposer.tsx`)**:
   - Smooth keyboard avoidance (`KeyboardAvoidingView` + `Keyboard` listener so the composer dock lifts cleanly above the keyboard on Android & iOS).
   - **Mode Switcher Bar**: `Agent` · `Plan` · `Ask` · `Debug` · `Multi` with custom vector icons and distinct accent colors.
   - **Model & Options Sheet**: Shows live models from the user's Mac account + interactive pills for **Effort** (`Low`, `Med`, `High`, `XHigh`, `Max`), **Context** (`256K`, `300K`, `500K`, `1M`), **Fast** (lightning bolt toggle), and **Thinking** (brain toggle).
   - **`@File` & Context Attachment Sheet**: Live search of files inside the Mac project folder + `@Git Diff` toggle + `/Slash` command chips + live Context Ring meter.

### Step 3 — End-to-End Verification
1. Run `vitest` unit tests in `bridge/` covering model parsing, parameterized model formatting, mode flags, and file listing.
2. Run `tsc --noEmit` in both `bridge/` and `mobile/`.
3. Run `expo export --platform android` to verify the complete bundle compiles cleanly for Expo Go.
4. Restart the live bridge on port `4040` and verify `/api/local/models`, `/api/local/projects`, and `/api/local/files` against this Mac.

### Step 4 — v0.4.0 Deep Mac IDE Integration & Quirky Vault UI
1. **Replace Horizontal Project Swipe with the Quirky "Workspace Vault Deck" (`WorkspaceVaultDropdown.tsx`)**:
   - No horizontal swiping and no boring standard dropdown. Tapping the sculpted **Target Mac Workspace** vault plate unfurls an animated multi-mode **Workspace & Filesystem Vault** (`LottieFiles/motion-design-skill` spring + staggered cascade) with:
     - **IDE & Recent Workspaces Stack**: Highlights the workspace **currently open in your Mac's Cursor IDE** (`LIVE IN IDE` neon badge), shows each repo's Git branch and uncommitted file count, and lets you filter/pick with one tap.
     - **Live Mac Folder Explorer (`BROWSE MAC DISK`)**: Step up (`..`) or drill into any directory on your Mac live via `/api/local/browse-dirs`.
     - **Recently Viewed in IDE Chips**: Shows the files from `~/.cursor/ide_state.json` that you were just looking at in Cursor on your Mac so you can attach them in one tap.
2. **Unrestricted Shell/MCP Execution + Disk Transcript Sync + Live Git Diff + Plans**:
   - Bridge passes `--force --sandbox disabled --approve-mcps` (configurable in composer) so `gcloud`, `bq`, shell, and MCP calls never get rejected.
   - Bridge reads `.jsonl` transcripts from `~/.cursor/projects/*/agent-transcripts/` so chat history persists across bridge restarts and IDE-started sessions appear in CUSS.
   - Bridge exposes `/api/local/ide-state` (active IDE window, recent IDE files, MCP servers, saved `~/.cursor/plans/*.plan.md`) and `/api/local/git-diff?cwd=...` (live `git status` + `git diff` viewer inside the chat screen).

