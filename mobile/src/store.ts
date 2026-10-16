import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { File as ExpoFile, Paths } from 'expo-file-system';
import type { ExecutionMode } from './theme';

/**
 * Automatically detect the Mac's current Wi-Fi / LAN IP from Expo Go's hostUri
 * (e.g. when switching between home Wi-Fi 192.168.1.10 and office Wi-Fi 10.10.0.160).
 */
export function detectLiveMacBridgeUrl(): string | null {
  try {
    const rawHost =
      Constants.expoConfig?.hostUri ??
      (Constants as any).manifest2?.extra?.expoClient?.hostUri ??
      (Constants as any).manifest?.debuggerHost ??
      Constants.linkingUri ??
      '';
    const cleaned = String(rawHost)
      .replace(/^[a-zA-Z0-9+.-]+:\/\//, '')
      .split('/')[0]
      .split(':')[0]
      .trim();
    if (cleaned && /^\d{1,3}(\.\d{1,3}){3}$/.test(cleaned)) {
      return `http://${cleaned}:4040`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function isPrivateLanUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url.trim());
}

function safeDecodeURIComponent(val: string): string {
  try {
    return decodeURIComponent(val.replace(/\+/g, ' '));
  } catch {
    return val;
  }
}

function normalizeBridgeOrigin(input: string): string | null {
  let clean = String(input ?? '').trim();
  if (!clean) return null;
  if (!/^https?:\/\//i.test(clean)) {
    clean = `http://${clean}`;
  }
  const m = clean.match(/^(https?:\/\/[^/?#]+)/i);
  if (!m) return null;
  let origin = m[1].replace(/\/$/, '');
  // If user scanned an Expo Metro URL on :8081, point bridge origin to :4040
  if (/:8081$/.test(origin)) {
    origin = origin.replace(/:8081$/, ':4040');
  } else if (!/:\d+$/.test(origin) && /^http:\/\//i.test(origin)) {
    origin = `${origin}:4040`;
  }
  return origin;
}

/**
 * Universal QR & Deep-Link parser for CUSS pairing.
 * Accepts:
 *  - `missioncontrol://pair?url=http%3A%2F%2F10.10.0.132%3A4040&token=...`
 *  - `cuss://pair?url=...&token=...`
 *  - `exp://10.10.0.132:8081` or `exp://10.10.0.132:8081/--/pair?url=...&token=...`
 *  - `http://10.10.0.132:4040/api/pair?token=...` or `http://10.10.0.132:4040`
 *  - JSON `{"url":"http://...","token":"..."}`
 *  - Bare IP / host:port `10.10.0.132` or `10.10.0.132:4040`
 */
export function parsePairingInput(
  rawInput: string | null | undefined,
): {
  bridgeUrl: string;
  token?: string;
  tunnelUrl?: string;
  lanUrl?: string;
  cursorAccessToken?: string;
} | null {
  const raw = String(rawInput ?? '').trim();
  if (!raw) return null;

  // 1. JSON object payload
  if (raw.startsWith('{') && raw.endsWith('}')) {
    try {
      const obj = JSON.parse(raw);
      const u = normalizeBridgeOrigin(obj?.url ?? obj?.bridgeUrl ?? obj?.tunnelUrl ?? '');
      const t = typeof obj?.token === 'string' && obj.token.trim() ? obj.token.trim() : undefined;
      const tun = typeof obj?.tunnelUrl === 'string' ? normalizeBridgeOrigin(obj.tunnelUrl) ?? undefined : undefined;
      const lan = typeof obj?.lanUrl === 'string' ? normalizeBridgeOrigin(obj.lanUrl) ?? undefined : undefined;
      const cat = typeof obj?.cursorAccessToken === 'string' ? obj.cursorAccessToken.trim() : undefined;
      if (u) return { bridgeUrl: u, token: t, tunnelUrl: tun, lanUrl: lan, cursorAccessToken: cat };
    } catch {
      /* continue */
    }
  }

  // Extract query parameters manually (safe across custom schemes in React Native / Hermes)
  const params: Record<string, string> = {};
  const qIdx = raw.indexOf('?');
  if (qIdx !== -1) {
    const queryStr = raw.slice(qIdx + 1).split('#')[0];
    for (const part of queryStr.split('&')) {
      if (!part) continue;
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const k = safeDecodeURIComponent(part.slice(0, eqIdx)).trim();
      const v = safeDecodeURIComponent(part.slice(eqIdx + 1)).trim();
      if (k) params[k] = v;
    }
  }

  const tokenFromQuery = params.token || params.pairingToken || undefined;
  const tunnelFromQuery = params.tunnel ? normalizeBridgeOrigin(safeDecodeURIComponent(params.tunnel)) ?? undefined : undefined;
  const lanFromQuery = params.lan ? normalizeBridgeOrigin(safeDecodeURIComponent(params.lan)) ?? undefined : undefined;
  const cursorTokenFromQuery = params.cursorToken || undefined;

  // 2. Explicit ?url= parameter (e.g. missioncontrol://pair?url=...&token=... or exp://.../--/pair?url=...)
  if (params.url) {
    const decodedUrl = safeDecodeURIComponent(params.url);
    const origin = normalizeBridgeOrigin(decodedUrl);
    if (origin) {
      return {
        bridgeUrl: origin,
        token: tokenFromQuery,
        tunnelUrl: tunnelFromQuery || (origin.startsWith('https://') ? origin : undefined),
        lanUrl: lanFromQuery || (origin.startsWith('http://') ? origin : undefined),
        cursorAccessToken: cursorTokenFromQuery,
      };
    }
  }

  // 3. Expo Go URL (`exp://10.10.0.132:8081...` or `exps://...`)
  if (/^exps?:\/\//i.test(raw)) {
    const hostPart = raw
      .replace(/^exps?:\/\//i, '')
      .split('/')[0]
      .split('?')[0]
      .split(':')[0]
      .trim();
    // Only auto-convert to bridge URL if this is an actual pairing link or a plain Expo QR scan
    if (hostPart && (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostPart) || /^[a-zA-Z0-9.-]+$/.test(hostPart))) {
      return {
        bridgeUrl: `http://${hostPart}:4040`,
        token: tokenFromQuery,
        tunnelUrl: tunnelFromQuery,
        lanUrl: `http://${hostPart}:4040`,
        cursorAccessToken: cursorTokenFromQuery,
      };
    }
  }

  // 4. HTTP / HTTPS URL (`http://10.10.0.132:4040/api/pair?token=...` or `https://xyz.lhr.life`)
  if (/^https?:\/\//i.test(raw)) {
    const origin = normalizeBridgeOrigin(raw);
    if (origin) {
      return {
        bridgeUrl: origin,
        token: tokenFromQuery,
        tunnelUrl: tunnelFromQuery || (origin.startsWith('https://') ? origin : undefined),
        lanUrl: lanFromQuery || (origin.startsWith('http://') ? origin : undefined),
        cursorAccessToken: cursorTokenFromQuery,
      };
    }
  }

  // 5. Bare IPv4 address (`10.10.0.132` or `10.10.0.132:4040`)
  if (/^\d{1,3}(\.\d{1,3}){3}(:\d+)?$/.test(raw)) {
    const origin = normalizeBridgeOrigin(raw);
    if (origin) {
      return { bridgeUrl: origin, token: tokenFromQuery };
    }
  }

  return null;
}

/**
 * Probes candidate Mac Bridge URL(s) (LAN, Worldwide HTTPS Tunnel, Tailscale),
 * resolves the pairing token automatically via `/api/auto-pair`, caches the Mac's
 * Worldwide Tunnel URL & Cursor OAuth credentials on the phone, and falls back to
 * Autonomous Direct Cloud mode if the Mac is shut down!
 */
export async function resolveAndVerifyPairing(
  candidateUrl?: string | null,
  candidateToken?: string | null,
  extra?: { tunnelUrl?: string | null; lanUrl?: string | null; cursorAccessToken?: string | null },
): Promise<{
  ok: boolean;
  bridgeUrl?: string;
  token?: string;
  message: string;
}> {
  const state = useStore.getState();
  const candidates: string[] = [];
  const addCandidate = (u?: string | null) => {
    if (!u) return;
    const norm = normalizeBridgeOrigin(u);
    if (norm && !candidates.includes(norm)) candidates.push(norm);
  };

  addCandidate(candidateUrl);
  addCandidate(extra?.tunnelUrl);
  addCandidate(extra?.lanUrl);
  addCandidate(detectLiveMacBridgeUrl());
  addCandidate(state.tunnelUrl);
  addCandidate(state.tailscaleUrl);
  addCandidate(state.lanUrl);
  addCandidate(state.bridgeUrl);

  const cleanInitialToken = (candidateToken ? String(candidateToken).trim() : '') || state.token || '';

  if (extra?.cursorAccessToken) {
    await state.saveCursorTokens(extra.cursorAccessToken);
  }

  for (const base of candidates) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 4500);
      const res = await fetch(`${base}/api/auto-pair`, { signal: ac.signal });
      clearTimeout(timer);
      if (res.ok) {
        const j = await res.json();
        const resolvedToken = cleanInitialToken || (j?.token ? String(j.token).trim() : '');
        if (j?.ok && resolvedToken) {
          const isTunnel = base.startsWith('https://');
          state.setConnectionEndpoints({
            tunnelUrl: j?.tunnelUrl || extra?.tunnelUrl || (isTunnel ? base : state.tunnelUrl),
            tailscaleUrl: j?.tailscaleUrl || state.tailscaleUrl,
            lanUrl: j?.lanUrl || extra?.lanUrl || (!isTunnel ? base : state.lanUrl),
            connectionMode: isTunnel ? 'tunnel' : 'lan',
          });
          if (j?.cursorAuth?.accessToken) {
            await state.saveCursorTokens(
              j.cursorAuth.accessToken,
              j.cursorAuth.refreshToken,
              j.cursorAuth.email,
            );
          }
          return {
            ok: true,
            bridgeUrl: base,
            token: resolvedToken,
            message: `LINK ESTABLISHED // ${isTunnel ? 'WORLDWIDE TUNNEL' : 'MAC BRIDGE'} v${j.version ?? '0.6.0'} (${base.replace(/^https?:\/\//, '')})`,
          };
        }
      }
    } catch {
      /* fallback to /api/health below */
    }

    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 4500);
      const res = await fetch(`${base}/api/health`, { signal: ac.signal });
      clearTimeout(timer);
      if (res.ok) {
        const j = await res.json();
        if (j?.ok && cleanInitialToken) {
          const isTunnel = base.startsWith('https://');
          state.setConnectionEndpoints({
            tunnelUrl: j?.tunnelUrl || extra?.tunnelUrl || (isTunnel ? base : state.tunnelUrl),
            tailscaleUrl: j?.tailscaleUrl || state.tailscaleUrl,
            lanUrl: j?.lanUrl || extra?.lanUrl || (!isTunnel ? base : state.lanUrl),
            connectionMode: isTunnel ? 'tunnel' : 'lan',
          });
          return {
            ok: true,
            bridgeUrl: base,
            token: cleanInitialToken,
            message: `LINK ESTABLISHED // ${isTunnel ? 'WORLDWIDE TUNNEL' : 'MAC BRIDGE'} v${j.version ?? '0.6.0'} (${base.replace(/^https?:\/\//, '')})`,
          };
        }
      }
    } catch {
      /* try next candidate */
    }
  }

  // If the Mac is shut down / offline, but we have a pairing token (or QR credentials),
  // lock the pairing credentials anyway so Autonomous Direct Cloud (`api2.cursor.sh`) works immediately!
  if (cleanInitialToken && candidates.length > 0) {
    state.setConnectionEndpoints({
      tunnelUrl: extra?.tunnelUrl ?? state.tunnelUrl,
      lanUrl: extra?.lanUrl ?? candidates[0],
      connectionMode: 'autonomous-cloud',
    });
    return {
      ok: true,
      bridgeUrl: extra?.tunnelUrl || candidates[0],
      token: cleanInitialToken,
      message: 'PAIRED IN AUTONOMOUS CLOUD MODE (Mac offline — using direct Cursor Cloud engine)',
    };
  }

  return {
    ok: false,
    message: `Cannot reach Mac bridge at ${candidates[0] || 'unknown'} (check Wi-Fi or Worldwide Tunnel QR)`,
  };
}

