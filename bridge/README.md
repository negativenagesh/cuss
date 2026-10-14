# Mission Control — bridge (runs on your Mac)

NestJS server that sits between your phone and Cursor. It uses the **official
Cursor Cloud Agents API v1** (`api.cursor.com`, API-key auth) — see `../SPEC.md`
for evidence and the full endpoint map.

## Setup

```bash
cd bridge
npm install
CURSOR_API_KEY=<key from https://cursor.com/dashboard/api> npm start
```

On first start it creates `~/.config/mission-control/config.json` (mode 600) with a
random pairing token, then prints a QR code per reachable address
(Tailscale `100.x.y.z` first, then LAN). Scan it in the app.

## What it exposes (all require the pairing token except `/api/health`)

- `GET /api/health`
- `GET /api/agents` · `POST /api/agents` · `GET /api/agents/:id`
- `POST /api/agents/:id/prompt` · `POST /api/agents/:id/cancel`
- `POST /api/agents/:id/archive` · `DELETE /api/agents/:id`
- `GET /api/agents/:id/usage`
- `WS /ws?token=…` — `agents:watch` (5 s diff push) and `run:subscribe`
  (forwards the official SSE run stream with Last-Event-ID resume + 410 fallback)

## Tests

```bash
npm test     # 16 tests: auth guard, API shapes, SSE parser/resume
```

## Phone connectivity

1. **Tailscale** (works from anywhere): install on Mac + phone, use the `100.x` QR.
2. **Same Wi-Fi**: use the LAN QR.
3. **Cloudflare Tunnel**: `cloudflared tunnel --url http://localhost:4040`, then
   pair manually with the tunnel URL + token.
