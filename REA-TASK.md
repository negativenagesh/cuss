# REA-TASK

## Goal
Reverse engineer how the Cursor mobile/web app controls Cursor agents, then build an
Android app (Expo Go, no Android Studio) that shows what's happening on the user's
Mac/laptop (running agents, codebase activity) and can create + prompt agents.

## STEP 1 answers
1. Target: Cursor web app (cursor.com/agents) — same backend API as the iOS app.
   Route: REA browser workflow (rea.tools/guides/browser).
   (.ipa analysis deferred; may be used later to confirm findings.)
2. Location: https://cursor.com/agents (observed live in Chrome-family browser with
   debugging port + separate profile).
3. ONE feature chain to understand: the agent lifecycle — list agents, create an agent,
   send a prompt/instruction to it, and stream its status/output (network endpoints,
   auth, streaming protocol).
4. Deliverable: (B) SPEC.md first. Build (C: Expo app + Mac bridge) only after SPEC.md
   is reviewed/approved.

## Extra decisions
- Scope: hybrid — reverse the cloud API (what the iOS/web app uses) AND design a local
  Mac bridge (cursor-agent CLI) for local agents.
- Phone ↔ Mac connection: secure tunnel from anywhere (Cloudflare Tunnel or ngrok),
  with token auth + QR pairing.
- UI stack wish: Expo + React Native, stunning motion (Reanimated/Skia, three.js via
  expo-gl/react-three-fiber). Backend bridge: NestJS.

## Progress log
- STEP 2 done (2026-10-14): Node PATH fixed in ~/.zshrc (~/.local/node-v22.23.3-darwin-arm64/bin,
  node v22.23.3). REA registered for client **opencode** (NOT claude_code — user runs OpenCode):
  ~/.config/opencode/opencode.jsonc (backup: opencode.jsonc.rea.backup), REA skill v37 (170 tools)
  installed. Doctor scope status: healthy/aligned. No Ghidra/Hopper/IDA — not needed for browser route.
- REA MCP server launches as: npx -y rea-agents@6.4.0 mcp
- 2026-10-14: REA session verified alive (server rea v6.4.0, client opencode 1.19.0; ghidra/hopper/ida
  unavailable = OK for browser route). Route confirmed: REA browser workflow on cursor.com/agents.
