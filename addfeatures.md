# ⚡ CUSS — Product & Engineering Feature Roadmap (`addfeatures.md`)

> **Product Vision**: Make **CUSS (Cybernetic Umbilical Studio & Synth)** a 100% self-sufficient mobile engineering workstation that lets a developer build, review, test, debug, and ship production software on their Mac from an Android phone—with zero API keys, zero terminal setup, and full Cursor IDE/CLI parity.

---

## 🚀 Priority Tier P0 — High-Impact Daily Developer Loop

### 01 // Live Port Forwarder & Localhost Web Preview (`localhost` on Phone)
- **Developer Pain**: You ask Cursor Agent to build or fix a web app, dashboard, or API running on `localhost:3000`, `:5173`, `:8080`, or `:4000` on your Mac, and want to interact with it immediately on your phone without reconfiguring dev servers to bind `0.0.0.0` or opening firewall ports.
- **How It Works**:
  - **Bridge (`GET /api/local/ports` & `/api/local/proxy/:port/*`)**:
    - Scans active listening TCP ports on the Mac (`lsof -nP -iTCP -sTCP:LISTEN`) and identifies process names (`next-server`, `vite`, `node`, `python`, `go`, `docker-proxy`).
    - Exposes a zero-config reverse proxy on the Mac Bridge (`http://<MAC_LAN_IP>:4040/api/local/proxy/:port/`) or rewrites `localhost:<port>` -> `<MAC_LAN_IP>:<port>`.
  - **Mobile UI (`PORTS` badge in `AgentDetailScreen` & `DashboardScreen`)**:
    - Shows live running dev servers (`:3000 Next.js`, `:5173 Vite`, `:8080 API`) as 1-tap pills.
    - Tapping a port opens it either in an in-app preview sheet or Android Chrome/Brave, with a 1-tap **`SEND CONSOLE/PAGE ERROR TO AGENT`** button.

---

### 02 // 1-Tap PR Review, CI Status & Auto-Fixer Deck (`gh pr` + GitHub Actions)
- **Developer Pain**: You push a branch or open a PR and walk away from your desk. When a GitHub Action fails or a teammate leaves review comments, you want to see the failure and tell Cursor Agent to fix it in 1 tap.
- **How It Works**:
  - **Bridge (`GET /api/local/pr-status?cwd=...` & `POST /api/local/pr-action`)**:
    - Runs `gh pr view --json number,title,url,state,statusCheckRollup,reviewDecision,comments,reviews` and `gh run view --log-failed` in the active `selectedCwd`.
  - **Mobile UI (New `PR & CI` tab inside `GIT` Studio Modal)**:
    - Displays current PR title, number, review status (`APPROVED` / `CHANGES_REQUESTED`), and live check runs (`PASS` / `FAIL` / `PENDING`).
    - **1-Tap `FIX FAILING CI WITH AGENT`**: Extracts the failing test/build log and dispatches a structured prompt to the active Cursor Agent to fix, verify, commit, and push.
    - **1-Tap `ADDRESS PR COMMENTS`**: Pipes unresolved review threads into the active Cursor Agent.

---

### 03 // Smart Usage Guard & Auto-Bucket Model Router
- **Developer Pain**: When a user's Named Frontier API quota reaches `100%` (`apiPercentUsed >= 100` in `GetCurrentPeriodUsage`), prompts sent to named API models fail with quota errors even though the **Auto / Composer 2.5 / Grok 4.7 Bucket** (`autoBucketModels`) still has available quota or provider bonus credit.
- **How It Works**:
  - **Bridge (`LocalAgentService`)**:
    - Caches `GetCurrentPeriodUsage` for 2 minutes.
    - When `apiPercentUsed >= 100` and the user selects a model outside `autoBucketModels`, automatically warns or falls back to `auto` / `composer-2.5` / `grok-4.7` (when `Auto-Fallback on Quota Limit` is enabled in Settings).
  - **Mobile UI (`CursorComposer` & `CursorSettingsModal`)**:
    - Displays a live `INCLUDED BUCKET` vs `API QUOTA 100%` badge next to each model in the model picker so you never hit an unexpected quota wall.

---

## 🛠️ Priority Tier P1 — Code Control, Skills & Multi-Agent Workflows

### 04 // Per-File & Per-Hunk Stage / Revert in Git Studio (`git checkout` / `git add`)
- **Developer Pain**: Cursor Agent modifies 6 files during a turn; 5 look great, but 1 file has an unwanted change. Running `git restore <file>` manually in a tiny phone terminal is tedious.
- **How It Works**:
  - **Bridge (`POST /api/local/git-action` extended)**:
    - Adds `stage-file`, `unstage-file`, `revert-file` (`git checkout -- <path>` or `rm` for untracked), and `stash` / `stash-pop`.
  - **Mobile UI (`GIT` Studio Modal)**:
    - Every changed file row gets quick **`VIEW DIFF`**, **`STAGE`**, and **`REVERT`** buttons with confirmation alerts.

---

### 05 // Slash-Command & Agent Skill Launcher (`/review`, `/bugbot`, `/autopilot`, `/test`)
- **Developer Pain**: Typing long, structured engineering prompts on a phone keyboard is slow when you already have battle-tested skills in `~/.agents/skills/*` and `~/.cursor/commands/*`.
- **How It Works**:
  - **Bridge (`GET /api/local/skills`)**:
    - Inventories all `SKILL.md` files in `~/.agents/skills/`, `~/.claude/skills/`, and `.cursor/rules/*.mdc` / `AGENTS.md` in the active workspace.
  - **Mobile UI (`/` Button in `CursorComposer`)**:
    - Tapping **`/`** (or typing `/` at the start of the composer) pops up a searchable **Skills & Commands Palette** (`/review`, `/review-bugbot`, `/review-security`, `/autopilot`, `/split-to-prs`, `/humanizer`, etc.) similar to `@file` autocomplete.