export interface Agent {
  id: string;
  name: string;
  status: string;
  url?: string;
  latestRunId?: string;
  updatedAt?: string;
  cwd?: string;
  mode?: ExecutionMode;
  model?: string;
  modelSpec?: string;
  effort?: string;
  contextWindow?: string;
  fast?: boolean;
  thinking?: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
}

export interface LocalAgent {
  id: string;
  name: string;
  cwd: string;
  model?: string;
  modelSpec?: string;
  mode?: ExecutionMode;
  effort?: string;
  contextWindow?: string;
  fast?: boolean;
  thinking?: boolean;
  createdAt: string;
  lastStatus: 'idle' | 'running' | 'queued' | 'error' | 'done';
  lastActivityAt: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
}

export interface ModelVariant {
  slug: string;
  label: string;
  effort?: string;
  context?: string;
  fast: boolean;
  thinking: boolean;
}

export interface ModelFamily {
  id: string;
  name: string;
  provider: 'cursor' | 'anthropic' | 'openai' | 'xai' | 'google' | 'moonshot' | 'zhipu' | 'other';
  tagline: string;
  efforts: string[];
  contexts: string[];
  supportsFast: boolean;
  supportsThinking: boolean;
  defaultEffort: string;
  defaultContext: string;
  defaultThinking: boolean;
  variants: ModelVariant[];
}

