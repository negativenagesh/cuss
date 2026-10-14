# SPEC.md — Cursor Mission Control (Android ↔ Mac bridge ↔ Cursor)

Status: v1, reviewed against live evidence on 2026-10-14.
Scope: mobile app (Expo Go) that shows Cursor agents and codebases, and can create +
prompt agents, talking to a self-hosted bridge on the user's Mac.

---

## 1. What we verified and how

| Claim | Status | Proof |
|---|---|---|
| cursor.com/agents is a Next.js (Turbopack) app; 206 JS chunks | CONFIRMED | REA `inspect_web_page` ev_df9bd4a008e2525517719ec9a9440565d4f581171fdac7afbecf3ae287e3efff |
| Private web API exists under `/api/background-composer/*` and `/api/auth/*`, cookie-auth | CONFIRMED (observed live) | REA `capture_browser_scenario` ev_72cac7c7f79fe4b51f4c2ca8d4a87890ab5520078acb223b416dee928aa77b85 |
| Live updates use Connect-RPC: `POST /api/connect-proxy/aiserver.v1.BackgroundComposerService/StreamBackgroundComposerUpdates` (`application/connect+json`) | CONFIRMED (observed live) | same scenario evidence |
| Follow-up prompt from web = `POST /api/auth/addAsyncFollowupBackgroundComposer` with JSON protobuf body `{bcId, followupId, followupMessage, synchronous, followupSource: WEBSITE, ...}` | CONFIRMED (static, minified chunk `0-ybakp2ze_va.js` + `1qazxoj4om9-y.js`) | REA `analyze_javascript_application` ev_dccf2fdffea3cc09c50112c1874bcdb267b4495856ae6627d15ade9a206700fb + exported-scripts grep |
| Agent IDs are `bc-<uuid>`; list response fields: bcId, name, repoUrl(s), status (`BACKGROUND_COMPOSER_STATUS_*`), workflowStatus, modelDetails, timestamps | CONFIRMED (observed live response body) | scenario evidence ev_72cac7c7… |
| **Official public Cloud Agents API v1 exists** at `https://api.cursor.com`, API-key auth (Basic or Bearer), documented, beta, all plans | CONFIRMED (official docs) | cursor.com/docs/cloud-agent/api/endpoints |
| Official API covers: create agent, list, get, follow-up runs, SSE stream, cancel, archive, delete, usage, artifacts, environments, secrets | CONFIRMED (official docs) | same |
| Official TS/Python SDKs exist with one interface for **local and cloud** runtimes | CONFIRMED (official docs) | cursor.com/docs/api |
| Exact private endpoint the web "new agent" button calls | UNKNOWN (not needed — official API covers create) | next probe only if public API gaps appear |

**Decision:** the bridge uses the **official Cloud Agents API v1** as its primary
backend (stable, key-based, documented). The reversed private endpoints stay in this
spec as reference/fallback only. Cookie endpoints are NOT used by the bridge.

## 2. Official API surface the bridge wraps (api.cursor.com, `Authorization: Bearer|Basic KEY`)

- `POST /v1/agents` — create agent + first run. Body: `{prompt:{text,images?}, model?{id,params?}, name?, env?|repos?[{url,startingRef?,prUrl?}], workOnCurrentBranch?, autoCreatePR?, envVars?, mcpServers?, customSubagents?, mode?: agent|plan, agentId?: bc-<uuid>}`. Returns `{agent, run}`.
- `GET /v1/agents?limit&cursor&prUrl&includeArchived` — list (newest first), `nextCursor` omitted when done.
- `GET /v1/agents/{id}` — durable agent record; status `ACTIVE|IDLE|ARCHIVED`; has `latestRunId`.
- `POST /v1/agents/{id}/runs` — follow-up prompt; 409 `agent_busy` if a run is active.
- `GET /v1/agents/{id}/runs` / `GET /v1/agents/{id}/runs/{runId}` — run state; terminal runs add `durationMs`, `result`, `git.branches[] {repoUrl, branch, prUrl?}`.
- `GET /v1/agents/{id}/runs/{runId}/stream` — **SSE**. Events: `status`, `assistant` {text}, `thinking` {text}, `tool_call` {callId,name,status,args?,result?,truncated?}, `interaction_update`, `heartbeat`, `result` {runId,status,text?,durationMs?,git?}, `error`, `done`. Resume with `Last-Event-ID`; retention header `X-Cursor-Stream-Retention-Seconds`; `410 stream_expired` ⇒ fall back to Get A Run.
- `POST /v1/agents/{id}/runs/{runId}/cancel` — terminal cancel; 409 `run_not_cancellable`.
- `GET /v1/agents/{id}/usage[?runId]` — token usage per run + totals.
- `GET /v1/agents/{id}/artifacts` + `GET .../artifacts/download?path=` — 15-min presigned URLs.
- `POST /v1/agents/{id}/archive` / `POST /v1/agents/{id}/unarchive` / `DELETE /v1/agents/{id}`.
- `GET /v1/environments…` (list/get/create/update/delete/history/builds) — saved envs.
- Errors: JSON `{code,message}`; 400 validation, 401 bad key, 403 plan/scope, 404, 409 conflicts (`agent_busy`, `agent_id_conflict`), 429 rate-limit (back off exponentially), 410 stream expired.
- Key: user creates at cursor.com/dashboard/api. Default rate limit 20 req/min unless documented otherwise.