- 2026-10-14: STEP 4/5 done. REA evidence: inspected cursor.com/agents (206 JS chunks, ev_df9bd4a0),
  captured reload network (ev_72cac7c7) -> full private API map (/api/background-composer/*, /api/auth/*,
  Connect-RPC StreamBackgroundComposerUpdates), JS graph ev_dccf2fdf. Found OFFICIAL Cloud Agents API v1
  (api.cursor.com, key auth, SSE run streams) -> chosen as bridge backend; private endpoints reference-only.
  SPEC.md v1 written. User approved build ("go through the plan and build").
- 2026-10-14: BUILD COMPLETE. bridge/ (NestJS): 16/16 vitest pass, boots, /api/health 200,
  no-token 401, valid token 500 no_api_key (expected until CURSOR_API_KEY set). mobile/ (Expo):
  tsc clean, `expo export` Android bundle builds (4.54 MB). SPEC.md v1 = source of truth.

- 2026-10-14: Mobile upgraded SDK 52 -> 57 (user's Expo Go is SDK 57). Changes: expo ~57,
  react 19.2.3 / RN 0.86.3, reanimated 4.5.1 (babel plugin now react-native-worklets/plugin),
  navigation v7, @react-three/fiber v9, skia 2.6.2, moti dropped (FadeIn via reanimated),
  babel-preset-expo added as explicit devDep. tsc clean, expo install --check clean,
  expo export Android bundle OK.

- 2026-10-14: PIVOT to local agents per user. Verified on this Mac: Cursor 3.24.18, `cursor agent`
  CLI (stream-json, resume, create-chat, login/whoami, persist). CLI NOT logged in -> user must run
  `cursor agent login` once. Built LocalAgentService (spawn CLI per prompt, NDJSON stream, per-chat
  queue, registry, NO_OPEN_BROWSER + 25s timeout -> cli_login_required), REST /api/local/*, WS
  local:watch/local:subscribe. Fixed Nest DI under tsx (@Inject). Bridge: 22/22 tests, tsc clean,
  boot-verified. Mobile: This Mac / Cloud toggle, local create (task+folder), local live stream.
  tsc clean, expo export OK. SPEC.md §4b/4c/5 updated.

- 2026-10-14: Crash fix: removed manual react-native-worklets/plugin from babel.config.js
  (babel-preset-expo SDK 57 injects it; double application crashed app natively). Added
  ErrorBoundary (root + around 3D field) so future crashes show on screen. tsc clean, export OK.
  User must restart expo with --clear. CLI login done (subrahmanya.gaonkar@opptra.com).

- 2026-10-14: Root-caused stuck "Starting…": CLI refuses non-interactive runs without --trust
  ("Workspace Trust Required"). Fixed bridge (adds --trust). Confirmed real event shapes with 2
  live runs (system/init, thinking delta, assistant message.content, tool_call started/completed,
  result+usage). CLI sessions land in ~/.cursor/projects/<slug>/agent-transcripts + ~/.cursor/chats
  (IDE bundle parses agent-transcripts -> IDE sidebar visibility INFERRED, user verifies).
  Added POST /api/local/agents/:id/show -> opens Terminal with `cursor agent --resume <id>`
  (verified 201). Mobile: real event rendering, 30s fetch timeout, "Show on Mac" button.
  E2E verified via bridge REST: agent created + ran, /tmp/mc-demo/hello.txt edited (hi -> hi done).
  No API key anywhere in the local flow.

- 2026-10-14: User's "Create Failed / fetch cancelled" root-caused: STALE bridge process from 19:15
  (pre --trust/timeout fixes) still on :4040 — proved via /api/health lacking version. Killed it,
  started new bridge (version marker 0.2.0 in /api/health). App: 60s timeout for create, better
  RN abort error mapping. E2E re-verified: create 4.3s, run done, hello.txt edited (hi done again).

- 2026-10-14: EADDRINUSE cleanup: multiple stray bridges were fighting for :4040. Killed all,
  started ONE background bridge (healthy, v0.2.0). main.ts now prints a friendly
  "already running" message instead of crashing on EADDRINUSE.

- 2026-10-14: "Bridge took too long" root-caused via request logging: app sends ZERO requests
  (not even startup GETs) while phone browser reaches bridge -> app stored bad/stale bridgeUrl.
  Fixes: PairScreen now verifies /api/health before saving (Test & connect, 8s), URL format check,
  Dashboard has "Reset" button (was impossible to unpair on timeout errors). Bridge v0.2.1 logs
  all requests. tsc+export clean.

- 2026-10-14: Two real bugs fixed. (1) WS 404: LiveGateway was factory-provided -> Nest never
  registered it as a gateway (metatype scan). Now a class provider with @Inject; WS verified
  (hello). (2) "cli_login_required" mystery: NOT auth — whoami works even with env -i; user's
  POST raced with their 3 concurrent `cursor agent login` runs (CLI locks during login), so
  create-chat hit the 25s exec timeout. Login settled -> create works (pong agent done).
  Bridge restarted: REST + WS + create all verified live.

- 2026-10-14: CUSS v0.3.0 UI & Cursor Composer Parity Upgrade:
  - Installed `LottieFiles/motion-design-skill` into `~/.agents/skills/motion-design`.
  - Reverse engineered Cursor's composer controls from REA capture `ev_72cac7c7` (`available-models`),
    exported JS chunks (`1wp23zqi6f03_.js`, `23oxtabjy4dot.js`, `24h8se95pqk1s.js`), and local
    `cursor agent --list-models` (259 variants across 20 model families).
  - Wrote `plan.md` covering REA findings, CUSS quirky design system, typography, and motion architecture.
  - Bundled 10 custom TrueType fonts in `mobile/assets/fonts/`: `LCMogi-A/B/C/VF.ttf`,
    `Unbounded-Variable.ttf`, `Syne-Variable.ttf`, `SpaceGrotesk-Medium/Bold.ttf`, `SpaceMono-Regular/Bold.ttf`.
  - Replaced all emojis with interactive Lucide/SVG vector icons (`CussIcons.tsx`) + multi-layer Lottie
    animations & brutalist SVG cyber-art posters (`CussArt.tsx`).
  - Built structured Markdown, numbered code block, collapsible Thinking, and expandable Tool Call
    renderer (`MarkdownRenderer.tsx`).
  - Built full `CursorComposer.tsx` with keyboard avoidance, 5 modes (`Agent`, `Plan`, `Ask`, `Debug`,
    `Multitask`), live account Model + 4D Parameter Matrix (`Effort`, `Context`, `Fast`, `Thinking`),
    `@File` / `@Git` / `/Slash` / `@Subagent` drawer, and circular Context Usage Ring.
  - Verified: 27/27 bridge tests pass, `tsc --noEmit` clean in both `bridge/` and `mobile/`,
    `expo export --platform android` succeeds, and live bridge v0.3.0 running on `:4040`.

- 2026-10-14: CUSS v0.4.0 Deep Mac Cursor System Files & Quirky Workspace Vault Upgrade:
  - Reverse engineered local Cursor system files on this Mac:
    1. `~/Library/Application Support/Cursor/User/globalStorage/storage.json` -> active IDE window
       (`opptra-scrapers`) and historical IDE workspaces (`profileAssociations.workspaces`).
    2. `~/.cursor/ide_state.json` -> `recentlyViewedFiles` in the Mac Cursor IDE.
    3. `~/.cursor/projects/*/agent-transcripts/*/*.jsonl` -> persistent JSONL transcripts for all
       IDE and CLI sessions. Also uncovered in `d4deb3a3.jsonl` line 11 that headless `--print`
       runs blocked `Shell` commands (`gcloud`, `bq`) without `--force --sandbox disabled --approve-mcps`.
    4. `~/.cursor/plans/*.plan.md` & `~/.cursor/mcp.json` -> saved Cursor plans and active MCP
       servers (`21st`, `headroom`, `rea`).
  - Upgraded Bridge (`v0.4.0`, 29/29 vitest pass):
    - Passes `--force --sandbox disabled --approve-mcps` (toggleable in composer) so `gcloud`, `bq`,
      shell, and MCP tools execute without rejection.
    - Hydrates `.jsonl` transcripts from disk when memory buffer is empty (34 events hydrated for
      `d4deb3a3` after restart) and syncs 22 native IDE/CLI sessions across workspaces.
    - Added `/api/local/ide-state`, `/api/local/browse-dirs`, `/api/local/git-diff`, `/api/local/sync-ide`.
  - Upgraded Mobile UI (`WorkspaceVaultDropdown.tsx`, `CursorComposer.tsx`, `DashboardScreen.tsx`,
    `AgentDetailScreen.tsx`):
    - Replaced horizontal workspace chip swipe with the sculptural **Workspace Vault Dropdown**
      (`IDE VAULT` vertical stack highlighting `OPEN IN MAC IDE` + `MAC DISK TREE` live folder
      navigator + `RAW PATH`).
    - Added Live Mac IDE Telemetry strip on Dashboard, Saved Cursor Plans & Recent IDE Files in
      Context Drawer, command `stdout` inside expandable Tool Call cards, and Live Workspace Git
      Diff modal (`GIT DIFF` button in chat HUD).
  - Verified: 29/29 bridge tests pass, `tsc --noEmit` clean in both `bridge/` and `mobile/`,
    `expo export --platform android` succeeds, and live bridge v0.4.0 running on `:4040`.

next step: user reloads Expo Go on phone (shake -> Reload or `npx expo start --clear`)