export interface ProjectEntry {
  path: string;
  name: string;
  branch?: string;
  activeInIde?: boolean;
  source?: 'ide-active' | 'ide-history' | 'session' | 'downloads' | 'worktree';
}

export interface CursorPlanEntry {
  id: string;
  name: string;
  filename: string;
  path: string;
  updatedAt: string;
  preview: string;
  content: string;
}

export interface CursorIdeState {
  activeWorkspace?: { path: string; name: string; branch?: string };
  recentFiles: { relativePath: string; absolutePath: string; workspaceName?: string }[];
  mcpServers: { name: string; transport: string }[];
  plans: CursorPlanEntry[];
}

export interface PromptAttachments {
  files?: string[];
  includeGit?: boolean;
  slashCommand?: string;
  subagents?: string[];
  planContent?: string;
  planName?: string;
  sandbox?: boolean;
  worktree?: boolean;
}

export const FALLBACK_FAMILIES: ModelFamily[] = [
  {
    id: 'auto',
    name: 'Auto',
    provider: 'cursor',
    tagline: 'Cursor Router picks the optimal frontier model per turn (Default)',
    efforts: ['auto'],
    contexts: ['auto'],
    supportsFast: false,
    supportsThinking: true,
    defaultEffort: 'auto',
    defaultContext: 'auto',
    defaultThinking: true,
    variants: [{ slug: 'auto', label: 'Auto', fast: false, thinking: true }],
  },
  {
    id: 'grok-4.7',
    name: 'Grok 4.7',
    provider: 'xai',
    tagline: 'xAI flagship with 256K/500K context and blazing fast mode',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    contexts: ['256k', '500k'],
    supportsFast: true,
    supportsThinking: false,
    defaultEffort: 'high',
    defaultContext: '256k',
    defaultThinking: false,
    variants: [],
  },
  {
    id: 'cursor-grok-4.6',
    name: 'Grok 4.6',
    provider: 'xai',
    tagline: 'Cursor-tuned Grok 4.6 for fast agentic tool loops',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    contexts: ['256k'],
    supportsFast: true,
    supportsThinking: false,
    defaultEffort: 'high',
    defaultContext: '256k',
    defaultThinking: false,
    variants: [],
  },
  {
    id: 'cursor-grok-4.5',
    name: 'Grok 4.5',
    provider: 'xai',
    tagline: 'High-speed Grok 4.5 coding & terminal agent',
    efforts: ['low', 'medium', 'high'],
    contexts: ['256k'],
    supportsFast: true,
    supportsThinking: false,
    defaultEffort: 'high',
    defaultContext: '256k',
    defaultThinking: false,
    variants: [],
  },
  {
    id: 'composer-2.5',
    name: 'Composer 2.5',
    provider: 'cursor',
    tagline: 'Cursor native low-latency multi-file composer model',
    efforts: ['medium'],
    contexts: ['200k'],
    supportsFast: true,
    supportsThinking: false,
    defaultEffort: 'medium',
    defaultContext: '200k',
    defaultThinking: false,
    variants: [],
  },
  {
    id: 'gpt-5.3-codex',
    name: 'Codex 5.3',
    provider: 'openai',
    tagline: 'Surgical repository-scale terminal and code execution specialist',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    contexts: ['272k'],
    supportsFast: true,
    supportsThinking: false,
    defaultEffort: 'high',
    defaultContext: '272k',
    defaultThinking: false,
    variants: [],
  },
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    provider: 'anthropic',
    tagline: 'Flagship Anthropic reasoning & deep architecture synthesis',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    contexts: ['300k', '1m'],
    supportsFast: true,
    supportsThinking: false,
    defaultEffort: 'high',
    defaultContext: '1m',
    defaultThinking: false,
    variants: [],
  },
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    provider: 'anthropic',
    tagline: '1M context workhorse with toggleable extended thinking',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    contexts: ['300k', '1m'],
    supportsFast: true,
    supportsThinking: true,
    defaultEffort: 'high',
    defaultContext: '1m',
    defaultThinking: true,
    variants: [],
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    provider: 'anthropic',
    tagline: 'High-velocity code generation and multi-file refactoring',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    contexts: ['300k', '1m'],
    supportsFast: false,
    supportsThinking: false,
    defaultEffort: 'high',
    defaultContext: '1m',
    defaultThinking: false,
    variants: [],
  },
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    provider: 'openai',
    tagline: 'OpenAI Sol 1M frontier agent with deep reasoning effort control',
    efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    contexts: ['272k', '1m'],
    supportsFast: true,
    supportsThinking: false,
    defaultEffort: 'high',
    defaultContext: '1m',
    defaultThinking: false,
    variants: [],
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    provider: 'google',
    tagline: 'Google frontier multimodal & large-codebase reasoning',
    efforts: ['low', 'medium', 'high'],
    contexts: ['1m'],
    supportsFast: false,
    supportsThinking: false,
    defaultEffort: 'high',
    defaultContext: '1m',
    defaultThinking: false,
    variants: [],
  },
];