## 3. Reference only — private web API (REA-observed; do NOT build on)

- `POST /api/background-composer/list` body `{n, include_status, include_archived, should_include_collaborators, owner_filter?, include_pinned_state?}` → `{composers:[{bcId,name,repoUrl,repoUrls,status,workflowStatus,modelDetails{modelName,maxMode},createdAtMs,updatedAtMs,participantUserIds,hasPendingInteraction?}], hasMore?, nextPageOffset?, participants[]}`.
- `POST /api/background-composer/get-detailed-composer` `{bc_ids[], n, include_diff, include_team_wide, status_only}` → per-agent `{composer, startingCommit, baseBranch, status, usedEnvironmentVersion, fullDetailsVersion}`.
- `POST /api/background-composer/stream-conversation` — streaming conversation replay (chunk `3lrdzpdv1173d.js`: `{bcId, purpose: LIVE, shouldSendPrefetchedBlobsFirst, filterHeavyStepData, prefetchOnlyLastStepPerTurn, sendStreamSignalAfterPrefetch}`).
- `POST /api/auth/addAsyncFollowupBackgroundComposer`, `/api/auth/injectBackgroundComposerContext` (steer), `/api/auth/wakeBackgroundComposer`, `/api/auth/archiveBackgroundComposer`, `/api/auth/renameBackgroundComposer`, `/api/auth/startBackgroundComposerFromSnapshot`.
- Connect service `aiserver.v1.BackgroundComposerService` (21 web-loaded methods incl. StreamBackgroundComposerUpdates, StreamConversation, ForkBackgroundComposer, StartSideChatBackgroundComposer, DesktopLease).
- Auth: session cookie (REA redacts values by design).

## 4. Bridge (on the Mac) — `bridge/`

NestJS + TypeScript. Responsibilities:

- **Config**: `CURSOR_API_KEY` (env or prompted once, stored in `~/.config/mission-control/config.json` mode 600), `PORT` (default 4040), pairing token generated on first run (32 random bytes, hex) — printed as QR + URL in terminal.
- **Auth**: every REST route and the WS handshake require `Authorization: Bearer <pairing-token>` or `?token=`. Constant-time compare. Loopback + LAN + Tailscale binding (`0.0.0.0`, documented).
- **REST (phone-facing)** — thin pass-through with normalization:
  - `GET /api/agents` → normalized list `{id,name,status,repos,model,updatedAt,latestRunId}`
  - `POST /api/agents` `{prompt, repoUrl?, model?, mode?, autoCreatePR?}` → create
  - `GET /api/agents/:id` → detail + latest run
  - `POST /api/agents/:id/prompt` `{text}` → create run (handles 409 agent_busy → 409 to phone)
  - `POST /api/agents/:id/cancel` → cancel latest active run
  - `POST /api/agents/:id/archive`, `DELETE /api/agents/:id`
  - `GET /api/agents/:id/usage`
  - `GET /api/health` (no auth) → `{ok:true}`
- **WebSocket `/ws`**:
  - `agents:watch` → bridge polls `GET /v1/agents` every 5 s (respecting 429 backoff) and pushes `agents:update` diffs.
  - `run:subscribe {agentId, runId}` → bridge opens the upstream SSE stream and forwards each event as `run:event`; auto-resume with `Last-Event-ID`; on `410` → fetch run, send `run:final`.
- **Local agents (v2 hook)**: `LocalConnector` interface reserved for Cursor SDK local runtime / `cursor-agent` CLI; ships disabled behind `LOCAL_AGENTS=1`.
- **Tests** (vitest, mocked fetch): auth guard accept/reject, list normalization, prompt 409 mapping, SSE forwarding + resume header, pairing-token flow.

## 5. Phone ↔ Mac connectivity

1. **Tailscale (recommended)**: app on phone + Mac; bridge reachable at `http://100.x.y.z:4040` from anywhere, encrypted by WireGuard. No router changes.
2. **LAN**: same Wi-Fi, `http://192.168.x.x:4040`. Zero setup; dev default.
3. **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:4040` for a public URL; still requires pairing token.
Pairing: bridge prints `missioncontrol://pair?url=…&token=…` as a QR; app scans (expo-camera), stores in expo-secure-store. Token never logged.

## 6. Mobile app (Expo Go) — `mobile/`

Expo SDK (managed, runs in Expo Go — all chosen libs ship in Expo Go):
- Navigation: `@react-navigation/native` (native-stack). State: `zustand`.
- Data: `src/api/client.ts` (REST) + `src/api/live.ts` (WS with reconnect).
- Screens:
  1. **PairScreen** — QR scan or manual URL+token; persists via SecureStore.
  2. **DashboardScreen** — live agent count + list; 3D "agent field": one glowing orb per agent (three.js via `expo-gl` + `@react-three/fiber`), color=status, pulse on update; Skia shader background (`@shopify/react-native-skia`); Reanimated/Moti transitions.
  3. **AgentDetailScreen** — WS stream rendered as chat-like log (assistant/tool_call/result), cancel + archive buttons.
  4. **CreateAgentScreen** — repo picker (from observed agents), prompt input, model + mode select; submits via bridge.