---

### 06 // Multi-Agent Parallel Arena (Worktree Split-Run & Compare)
- **Developer Pain**: For hard architectural or debugging tasks, you want to run the exact same prompt against two different models (e.g., `Grok 4.7 (High)` vs `Composer 2.5`) in isolated Git worktrees (`git worktree add`) without them overwriting each other's files, then compare their diffs and merge the winner.
- **How It Works**:
  - **Bridge (`POST /api/local/arena`)**:
    - Creates two temporary Git worktrees (`/tmp/cuss-wt-a`, `/tmp/cuss-wt-b`), spawns two `cursor-agent` runs in parallel with the chosen models, and streams both transcripts + diffs.
  - **Mobile UI (`ARENA` Mode in `CreateAgentScreen`)**:
    - Side-by-side or toggleable `RUN A` vs `RUN B` view with **`APPLY WINNER TO MAIN WORKTREE`**.

---

### 07 // Persistent Dev Server & Background Process Manager
- **Developer Pain**: Current `SHELL / GCP` executes one-shot commands (25s timeout). Developers also need to start long-lived processes (`npm run dev`, `docker compose up`, `pytest --watch`, `ngrok`) and tail their live stdout/stderr.
- **How It Works**:
  - **Bridge (`BackgroundProcessManager`)**:
    - Spawns named background PTY/child processes per workspace, buffers the last 500 lines of output, and emits live `proc:output` events over WebSocket.
  - **Mobile UI (`DAEMONS` Tab inside `SHELL` Modal)**:
    - 1-tap `START / RESTART / STOP` for `package.json` scripts (`dev`, `start`, `test`, `build`, `lint`) automatically parsed from the active `selectedCwd/package.json`.
    - **`ASK AGENT TO FIX CRASH`** button whenever a background process exits non-zero or logs a stack trace.

---

## 🧠 Priority Tier P2 — Deep Context, Audio & Security

### 08 // `@symbol`, `@diff`, `@branch`, and `@terminal` Context Chips in Mobile Composer
- **Developer Pain**: Currently `CursorComposer` supports `@file` attachments. In Cursor Desktop, developers also attach `@git` (current uncommitted diff), `@branch` (diff vs `main`), and `@terminal` (last terminal output).
- **How It Works**:
  - Extend the `@` picker in `CursorComposer.tsx` with 3 instant context pills at the top of the list:
    - **`@git-diff`** (attaches `git diff HEAD` from `selectedCwd`)
    - **`@branch-diff`** (attaches `git diff main...HEAD`)
    - **`@last-shell`** (attaches the last `SHELL` command output)

---

### 09 // Spoken Audio Summary / Read-Aloud for Agent Completions (Eyes-Free Mode)
- **Developer Pain**: When walking or commuting, reading a 600-word markdown response on a phone screen is inconvenient.
- **How It Works**:
  - Uses `expo-speech` (already installed in `mobile/package.json`!) to add a **`LISTEN`** speaker toggle on every assistant turn and an optional **`Auto-Speak Summary When Turn Completes`** setting.

---

### 10 // Tailscale / Zero-Trust Remote Access Wizard (Anywhere Outside Home Wi-Fi)
- **Developer Pain**: On the same Wi-Fi LAN (`10.10.0.160`), auto-pairing is instant. When away from home/office on 5G cellular, the phone needs the Mac's Tailscale IP (`100.x.y.z`) or MagicDNS hostname.
- **How It Works**:
  - **Bridge (`GET /api/local/network-info`)**:
    - Detects both LAN IP (`10.x` / `192.168.x`) and Tailscale IP (`tailscale ip -4` / `utun` interface `100.64.0.0/10`).
  - **Mobile UI & Menu Bar HUD**:
    - Automatically saves both the LAN URL and Tailscale URL in `useStore`, seamlessly failing over to Tailscale when you leave Wi-Fi and switch to mobile data.

---

### 11 // Checkpoint Timeline & 1-Tap Turn Rewind (`git stash` / Snapshot Per Turn)
- **Developer Pain**: In Cursor Desktop, every user prompt creates a **Checkpoint** so you can rewind the workspace state to before Turn #3 if an agent goes down the wrong path.
- **How It Works**:
  - **Bridge**: Before each `prompt()` turn on a local agent, records `git stash create` (a dangling commit SHA capturing the exact working tree state without touching the index).
  - **Mobile UI**: Every user message bubble in `AgentDetailScreen` gets a **`REWIND TO HERE`** badge that restores the working tree to that exact pre-turn snapshot.

---

## 📋 Recommended Implementation Order
1. **Sprint 1 (Immediate)**: **#04 Per-File Stage/Revert in Git Studio** + **#08 `@git-diff` / `@branch-diff` / `@last-shell` Context Chips** + **#03 Smart Usage Guard**.
2. **Sprint 2**: **#05 `/` Slash-Command & Skill Launcher** + **#11 Turn Checkpoints & 1-Tap Rewind**.
3. **Sprint 3**: **#01 Live Port Forwarder & Localhost Preview** + **#07 `package.json` Script Runner & Dev Server Manager**.
4. **Sprint 4**: **#02 1-Tap PR Review & CI Auto-Fixer** + **#10 Tailscale Auto-Failover** + **#09 Eyes-Free Audio Readout**.