interface DeviceStateSnapshot {
  localAgents?: LocalAgent[];
  agents?: Agent[];
  projects?: ProjectEntry[];
  accountEmail?: string | null;
  cursorSignedIn?: boolean;
  deletedChatIds?: string[];
  macSnippets?: string[];
  macEnterPolicies?: Record<string, MacEnterPolicy>;
  selectedCwd?: string | null;
  tunnelUrl?: string | null;
  tailscaleUrl?: string | null;
  lanUrl?: string | null;
  cursorAccessToken?: string | null;
  cursorRefreshToken?: string | null;
}

/** How the phone's Enter key is delivered to a given Mac app in LIVE KEYBOARD mode. */
export type MacEnterPolicy = 'auto' | 'enter' | 'cmd+enter' | 'shift+enter';

function getDeviceStateFile(): ExpoFile {
  return new ExpoFile(Paths.document, 'cuss-device-state-v1.json');
}

function getDeviceChatFile(agentId: string): ExpoFile {
  const safeId = String(agentId || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return new ExpoFile(Paths.document, `cuss-chat-${safeId}.json`);
}

function readDeviceStateSnapshot(): DeviceStateSnapshot {
  try {
    const f = getDeviceStateFile();
    if (!f.exists) return {};
    const raw = f.textSync();
    return raw ? (JSON.parse(raw) as DeviceStateSnapshot) : {};
  } catch {
    return {};
  }
}

function writeDeviceStateSnapshot(patch: Partial<DeviceStateSnapshot>) {
  try {
    const prev = readDeviceStateSnapshot();
    const next: DeviceStateSnapshot = { ...prev, ...patch };
    const f = getDeviceStateFile();
    f.write(JSON.stringify(next));
  } catch {
    /* ignore fs errors */
  }
}

/**
 * Convert raw Bridge `RunEvent[]` (`{ agentId, raw, at }`) OR mixed `StreamItem[]`
 * into a clean multi-turn `StreamItem[]` array ready for `AgentDetailScreen`.
 */
export function normalizeEventsToStreamItems<T = any>(rawList: unknown[]): T[] {
  if (!Array.isArray(rawList) || rawList.length === 0) return [];
  const out: any[] = [];

  const findTurnStart = () => {
    for (let i = out.length - 1; i >= 0; i--) {
      if (out[i]?.kind === 'user') return i;
    }
    return -1;
  };

  for (let idx = 0; idx < rawList.length; idx++) {
    const entry = rawList[idx] as any;
    if (!entry || typeof entry !== 'object') continue;

    // Already a StreamItem (`{ id, kind, ... }`)
    if (typeof entry.kind === 'string' && !entry.raw) {
      out.push(entry);
      continue;
    }

    const r = entry.raw ?? entry;
    if (!r || typeof r !== 'object') continue;

    if (r.type === 'cuss_user_turn' || r.type === 'user') {
      const rawUserText =
        r.type === 'cuss_user_turn'
          ? String(r.text ?? '')
          : (r.message?.content ?? [])
              .filter((c: any) => c?.type === 'text')
              .map((c: any) => String(c.text ?? ''))
              .join('\n');
      const queryMatch = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/i.exec(rawUserText);
      const unwrapped = queryMatch
        ? queryMatch[1]
        : rawUserText
            .replace(/<timestamp>[\s\S]*?<\/timestamp>/gi, '')
            .replace(/<user_info>[\s\S]*?<\/user_info>/gi, '');
      const turnText =
        unwrapped.replace(/^(?:\[[\s\S]*?\]\s*)+/, '').trim() || unwrapped.trim();
      if (!turnText) continue;

      // Only deduplicate if the CURRENT turn's user message has the exact same text and no assistant reply yet
      const ts = findTurnStart();
      const hasReplyAfter = ts >= 0 && out.slice(ts + 1).some((it) => it.kind === 'assistant');
      if (ts >= 0 && !hasReplyAfter && String(out[ts].text ?? '').trim() === turnText) {
        out[ts] = {
          ...out[ts],
          mode: r.mode ?? out[ts].mode,
          model: r.model ?? out[ts].model,
          effort: r.effort ?? out[ts].effort,
          contextWindow: r.context ?? r.contextWindow ?? out[ts].contextWindow,
          fast: r.fast ?? out[ts].fast,
          attachments: r.attachments ?? out[ts].attachments,
        };
        continue;
      }

      out.push({
        id: `usr-${idx}`,
        kind: 'user',
        text: turnText,
        mode: r.mode,
        model: r.model,
        effort: r.effort,
        contextWindow: r.context ?? r.contextWindow,
        fast: r.fast,
        attachments: r.attachments,
      });
      continue;
    }

    if (r.type === 'thinking' && r.text) {
      const chunk = String(r.text);
      const ts = findTurnStart();
      let thkIdx = -1;
      for (let i = out.length - 1; i > ts; i--) {
        if (out[i].kind === 'thinking') {
          thkIdx = i;
          break;
        }
      }
      if (thkIdx >= 0) {
        out[thkIdx] = { ...out[thkIdx], text: out[thkIdx].text + chunk };
      } else {
        const newThk = { id: `thk-${idx}`, kind: 'thinking', text: chunk };
        let astIdx = -1;
        for (let i = out.length - 1; i > ts; i--) {
          if (out[i].kind === 'assistant') {
            astIdx = i;
            break;
          }
        }
        if (astIdx >= 0) out.splice(astIdx, 0, newThk);
        else out.push(newThk);
      }
      continue;
    }

    if (r.type === 'tool_call') {
      const callId = String(r.call_id ?? `tc-${idx}`);
      const inner = r.tool_call ?? {};
      const toolName = Object.keys(inner)[0] ?? 'tool';
      const payload = inner[toolName] ?? {};
      const args = payload.args ?? {};
      const summary = String(
        args.command ??
          args.path ??
          args.file_path ??
          args.filePath ??
          args.pattern ??
          args.glob_pattern ??
          args.url ??
          toolName,
      );
      const outText =
        payload?.result?.success?.interleavedOutput ??
        payload?.result?.success?.stdout ??
        payload?.result?.success?.content;
      const details = outText
        ? `OUTPUT:\n${String(outText).trim()}\n\nARGS:\n${JSON.stringify(args, null, 2)}`
        : JSON.stringify(args, null, 2);
      const status = String(r.subtype ?? 'completed');

      const existingToolIdx = out.findIndex((it) => it.kind === 'tool' && it.callId === callId);
      if (existingToolIdx >= 0) {
        out[existingToolIdx] = {
          ...out[existingToolIdx],
          status,
          summary,
          details,
        };
      } else {
        out.push({
          id: `tool-${idx}`,
          kind: 'tool',
          callId,
          toolName,
          status,
          summary,
          details,
        });
      }
      continue;
    }

    if (r.type === 'assistant') {
      const rawChunk = (r.message?.content ?? [])
        .filter((c: any) => c?.type === 'text')
        .map((c: any) => String(c.text ?? ''))
        .join('');
      if (!rawChunk.trim()) continue;
      const isDelta = typeof r.timestamp_ms === 'number';
      const lastItem = out.length > 0 ? out[out.length - 1] : null;

      // If this is a distinct .jsonl step (`r.step_id`) after a tool call, or if the last item is not an assistant item,
      // push a new chronological assistant item so FlatList virtualizes each step cleanly!
      if (lastItem && lastItem.kind === 'assistant' && (!r.step_id || lastItem.stepId === r.step_id)) {
        const prevText = String(lastItem.text ?? '');
        let mergedText = prevText;
        if (isDelta) {
          mergedText = prevText + rawChunk;
        } else {
          const cleanChunk = rawChunk.trim();
          if (!prevText) mergedText = cleanChunk;
          else if (cleanChunk.includes(prevText)) mergedText = cleanChunk;
          else if (prevText.includes(cleanChunk)) mergedText = prevText;
          else mergedText = `${prevText}\n\n${cleanChunk}`;
        }
        out[out.length - 1] = {
          ...lastItem,
          text: mergedText.slice(0, 16_000),
          isComplete: !isDelta ? true : lastItem.isComplete,
        };
      } else {
        out.push({
          id: r.step_id ? `ast-${r.step_id}` : `ast-${idx}`,
          stepId: r.step_id,
          kind: 'assistant',
          text: (isDelta ? rawChunk : rawChunk.trim()).slice(0, 16_000),
          isComplete: !isDelta,
        });
      }
      continue;
    }

    if (r.type === 'result') {
      const resText = String(r.result ?? r.text ?? '').trim();
      if (r.is_error) {
        out.push({
          id: `res-${idx}`,
          kind: 'result',
          text: resText || 'Turn failed',
          isError: true,
          tokensOut: r.usage?.outputTokens,
          durationMs: r.duration_ms,
        });
      } else {
        const ts = findTurnStart();
        let astIdx = -1;
        for (let i = out.length - 1; i > ts; i--) {
          if (out[i].kind === 'assistant') {
            astIdx = i;
            break;
          }
        }
        if (astIdx >= 0) {
          const prevText = String(out[astIdx].text ?? '');
          const nextText =
            resText && !prevText.includes(resText)
              ? prevText
                ? `${prevText}\n\n${resText}`
                : resText
              : prevText || resText;
          out[astIdx] = {
            ...out[astIdx],
            text: nextText,
            tokensOut: r.usage?.outputTokens ?? out[astIdx].tokensOut,
            durationMs: r.duration_ms ?? out[astIdx].durationMs,
            isComplete: true,
          };
        } else if (resText) {
          out.push({
            id: `ast-${idx}`,
            kind: 'assistant',
            text: resText,
            tokensOut: r.usage?.outputTokens,
            durationMs: r.duration_ms,
            isComplete: true,
          });
        }
      }
    }
  }

  return out as T[];
}

/** Load saved chat conversation items directly from the Android device's local storage. */
export function loadDeviceChatItems<T = any>(agentId: string): T[] {
  if (!agentId) return [];
  try {
    const f = getDeviceChatFile(agentId);
    if (!f.exists) return [];
    const raw = f.textSync();
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? normalizeEventsToStreamItems<T>(parsed) : [];
  } catch {
    return [];
  }
}

/** Save chat conversation items directly onto the Android device's local storage. */
export function saveDeviceChatItems(agentId: string, items: unknown[]) {
  if (!agentId || !Array.isArray(items)) return;
  try {
    const normalized = normalizeEventsToStreamItems(items);
    const f = getDeviceChatFile(agentId);
    f.write(JSON.stringify(normalized.slice(-250)));
  } catch {
    /* ignore fs errors */
  }
}

/** Remove saved chat transcript from the Android device when a chat is deleted. */
export function deleteDeviceChatItems(agentId: string) {
  if (!agentId) return;
  try {
    const f = getDeviceChatFile(agentId);
    if (f.exists) f.delete();
  } catch {
    /* ignore */
  }
}

export interface AgentCompletionNotice {
  agent: LocalAgent;
  status: 'done' | 'error';
  at: string;
}

export type UmbilicalConnectionMode = 'lan' | 'tunnel' | 'autonomous-cloud';

interface State {
  bridgeUrl: string | null;
  token: string | null;
  tunnelUrl: string | null;
  tailscaleUrl: string | null;
  lanUrl: string | null;
  cursorAccessToken: string | null;
  cursorRefreshToken: string | null;
  connectionMode: UmbilicalConnectionMode;
  agents: Agent[];
  localAgents: LocalAgent[];
  deletedChatIds: string[];
  completionNotice: AgentCompletionNotice | null;
  modelFamilies: ModelFamily[];
  projects: ProjectEntry[];
  ideState: CursorIdeState | null;
  accountEmail: string | null;
  cursorSignedIn: boolean;
  selectedMode: ExecutionMode;
  selectedModel: string;
  selectedEffort: string;
  selectedContext: string;
  selectedFast: boolean;
  selectedThinking: boolean;
  hydrated: boolean;
  selectedCwd: string | null;
  setSelectedCwd: (cwd: string | null) => void;
  macSnippets: string[];
  macEnterPolicies: Record<string, MacEnterPolicy>;
  addMacSnippet: (text: string) => void;
  removeMacSnippet: (text: string) => void;
  setMacEnterPolicy: (app: string, policy: MacEnterPolicy) => void;
  setPairing: (url: string, token: string) => Promise<void>;
  setConnectionEndpoints: (patch: {
    tunnelUrl?: string | null;
    tailscaleUrl?: string | null;
    lanUrl?: string | null;
    connectionMode?: UmbilicalConnectionMode;
  }) => void;
  saveCursorTokens: (
    accessToken: string,
    refreshToken?: string | null,
    email?: string | null,
  ) => Promise<void>;
  clearPairing: () => Promise<void>;
  setCursorSignedIn: (signedIn: boolean, email?: string | null) => Promise<void>;
  hydrate: () => Promise<void>;
  setAgents: (agents: Agent[]) => void;
  setLocalAgents: (agents: LocalAgent[]) => void;
  markLocalAgentRunning: (id: string) => void;
  dismissCompletionNotice: () => void;
  renameLocalAgentOnDevice: (id: string, name: string) => void;
  deleteLocalAgentOnDevice: (id: string) => void;
  setModelCatalog: (families: ModelFamily[], email?: string) => void;
  setProjects: (projects: ProjectEntry[]) => void;
  setIdeState: (ideState: CursorIdeState) => void;
  setComposerConfig: (patch: {
    mode?: ExecutionMode;
    model?: string;
    effort?: string;
    context?: string;
    fast?: boolean;
    thinking?: boolean;
  }) => void;
}

export const useStore = create<State>((set, get) => ({
  bridgeUrl: null,
  token: null,
  tunnelUrl: null,
  tailscaleUrl: null,
  lanUrl: null,
  cursorAccessToken: null,
  cursorRefreshToken: null,
  connectionMode: 'lan',
  agents: [],
  localAgents: [],
  deletedChatIds: [],
  completionNotice: null,
  modelFamilies: FALLBACK_FAMILIES,
  projects: [],
  ideState: null,
  accountEmail: null,
  cursorSignedIn: false,
  selectedMode: 'agent',
  selectedModel: 'auto',
  selectedEffort: 'auto',
  selectedContext: 'auto',
  selectedFast: false,
  selectedThinking: true,
  hydrated: false,
  selectedCwd: null,
  setSelectedCwd: (cwd) => {
    const clean = cwd ? String(cwd).trim() : null;
    writeDeviceStateSnapshot({ selectedCwd: clean });
    set({ selectedCwd: clean });
  },
  macSnippets: [],
  macEnterPolicies: {},
  addMacSnippet: (text) => {
    const t = String(text ?? '').trim();
    if (!t) return;
    const next = [t, ...get().macSnippets.filter((x) => x !== t)].slice(0, 24);
    writeDeviceStateSnapshot({ macSnippets: next });
    set({ macSnippets: next });
  },
  removeMacSnippet: (text) => {
    const next = get().macSnippets.filter((x) => x !== text);
    writeDeviceStateSnapshot({ macSnippets: next });
    set({ macSnippets: next });
  },
  setMacEnterPolicy: (app, policy) => {
    const next = { ...get().macEnterPolicies, [app.toLowerCase()]: policy };
    writeDeviceStateSnapshot({ macEnterPolicies: next });
    set({ macEnterPolicies: next });
  },
  async setPairing(bridgeUrl, token) {
    await SecureStore.setItemAsync('bridgeUrl', bridgeUrl);
    await SecureStore.setItemAsync('pairingToken', token);
    const isTunnel = bridgeUrl.startsWith('https://');
    const nextTunnel = isTunnel ? bridgeUrl : get().tunnelUrl;
    const nextLan = !isTunnel ? bridgeUrl : get().lanUrl;
    writeDeviceStateSnapshot({
      tunnelUrl: nextTunnel,
      lanUrl: nextLan,
    });
    set({
      bridgeUrl,
      token,
      tunnelUrl: nextTunnel,
      lanUrl: nextLan,
      connectionMode: isTunnel ? 'tunnel' : get().connectionMode,
    });
  },
  setConnectionEndpoints: (patch) => {
    const nextTunnel = patch.tunnelUrl !== undefined ? patch.tunnelUrl : get().tunnelUrl;
    const nextTailscale = patch.tailscaleUrl !== undefined ? patch.tailscaleUrl : get().tailscaleUrl;
    const nextLan = patch.lanUrl !== undefined ? patch.lanUrl : get().lanUrl;
    const nextMode = patch.connectionMode ?? get().connectionMode;
    writeDeviceStateSnapshot({
      tunnelUrl: nextTunnel,
      tailscaleUrl: nextTailscale,
      lanUrl: nextLan,
    });
    set({
      tunnelUrl: nextTunnel,
      tailscaleUrl: nextTailscale,
      lanUrl: nextLan,
      connectionMode: nextMode,
    });
  },
  async saveCursorTokens(accessToken, refreshToken, email) {
    const cleanAccess = String(accessToken ?? '').trim();
    if (!cleanAccess) return;
    const cleanRefresh = refreshToken ? String(refreshToken).trim() : get().cursorRefreshToken;
    const nextEmail = email ?? get().accountEmail;
    try {
      await SecureStore.setItemAsync('cursorAccessToken', cleanAccess);
      if (cleanRefresh) await SecureStore.setItemAsync('cursorRefreshToken', cleanRefresh);
      await SecureStore.setItemAsync('cursorSignedIn', '1');
    } catch {
      /* ignore securestore limits */
    }
    writeDeviceStateSnapshot({
      cursorAccessToken: cleanAccess,
      cursorRefreshToken: cleanRefresh,
      cursorSignedIn: true,
      accountEmail: nextEmail,
    });
    set({
      cursorAccessToken: cleanAccess,
      cursorRefreshToken: cleanRefresh,
      cursorSignedIn: true,
      accountEmail: nextEmail,
    });
  },
  async clearPairing() {
    await SecureStore.deleteItemAsync('bridgeUrl');
    await SecureStore.deleteItemAsync('pairingToken');
    set({ bridgeUrl: null, token: null });
  },
  async setCursorSignedIn(signedIn, email) {
    const nextEmail = signedIn ? (email ?? get().accountEmail) : null;
    if (signedIn) {
      await SecureStore.setItemAsync('cursorSignedIn', '1');
    } else {
      await SecureStore.deleteItemAsync('cursorSignedIn');
    }
    writeDeviceStateSnapshot({ cursorSignedIn: signedIn, accountEmail: nextEmail });
    set({ cursorSignedIn: signedIn, accountEmail: nextEmail });
  },
  async hydrate() {
    let bridgeUrl = await SecureStore.getItemAsync('bridgeUrl');
    let token = await SecureStore.getItemAsync('pairingToken');
    const savedAccess = await SecureStore.getItemAsync('cursorAccessToken').catch(() => null);
    const savedRefresh = await SecureStore.getItemAsync('cursorRefreshToken').catch(() => null);
    const snap = readDeviceStateSnapshot();
    const detectedUrl = detectLiveMacBridgeUrl();
    let tunnelUrl = snap.tunnelUrl ?? null;
    let tailscaleUrl = snap.tailscaleUrl ?? null;
    let lanUrl = snap.lanUrl ?? null;
    let cursorAccessToken = savedAccess || snap.cursorAccessToken || null;
    let cursorRefreshToken = savedRefresh || snap.cursorRefreshToken || null;

    // If the Mac's Wi-Fi IP changed (e.g. 192.168.1.10 -> 10.10.0.160), auto-switch immediately!
    if (detectedUrl && (!bridgeUrl || (isPrivateLanUrl(bridgeUrl) && bridgeUrl !== detectedUrl))) {
      bridgeUrl = detectedUrl;
      lanUrl = detectedUrl;
      await SecureStore.setItemAsync('bridgeUrl', bridgeUrl);
    }

    // Auto-pair over same Wi-Fi if token is not yet saved (or refresh tunnel & cursorAuth on boot)
    if (bridgeUrl) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 2200);
        const res = await fetch(`${bridgeUrl}/api/auto-pair`, { signal: ac.signal });
        clearTimeout(t);
        if (res.ok) {
          const j = await res.json();
          if (!token && j?.token) {
            token = String(j.token);
            await SecureStore.setItemAsync('pairingToken', token);
          }
          if (j?.tunnelUrl) tunnelUrl = String(j.tunnelUrl);
          if (j?.tailscaleUrl) tailscaleUrl = String(j.tailscaleUrl);
          if (j?.lanUrl) lanUrl = String(j.lanUrl);
          if (j?.cursorAuth?.accessToken) {
            cursorAccessToken = String(j.cursorAuth.accessToken);
            cursorRefreshToken = j.cursorAuth.refreshToken
              ? String(j.cursorAuth.refreshToken)
              : cursorRefreshToken;
            try {
              await SecureStore.setItemAsync('cursorAccessToken', cursorAccessToken);
              await SecureStore.setItemAsync('cursorSignedIn', '1');
            } catch {
              /* ignore */
            }
          }
          writeDeviceStateSnapshot({
            tunnelUrl,
            tailscaleUrl,
            lanUrl,
            cursorAccessToken,
            cursorRefreshToken,
          });
        }
      } catch {
        /* If LAN is unreachable on boot, client.ts will heal via Worldwide Tunnel or Autonomous Cloud */
      }
    }

    const secureSigned = await SecureStore.getItemAsync('cursorSignedIn');
    const cursorSignedIn =
      secureSigned === '1' || Boolean(snap.cursorSignedIn) || Boolean(cursorAccessToken);
    set({
      bridgeUrl,
      token,
      tunnelUrl,
      tailscaleUrl,
      lanUrl,
      cursorAccessToken,
      cursorRefreshToken,
      connectionMode: bridgeUrl?.startsWith('https://') ? 'tunnel' : 'lan',
      localAgents: Array.isArray(snap.localAgents) ? snap.localAgents : [],
      agents: Array.isArray(snap.agents) ? snap.agents : [],
      projects: Array.isArray(snap.projects) ? snap.projects : [],
      accountEmail: snap.accountEmail ?? null,
      cursorSignedIn,
      deletedChatIds: Array.isArray(snap.deletedChatIds) ? snap.deletedChatIds : [],
      selectedCwd: snap.selectedCwd ?? null,
      macSnippets: Array.isArray(snap.macSnippets) ? snap.macSnippets : [],
      macEnterPolicies:
        snap.macEnterPolicies && typeof snap.macEnterPolicies === 'object'
          ? snap.macEnterPolicies
          : {},
      hydrated: true,
    });
  },
  setAgents: (agents) => {
    const next = Array.isArray(agents) ? agents : [];
    writeDeviceStateSnapshot({ agents: next });
    set({ agents: next });
  },
  setLocalAgents: (incoming) => {
    const remote = Array.isArray(incoming) ? incoming : [];
    const deleted = new Set(get().deletedChatIds);
    const mergedMap = new Map<string, LocalAgent>();
    let nextNotice = get().completionNotice;

    // Preserve existing device-saved chats first, then overlay newer remote state
    for (const prev of get().localAgents) {
      if (prev?.id && !deleted.has(prev.id)) {
        mergedMap.set(prev.id, prev);
      }
    }
    for (const rem of remote) {
      if (rem?.id && !deleted.has(rem.id)) {
        const existing = mergedMap.get(rem.id);
        if (
          existing &&
          (existing.lastStatus === 'running' || existing.lastStatus === 'queued') &&
          (rem.lastStatus === 'done' || rem.lastStatus === 'error')
        ) {
          nextNotice = {
            agent: { ...existing, ...rem },
            status: rem.lastStatus,
            at: new Date().toISOString(),
          };
        }
        mergedMap.set(rem.id, existing ? { ...existing, ...rem } : rem);
      }
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) =>
      String(b.lastActivityAt ?? '').localeCompare(String(a.lastActivityAt ?? '')),
    );
    writeDeviceStateSnapshot({ localAgents: merged });
    set({ localAgents: merged, completionNotice: nextNotice });
  },
  markLocalAgentRunning: (id) => {
    const next = get().localAgents.map((a) =>
      a.id === id ? { ...a, lastStatus: 'running' as const, lastActivityAt: new Date().toISOString() } : a,
    );
    writeDeviceStateSnapshot({ localAgents: next });
    set({ localAgents: next });
  },
  dismissCompletionNotice: () => set({ completionNotice: null }),
  renameLocalAgentOnDevice: (id, name) => {
    const next = get().localAgents.map((a) => (a.id === id ? { ...a, name } : a));
    writeDeviceStateSnapshot({ localAgents: next });
    set({ localAgents: next });
  },
  deleteLocalAgentOnDevice: (id) => {
    const nextDeleted = Array.from(new Set([...get().deletedChatIds, id]));
    const nextLocal = get().localAgents.filter((a) => a.id !== id);
    deleteDeviceChatItems(id);
    writeDeviceStateSnapshot({ localAgents: nextLocal, deletedChatIds: nextDeleted });
    set({ localAgents: nextLocal, deletedChatIds: nextDeleted });
  },
  setModelCatalog: (families, email) => {
    const nextEmail = email ?? get().accountEmail;
    if (nextEmail) writeDeviceStateSnapshot({ accountEmail: nextEmail });
    set({
      modelFamilies: Array.isArray(families) && families.length > 0 ? families : get().modelFamilies,
      accountEmail: nextEmail,
    });
  },
  setProjects: (projects) => {
    const next = Array.isArray(projects) ? projects : [];
    writeDeviceStateSnapshot({ projects: next });
    set({ projects: next });
  },
  setIdeState: (ideState) => set({ ideState }),
  setComposerConfig: (patch) =>
    set((s) => {
      let nextModel = patch.model ?? s.selectedModel;
      let nextEffort = patch.effort ?? s.selectedEffort;
      let nextContext = patch.context ?? s.selectedContext;
      let nextFast = patch.fast ?? s.selectedFast;
      let nextThinking = patch.thinking ?? s.selectedThinking;
      if (patch.model && patch.model !== s.selectedModel) {
        const fam = s.modelFamilies.find((f) => f.id === patch.model);
        if (fam) {
          if (!fam.efforts.includes(nextEffort)) nextEffort = fam.defaultEffort;
          if (!fam.contexts.includes(nextContext)) nextContext = fam.defaultContext;
          if (!fam.supportsFast) nextFast = false;
          if (!fam.supportsThinking) nextThinking = false;
        }
      }
      return {
        selectedMode: patch.mode ?? s.selectedMode,
        selectedModel: nextModel,
        selectedEffort: nextEffort,
        selectedContext: nextContext,
        selectedFast: nextFast,
        selectedThinking: nextThinking,
      };
    }),
}));