- Edge cases: offline banner, 401 → back to PairScreen, 409 busy → "agent is busy" toast, stream expired → show final result.

## 4b. Local agents on THIS Mac — `cursor agent` CLI (v2, added 2026-10-14)

Goal (user requirement): prompts sent from the phone run on the Mac's own Cursor
install with the user's own Cursor login — NOT cloud agents with an API key.

Verified on this machine (macOS, Cursor 3.24.18):

| Claim | Status | Proof |
|---|---|---|
| Cursor.app 3.24.18 ships `bin/cursor` with an `agent` subcommand (cursor-agent CLI) | CONFIRMED | ran `bin/cursor --version`, `cursor agent --help` |
| CLI supports `--print --output-format stream-json --stream-partial-output`, `--resume <chatId>`, `--model`, `--mode plan\|ask`, `create-chat`, `login`, `whoami`, `persist` | CONFIRMED | `cursor agent --help` output |
| CLI auth is the user's own Cursor login (no API key needed); separate from IDE login | CONFIRMED | `cursor agent whoami` → "Not logged in"; `cursor agent login` exists |
| Non-interactive runs need `--trust` (else "Workspace Trust Required" refusal) | CONFIRMED (live run) | ran CLI in /tmp: refused without flag, ran with `--trust` |
| Confirmed stream-json event shapes: system/init, user, thinking(delta/completed), assistant{message.content[].text}, tool_call{subtype started/completed, tool_call{<toolName>Call:{args}}}, result{result,usage} | CONFIRMED (live runs) | two real runs on this machine, 2026-10-14 |
| CLI edits real files on the Mac with user's login | CONFIRMED | `/tmp/mc-demo/hello.txt` created + modified by CLI runs |
| CLI sessions stored at `~/.cursor/projects/<cwd-slug>/agent-transcripts/<chatId>/` and `~/.cursor/chats/<ws>/<chatId>`; IDE bundle parses `agent-transcripts` paths | CONFIRMED (files + IDE bundle strings) | filesystem + `workbench.desktop.main.js` grep (11 hits) |
| CLI chats appear visually inside the IDE sidebar | INFERRED (shared store + IDE code; user verifies visually) | — |
| Bridge spawns the CLI per prompt, parses NDJSON stream, resumes per chat | CONFIRMED (bridge tests 22/22 + live end-to-end) | POST /api/local/agents → agent ran → hello.txt edited |
| Bridge never opens a browser and never hangs on login prompts | CONFIRMED | NO_OPEN_BROWSER=1 + 25 s exec timeout → `cli_login_required`; verified live |
| `POST /api/local/agents/:id/show` opens a visible Terminal on the Mac attached to the session (`cursor agent --resume <id>`) | CONFIRMED | endpoint returned 201, osascript do-script |

Bridge additions:
- `LocalAgentService` (src/local-agent.ts): registry `~/.config/mission-control/local-agents.json`,
  one CLI process per prompt, per-chat follow-up queue, NDJSON event stream, stop via SIGTERM.
- REST: `GET/POST /api/local/agents`, `POST /api/local/agents/:id/prompt|stop`, `GET /api/local/agents/:id`.
- WS: `local:watch` → `local:update`; `local:subscribe {agentId}` → `local:event {agentId, raw, at}`.
- CLI path override: `CURSOR_CLI` env. Default: `/Applications/Cursor.app/Contents/Resources/app/bin/cursor`.
- One-time prerequisite on the Mac: `cursor agent login` (browser flow, user's own account).

## 4c. Phone ↔ Mac connectivity (final)

- **Tailscale (recommended, "from anywhere")**: install on Mac + phone, pair with the
  bridge's `100.x.y.z` QR. No same-network requirement, no router config, encrypted.
- **LAN**: same Wi-Fi, LAN QR.
- **Cloudflare Tunnel**: public URL + pairing token.
- Phone auth = pairing token (printed once as QR, stored in expo-secure-store).
  Mac auth = user's Cursor login (one-time `cursor agent login`). No API key needed
  for local agents; `CURSOR_API_KEY` only enables the optional Cloud tab.

## 5. Phone app (v2)

- Dashboard toggle: **💻 This Mac** (default) / **☁️ Cloud**.
- Local agent card shows name (from first prompt), status (running/queued/idle/done/error), cwd.
- Detail screen streams CLI events (assistant deltas, tool calls, result) via bridge WS.
- Create screen (This Mac): task + project folder on the Mac → `create-chat` + first prompt.
- 3D agent field maps local statuses: running=green, queued=amber, idle=blue, done=gray, error=red.

## 7. Out of scope (v1)

iOS `.ipa` analysis, private cookie endpoints in the bridge, webhooks (official API
says "coming soon"), team admin APIs.
