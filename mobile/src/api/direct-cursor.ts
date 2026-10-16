import { File as ExpoFile, Paths } from 'expo-file-system';
import {
  FALLBACK_FAMILIES,
  LocalAgent,
  ModelFamily,
  loadDeviceChatItems,
  saveDeviceChatItems,
  useStore,
} from '../store';
import type { ExecutionMode } from '../theme';
import { emitLocalSyntheticMessage } from './live';

export interface CachedWorkspaceFile {
  path: string;
  relativePath: string;
  content: string;
  size: number;
}

export interface DeviceWorkspaceCache {
  cwd: string;
  files: CachedWorkspaceFile[];
  dirtyEdits: { cwd: string; path: string; content: string; updatedAt: string }[];
  updatedAt: string;
}

function getWorkspaceCacheFile(): ExpoFile {
  return new ExpoFile(Paths.document, 'cuss-workspace-cache-v1.json');
}

export function readDeviceWorkspaceCache(): DeviceWorkspaceCache {
  try {
    const f = getWorkspaceCacheFile();
    if (!f.exists) {
      return { cwd: '/workspace', files: [], dirtyEdits: [], updatedAt: '' };
    }
    const raw = f.textSync();
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      cwd: parsed?.cwd || '/workspace',
      files: Array.isArray(parsed?.files) ? parsed.files : [],
      dirtyEdits: Array.isArray(parsed?.dirtyEdits) ? parsed.dirtyEdits : [],
      updatedAt: parsed?.updatedAt || '',
    };
  } catch {
    return { cwd: '/workspace', files: [], dirtyEdits: [], updatedAt: '' };
  }
}

export function saveDeviceWorkspaceSnapshot(cwd: string, files: CachedWorkspaceFile[]) {
  try {
    const prev = readDeviceWorkspaceCache();
    const next: DeviceWorkspaceCache = {
      cwd: cwd || prev.cwd,
      files: Array.isArray(files) ? files : prev.files,
      dirtyEdits: prev.dirtyEdits,
      updatedAt: new Date().toISOString(),
    };
    getWorkspaceCacheFile().write(JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function recordOfflineFileEdit(cwd: string, filePath: string, content: string) {
  try {
    const prev = readDeviceWorkspaceCache();
    const absPath = filePath.startsWith('/') ? filePath : `${cwd.replace(/\/$/, '')}/${filePath}`;
    const relPath = absPath.startsWith(cwd)
      ? absPath.slice(cwd.length).replace(/^\//, '')
      : filePath;
    const files = [...prev.files];
    const existingIdx = files.findIndex(
      (f) => f.path === absPath || f.relativePath === relPath || f.path.endsWith(`/${relPath}`),
    );
    const entry: CachedWorkspaceFile = {
      path: absPath,
      relativePath: relPath,
      content,
      size: content.length,
    };
    if (existingIdx >= 0) files[existingIdx] = entry;
    else files.unshift(entry);

    const dirtyEdits = [
      { cwd, path: absPath, content, updatedAt: new Date().toISOString() },
      ...prev.dirtyEdits.filter((d) => d.path !== absPath),
    ].slice(0, 50);

    getWorkspaceCacheFile().write(
      JSON.stringify({
        cwd: cwd || prev.cwd,
        files,
        dirtyEdits,
        updatedAt: new Date().toISOString(),
      }),
    );
  } catch {
    /* ignore */
  }
}

export function clearSyncedOfflineFileEdits() {
  try {
    const prev = readDeviceWorkspaceCache();
    if (prev.dirtyEdits.length === 0) return;
    getWorkspaceCacheFile().write(
      JSON.stringify({
        ...prev,
        dirtyEdits: [],
      }),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Pure-JS SHA-256 implementation for deterministic Worldwide Rendezvous Beacon topic derivation.
 */
export function sha256AsciiHex(ascii: string): string {
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const bytes: number[] = [];
  for (let i = 0; i < ascii.length; i++) bytes.push(ascii.charCodeAt(i) & 0xff);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(Math.floor(bitLen / Math.pow(2, i * 8)) & 0xff);
  const W = new Array<number>(64);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      W[t] =
        ((bytes[i + t * 4] << 24) |
          (bytes[i + t * 4 + 1] << 16) |
          (bytes[i + t * 4 + 2] << 8) |
          bytes[i + t * 4 + 3]) >>>
        0;
    }
    for (let t = 16; t < 64; t++) {
      const s0 = (rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3)) >>> 0;
      const s1 = (rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10)) >>> 0;
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = (rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = (rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  let hex = '';
  for (const w of H) {
    hex += ((w >>> 24) & 0xff).toString(16).padStart(2, '0');
    hex += ((w >>> 16) & 0xff).toString(16).padStart(2, '0');
    hex += ((w >>> 8) & 0xff).toString(16).padStart(2, '0');
    hex += (w & 0xff).toString(16).padStart(2, '0');
  }
  return hex;
}

export function deriveBeaconTopic(pairingToken: string): string {
  const hash = sha256AsciiHex(`cuss-worldwide-umbilical-v1:${pairingToken.trim()}`).slice(0, 32);
  return `cuss-umbilical-${hash}`;
}

/**
 * Query the Worldwide Rendezvous Beacon (`https://ntfy.sh/<topic>`) to discover the Mac's
 * current live Worldwide Tunnel URL, Tailscale IP, and LAN IP from any network on Earth.
 */
export async function resolveBeaconEndpoints(pairingToken: string): Promise<{
  tunnelUrl?: string;
  tailscaleUrl?: string;
  lanUrl?: string;
  urls: string[];
}> {
  if (!pairingToken) return { urls: [] };
  const topic = deriveBeaconTopic(pairingToken);
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 3500);
    const res = await fetch(`https://ntfy.sh/${topic}/json?poll=1&since=all`, {
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return { urls: [] };
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    let latest: any = null;
    for (const line of lines) {
      try {
        const outer = JSON.parse(line);
        if (outer?.event === 'message' && typeof outer.message === 'string') {
          const inner = JSON.parse(outer.message);
          if (inner && (!latest || Number(inner.at || 0) >= Number(latest.at || 0))) {
            latest = inner;
          }
        }
      } catch {
        /* ignore malformed line */
      }
    }
    if (!latest) return { urls: [] };
    const urls = [latest.tunnelUrl, latest.tailscaleUrl, latest.lanUrl]
      .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u))
      .map((u) => u.replace(/\/$/, ''));
    return {
      tunnelUrl: latest.tunnelUrl || undefined,
      tailscaleUrl: latest.tailscaleUrl || undefined,
      lanUrl: latest.lanUrl || undefined,
      urls: Array.from(new Set(urls)),
    };
  } catch {
    return { urls: [] };
  }
}

function randomUuid(): string {
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) out += '-';
    else if (i === 14) out += '4';
    else if (i === 19) out += hex[(Math.floor(Math.random() * 16) & 0x3) | 0x8];
    else out += hex[Math.floor(Math.random() * 16)];
  }
  return out;
}

// ============================================================================
// Pure-JS Protobuf Wire Encoder for Cursor's `agent.v1.AgentService/RunSSE`
// ============================================================================

function utf8Bytes(str: string): number[] {
  const encoded = encodeURIComponent(str);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === '%') {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(encoded.charCodeAt(i) & 0xff);
    }
  }
  return bytes;
}

function pbVarint(n: number): number[] {
  const out: number[] = [];
  let v = Math.max(0, Math.floor(n));
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return out;
}

function pbFieldVarint(fieldNo: number, val: number): number[] {
  return [...pbVarint((fieldNo << 3) | 0), ...pbVarint(val)];
}

function pbFieldBytes(fieldNo: number, payload: number[] | string): number[] {
  const b = typeof payload === 'string' ? utf8Bytes(payload) : payload;
  return [...pbVarint((fieldNo << 3) | 2), ...pbVarint(b.length), ...b];
}

function bytesToHex(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] & 0xff).toString(16).padStart(2, '0');
  }
  return out;
}

function resolveDirectModelDetails(
  model?: string,
  effort?: string,
  fast?: boolean,
  thinking?: boolean,
): { modelId: string; displayModelId: string; displayName: string } {
  const fam = String(model || 'auto').toLowerCase();
  if (!fam || fam === 'auto' || fam === 'default') {
    return { modelId: 'default', displayModelId: 'auto', displayName: 'Auto' };
  }
  if (fam === 'composer-2.5' || fam.startsWith('composer-')) {
    const slug = fast ? 'composer-2-fast' : 'composer-2';
    return { modelId: slug, displayModelId: slug, displayName: 'Composer 2.5' };
  }
  if (fam.includes('grok')) {
    return { modelId: 'default', displayModelId: 'auto', displayName: 'Grok (Auto Bucket)' };
  }
  if (fam === 'gpt-5.3-codex') {
    const ef = effort && effort !== 'auto' ? effort : 'high';
    const slug = `gpt-5.3-codex-${ef}${fast ? '-fast' : ''}`;
    return { modelId: slug, displayModelId: slug, displayName: 'Codex 5.3' };
  }
  if (fam.startsWith('claude-opus')) {
    const slug = thinking ? 'claude-4.6-opus-high-thinking' : 'claude-4.6-opus-high';
    return { modelId: slug, displayModelId: slug, displayName: 'Claude Opus' };
  }
  if (fam.startsWith('claude-sonnet')) {
    const slug = thinking ? 'claude-4.6-sonnet-medium-thinking' : 'claude-4.6-sonnet-medium';
    return { modelId: slug, displayModelId: slug, displayName: 'Claude Sonnet' };
  }
  return { modelId: 'default', displayModelId: 'auto', displayName: fam };
}

function buildAgentClientRunMessageHex(params: {
  promptText: string;
  conversationId: string;
  cwd: string;
  mode?: ExecutionMode;
  model?: string;
  effort?: string;
  fast?: boolean;
  thinking?: boolean;
}): string {
  const msgId = randomUuid();
  const modeEnum =
    params.mode === 'ask' ? 2 : params.mode === 'plan' ? 3 : 1;

  // UserMessage: 1=text, 2=message_id, 4=mode
  const userMsg = [
    ...pbFieldBytes(1, params.promptText),
    ...pbFieldBytes(2, msgId),
    ...pbFieldVarint(4, modeEnum),
  ];

  // RequestContextEnv: 1=os_version, 2=workspace_paths, 3=shell
  const reqEnv = [
    ...pbFieldBytes(1, 'darwin 24.6.0 (CUSS Autonomous Direct Cloud)'),
    ...pbFieldBytes(2, params.cwd || '/workspace'),
    ...pbFieldBytes(3, '/bin/zsh'),
  ];
  const reqCtx = pbFieldBytes(4, reqEnv);

  // UserMessageAction: 1=user_message, 2=request_context
  const userMsgAction = [...pbFieldBytes(1, userMsg), ...pbFieldBytes(2, reqCtx)];
  // ConversationAction: 1=user_message_action
  const convAction = pbFieldBytes(1, userMsgAction);

  const md = resolveDirectModelDetails(
    params.model,
    params.effort,
    params.fast,
    params.thinking,
  );
  // ModelDetails: 1=model_id, 3=display_model_id, 4=display_name, 5=display_name_short
  const modelDetails = [
    ...pbFieldBytes(1, md.modelId),
    ...pbFieldBytes(3, md.displayModelId),
    ...pbFieldBytes(4, md.displayName),
    ...pbFieldBytes(5, md.displayName),
  ];

  // AgentRunRequest: 1=conversation_state (empty), 2=action, 3=model_details, 5=conversation_id
  const runReq = [
    ...pbFieldBytes(1, []),
    ...pbFieldBytes(2, convAction),
    ...pbFieldBytes(3, modelDetails),
    ...pbFieldBytes(5, params.conversationId),
  ];

  // AgentClientMessage: 1=run_request
  return bytesToHex(pbFieldBytes(1, runReq));
}

function buildKvAckClientMessageHex(kvId: number): string {
  // KvClientMessage: 1=id (uint32), 3=set_blob_result (empty SetBlobResult)
  const kvClient = [
    ...(kvId > 0 ? pbFieldVarint(1, kvId) : []),
    ...pbFieldBytes(3, []),
  ];
  // AgentClientMessage: 3=kv_client_message
  return bytesToHex(pbFieldBytes(3, kvClient));
}

function buildExecReadClientMessageHex(
  id: number,
  execId: string,
  filePath: string,
  content: string,
): string {
  const lines = content.split('\n').length;
  // ReadSuccess: 1=path, 2=content, 3=total_lines, 4=file_size
  const readSuccess = [
    ...pbFieldBytes(1, filePath),
    ...pbFieldBytes(2, content),
    ...pbFieldVarint(3, lines),
    ...pbFieldVarint(4, content.length),
  ];
  // ReadResult: 1=success
  const readResult = pbFieldBytes(1, readSuccess);
  // ExecClientMessage: 1=id, 15=exec_id, 7=read_result
  const execClient = [
    ...(id > 0 ? pbFieldVarint(1, id) : []),
    ...(execId ? pbFieldBytes(15, execId) : []),
    ...pbFieldBytes(7, readResult),
  ];
  // AgentClientMessage: 2=exec_client_message
  return bytesToHex(pbFieldBytes(2, execClient));
}

function buildExecWriteClientMessageHex(
  id: number,
  execId: string,
  filePath: string,
  content: string,
): string {
  const lines = content.split('\n').length;
  // WriteSuccess: 1=path, 2=lines_created, 3=file_size
  const writeSuccess = [
    ...pbFieldBytes(1, filePath),
    ...pbFieldVarint(2, lines),
    ...pbFieldVarint(3, content.length),
  ];
  // WriteResult: 1=success
  const writeResult = pbFieldBytes(1, writeSuccess);
  // ExecClientMessage: 1=id, 15=exec_id, 3=write_result
  const execClient = [
    ...(id > 0 ? pbFieldVarint(1, id) : []),
    ...(execId ? pbFieldBytes(15, execId) : []),
    ...pbFieldBytes(3, writeResult),
  ];
  // AgentClientMessage: 2=exec_client_message
  return bytesToHex(pbFieldBytes(2, execClient));
}

function buildExecRequestContextClientMessageHex(
  id: number,
  execId: string,
  cwd: string,
): string {
  const reqEnv = [
    ...pbFieldBytes(1, 'darwin 24.6.0 (CUSS Autonomous Direct Cloud)'),
    ...pbFieldBytes(2, cwd || '/workspace'),
    ...pbFieldBytes(3, '/bin/zsh'),
  ];
  const reqCtx = pbFieldBytes(4, reqEnv);
  const reqSuccess = pbFieldBytes(1, reqCtx);
  const reqResult = pbFieldBytes(1, reqSuccess);
  // ExecClientMessage: 1=id, 15=exec_id, 10=request_context_result
  const execClient = [
    ...(id > 0 ? pbFieldVarint(1, id) : []),
    ...(execId ? pbFieldBytes(15, execId) : []),
    ...pbFieldBytes(10, reqResult),
  ];
  return bytesToHex(pbFieldBytes(2, execClient));
}

async function callCursorConnectUnary<T = any>(
  accessToken: string,
  serviceMethod: string,
  body: Record<string, any> = {},
  extraHeaders: Record<string, string> = {},
  timeoutMs = 10_000,
): Promise<T | null> {
  if (!accessToken) return null;
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(`https://api2.cursor.sh/${serviceMethod}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1',
        'x-ghost-mode': 'true',
        'x-cursor-client-version': 'cli-2026.10.14-0f9edde',
        'x-cursor-client-type': 'cli',
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function directNameAgent(
  accessToken: string,
  userMessage: string,
): Promise<string> {
  const fallback = userMessage.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 48) || 'Autonomous Agent';
  const res = await callCursorConnectUnary<{ name?: string }>(
    accessToken,
    'agent.v1.AgentService/NameAgent',
    { userMessage: userMessage.slice(0, 400) },
    {},
    5000,
  );
  return res?.name?.trim() || fallback;
}

export async function directListCloudAgents(accessToken: string): Promise<{ agents: any[] }> {
  const res = await callCursorConnectUnary<{ composers?: any[] }>(
    accessToken,
    'aiserver.v1.BackgroundComposerService/ListBackgroundComposers',
    { n: 40, includeStatus: true, includeArchived: false },
  );
  const composers = Array.isArray(res?.composers) ? res!.composers : [];
  return {
    agents: composers.map((c: any) => {
      const rawStatus = String(c?.status ?? '').toUpperCase();
      let status = 'IDLE';
      if (rawStatus.includes('RUNNING') || rawStatus.includes('CREATING')) status = 'ACTIVE';
      else if (rawStatus.includes('FINISHED')) status = 'done';
      else if (rawStatus.includes('ERROR') || rawStatus.includes('FAILED')) status = 'error';
      else if (c?.isArchived) status = 'ARCHIVED';
      const updatedMs = Number(c?.updatedAtMs || c?.createdAtMs || 0);
      return {
        id: String(c?.bcId ?? ''),
        name: String(c?.name || c?.repoUrl || c?.bcId || 'Cloud Agent'),
        status,
        url: c?.prUrl || (c?.bcId ? `https://cursor.com/agents?id=${c.bcId}` : undefined),
        updatedAt: updatedMs > 0 ? new Date(updatedMs).toISOString() : undefined,
        cwd: c?.repoUrl || c?.workspaceRootPath || undefined,
        model: c?.modelDetails?.modelName || undefined,
      };
    }),
  };
}

export async function directListModels(
  accessToken: string,
  savedEmail?: string | null,
): Promise<{
  account?: { email?: string; displayName?: string };
  families: ModelFamily[];
  rawModels: { slug: string; label: string }[];
}> {
  const [usable, me] = await Promise.all([
    callCursorConnectUnary<{ models?: any[] }>(
      accessToken,
      'agent.v1.AgentService/GetUsableModels',
      {},
    ),
    callCursorConnectUnary<any>(accessToken, 'aiserver.v1.DashboardService/GetMe', {}),
  ]);
  const rawModels = Array.isArray(usable?.models)
    ? usable!.models.map((m: any) => ({
        slug: String(m?.displayModelId || m?.modelId || 'auto'),
        label: String(m?.displayName || m?.displayModelId || 'Auto'),
      }))
    : [];
  const email = me?.email || savedEmail || undefined;
  const displayName =
    [me?.firstName, me?.lastName].filter(Boolean).join(' ') || undefined;
  return {
    account: { email, displayName },
    families: FALLBACK_FAMILIES,
    rawModels,
  };
}

export async function directGetSettingsAndUsage(
  accessToken: string,
  localAgents: LocalAgent[],
  savedEmail?: string | null,
) {
  const [meRes, planInfoRes, usageRes, hardLimitRes] = await Promise.all([
    callCursorConnectUnary<any>(accessToken, 'aiserver.v1.DashboardService/GetMe', {}),
    callCursorConnectUnary<any>(accessToken, 'aiserver.v1.DashboardService/GetPlanInfo', {}),
    callCursorConnectUnary<any>(
      accessToken,
      'aiserver.v1.DashboardService/GetCurrentPeriodUsage',
      {},
    ),
    callCursorConnectUnary<any>(accessToken, 'aiserver.v1.DashboardService/GetHardLimit', {}),
  ]);

  const pu = usageRes?.planUsage ?? {};
  const pi = planInfoRes?.planInfo ?? {};
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  for (const ag of localAgents) {
    inputTokens += Number(ag?.usage?.inputTokens ?? 0);
    outputTokens += Number(ag?.usage?.outputTokens ?? 0);
    cacheReadTokens += Number(ag?.usage?.cacheReadTokens ?? 0);
  }

  const displayName =
    [meRes?.firstName, meRes?.lastName].filter(Boolean).join(' ') || 'Cursor User';

  return {
    account: {
      email: meRes?.email || savedEmail || 'Signed in via Cursor Cloud',
      displayName,
      userId: meRes?.userId,
      authId: meRes?.authId,
      signUpType: 'Auth_0',
      membershipType: String(pi?.planName || 'ULTRA').toUpperCase(),
      subscriptionStatus: 'active',
    },
    planInfo: {
      planName: pi?.planName || 'Ultra',
      price: pi?.price || '$200/mo',
      billingCycleStart: usageRes?.billingCycleStart,
      billingCycleEnd: usageRes?.billingCycleEnd || pi?.billingCycleEnd,
      includedUsagePeriod: pi?.includedUsagePeriod || 'INCLUDED_USAGE_PERIOD_MONTHLY',
    },
    planUsage: {
      totalSpendCents: Number(pu?.totalSpend ?? 0),
      includedSpendCents: Number(pu?.includedSpend ?? 0),
      bonusSpendCents: Number(pu?.bonusSpend ?? 0),
      limitCents: Number(pu?.limit ?? 40000),
      autoPercentUsed: Number(pu?.autoPercentUsed ?? 0),
      apiPercentUsed: Number(pu?.apiPercentUsed ?? 0),
      totalPercentUsed: Number(pu?.totalPercentUsed ?? 0),
      remainingBonus: Boolean(pu?.remainingBonus),
      bonusTooltip:
        pu?.bonusTooltip ||
        "We work with model providers to give you free usage beyond what you've purchased.",
      displayMessage: usageRes?.displayMessage,
      autoModelSelectedDisplayMessage: usageRes?.autoModelSelectedDisplayMessage,
      namedModelSelectedDisplayMessage: usageRes?.namedModelSelectedDisplayMessage,
      autoBucketModels: Array.isArray(usageRes?.autoBucketModels)
        ? usageRes.autoBucketModels
        : ['default', 'composer-2.5', 'grok-4.7', 'grok-4.6', 'grok-4.5'],
      noUsageBasedAllowed: Boolean(hardLimitRes?.noUsageBasedAllowed ?? true),
    },
    privacy: {
      privacyMode: 'PRIVACY_MODE_NO_TRAINING',
      ghostMode: true,
    },
    cliConfig: { maxMode: true, sandbox: { mode: 'disabled' }, notifications: true },
    desktopSettings: {},
    savedPlans: [],
    mcpServers: [],
    localTelemetry: {
      sessionCount: localAgents.length,
      inputTokens,
      outputTokens,
      cacheReadTokens,
    },
  };
}

/**
 * Extract complete top-level Connect-RPC JSON frame payloads (`{"interactionUpdate":...}`, `{"kvServerMessage":...}`)
 * from an incremental UTF-8 response stream.
 */
function extractConnectJsonObjects(
  streamText: string,
  startPos: number,
): { objects: any[]; nextPos: number } {
  const objects: any[] = [];
  const n = streamText.length;
  let i = startPos;
  while (i < n - 1) {
    if (streamText[i] === '{' && streamText[i + 1] === '"') {
      let depth = 0;
      let inStr = false;
      let esc = false;
      let matchedEnd = -1;
      for (let j = i; j < n; j++) {
        const ch = streamText[j];
        if (inStr) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') inStr = false;
        } else {
          if (ch === '"') inStr = true;
          else if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              matchedEnd = j;
              break;
            }
          }
        }
      }
      if (matchedEnd !== -1) {
        const slice = streamText.slice(i, matchedEnd + 1);
        try {
          objects.push(JSON.parse(slice));
        } catch {
          /* ignore malformed frame */
        }
        i = matchedEnd + 1;
      } else {
        // Incomplete JSON object at end of buffer — wait for next chunk
        break;
      }
    } else {
      i++;
    }
  }
  return { objects, nextPos: i };
}

const activeDirectRuns = new Map<string, () => void>();

export function stopDirectAgentRun(agentId: string): boolean {
  const cancel = activeDirectRuns.get(agentId);
  if (cancel) {
    cancel();
    activeDirectRuns.delete(agentId);
    return true;
  }
  return false;
}

/**
 * Execute an AI Agent turn directly from the phone against `https://api2.cursor.sh/agent.v1.AgentService/RunSSE`
 * + `https://api2.cursor.sh/aiserver.v1.BidiService/BidiAppend` when the Mac is shut down or unreachable!
 */
export async function runDirectPhoneCursorTurn(params: {
  accessToken: string;
  agentId: string;
  promptText: string;
  cwd: string;
  mode?: ExecutionMode;
  model?: string;
  effort?: string;
  context?: string;
  fast?: boolean;
  thinking?: boolean;
}): Promise<void> {
  const { accessToken, agentId, promptText, cwd, mode, model, effort, context, fast, thinking } =
    params;

  // Build conversation context from saved device transcript so multi-turn follow-ups retain full context
  const existingEvents = loadDeviceChatItems<any>(agentId);
  const priorTurns: string[] = [];
  for (const ev of existingEvents.slice(-16)) {
    const raw = ev?.raw ?? ev;
    if (raw?.type === 'cuss_user_turn' && raw?.text) {
      priorTurns.push(`User: ${raw.text}`);
    } else if (raw?.type === 'assistant' && Array.isArray(raw?.message?.content)) {
      const txt = raw.message.content
        .filter((c: any) => c?.type === 'text')
        .map((c: any) => String(c?.text ?? ''))
        .join('');
      if (txt) priorTurns.push(`Assistant: ${txt}`);
    }
  }

  const contextualPrompt =
    priorTurns.length > 0
      ? `[Previous conversation context]\n${priorTurns.join('\n\n')}\n\n[Current user instruction]\n${promptText}`
      : promptText;

  const nowIso = new Date().toISOString();
  const userTurnEvent = {
    agentId,
    raw: {
      type: 'cuss_user_turn',
      text: promptText,
      mode: mode ?? 'agent',
      model: model ?? 'auto',
      effort: effort ?? 'auto',
      context: context ?? 'auto',
      fast: Boolean(fast),
      thinking: Boolean(thinking),
    },
    at: nowIso,
  };

  let transcript = [...existingEvents, userTurnEvent];
  saveDeviceChatItems(agentId, transcript);
  emitLocalSyntheticMessage({ type: 'local:event', ...userTurnEvent });

  useStore.getState().markLocalAgentRunning(agentId);

  const requestId = randomUuid();
  let appendSeqno = 0;
  let aborted = false;

  const commonHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'x-ghost-mode': 'true',
    'x-cursor-client-version': 'cli-2026.10.14-0f9edde',
    'x-cursor-client-type': 'cli',
    'x-cursor-streaming': 'true',
    'x-request-id': requestId,
    'Connect-Protocol-Version': '1',
  };

  const sendBidiAppend = async (hexData: string) => {
    if (aborted) return;
    const seq = appendSeqno++;
    try {
      await fetch('https://api2.cursor.sh/aiserver.v1.BidiService/BidiAppend', {
        method: 'POST',
        headers: {
          ...commonHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requestId: { requestId },
          appendSeqno: String(seq),
          data: hexData,
        }),
      });
    } catch {
      /* ignore */
    }
  };

  const firstHex = buildAgentClientRunMessageHex({
    promptText: contextualPrompt,
    conversationId: agentId,
    cwd,
    mode,
    model,
    effort,
    fast,
    thinking,
  });

  // Construct 5-byte Connect-RPC streaming envelope for `{"requestId":"..."}`
  const sseJsonBytes = utf8Bytes(JSON.stringify({ requestId }));
  const sseEnvelope = new Uint8Array(5 + sseJsonBytes.length);
  sseEnvelope[0] = 0;
  const len = sseJsonBytes.length;
  sseEnvelope[1] = (len >>> 24) & 0xff;
  sseEnvelope[2] = (len >>> 16) & 0xff;
  sseEnvelope[3] = (len >>> 8) & 0xff;
  sseEnvelope[4] = len & 0xff;
  for (let i = 0; i < sseJsonBytes.length; i++) {
    sseEnvelope[5 + i] = sseJsonBytes[i];
  }

  let accThinking = '';
  let accAssistant = '';
  let usageStats: { inputTokens: number; outputTokens: number; cacheReadTokens: number } | undefined;
  let finalized = false;

  const finalizeRun = (status: 'done' | 'error', errorMessage?: string) => {
    if (finalized) return;
    finalized = true;
    activeDirectRuns.delete(agentId);

    const endAt = new Date().toISOString();
    if (status === 'error' && errorMessage && !accAssistant) {
      const errEvt = {
        agentId,
        raw: {
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: `Error: ${errorMessage}` }],
          },
        },
        at: endAt,
      };
      transcript = [...transcript, errEvt];
      emitLocalSyntheticMessage({ type: 'local:event', ...errEvt });
    }

    const resEvt = {
      agentId,
      raw: {
        type: 'result',
        text: accAssistant,
        usage: usageStats,
      },
      at: endAt,
    };
    const exitEvt = {
      agentId,
      raw: {
        type: 'exit',
        code: status === 'done' ? 0 : 1,
      },
      at: endAt,
    };
    transcript = [...transcript, resEvt, exitEvt];
    saveDeviceChatItems(agentId, transcript);
    emitLocalSyntheticMessage({ type: 'local:event', ...resEvt });
    emitLocalSyntheticMessage({ type: 'local:event', ...exitEvt });

    const currentList = useStore.getState().localAgents;
    const updatedList = currentList.map((a) =>
      a.id === agentId
        ? {
            ...a,
            lastStatus: status,
            lastActivityAt: endAt,
            usage: usageStats ?? a.usage,
          }
        : a,
    );
    useStore.getState().setLocalAgents(updatedList);
  };

  await new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    let parseOffset = 0;
    const ackedKvIds = new Set<number>();

    const cancelFn = () => {
      aborted = true;
      try {
        xhr.abort();
      } catch {
        /* ignore */
      }
      finalizeRun('done');
      resolve();
    };
    activeDirectRuns.set(agentId, cancelFn);

    const processAvailableText = () => {
      const text = xhr.responseText || '';
      if (text.length <= parseOffset) return;
      const { objects, nextPos } = extractConnectJsonObjects(text, parseOffset);
      parseOffset = nextPos;

      for (const obj of objects) {
        if (obj?.kvServerMessage) {
          const kvId = Number(obj.kvServerMessage.id ?? 0);
          if (!ackedKvIds.has(kvId)) {
            ackedKvIds.add(kvId);
            void sendBidiAppend(buildKvAckClientMessageHex(kvId));
          }
        }
        if (obj?.execServerMessage) {
          const esm = obj.execServerMessage;
          const execMsgId = Number(esm.id ?? 0);
          const execId = String(esm.execId ?? '');
          const evtAt = new Date().toISOString();

          const readArgs = esm.readArgs || esm.redactedReadArgs;
          if (readArgs) {
            const targetPath = String(readArgs.path ?? '');
            const wsCache = readDeviceWorkspaceCache();
            const matched = wsCache.files.find(
              (f) =>
                f.path === targetPath ||
                f.relativePath === targetPath ||
                f.path.endsWith(`/${targetPath}`),
            );
            const content =
              matched?.content ??
              `// File ${targetPath} is not in the offline device cache yet (syncs automatically when Mac is online).`;
            const toolEvt = {
              agentId,
              raw: {
                type: 'tool_call',
                subtype: 'completed',
                tool_call: {
                  readToolCall: {
                    args: { path: targetPath },
                    result: { success: { totalLines: content.split('\n').length } },
                  },
                },
              },
              at: evtAt,
            };
            transcript.push(toolEvt);
            emitLocalSyntheticMessage({ type: 'local:event', ...toolEvt });
            void sendBidiAppend(
              buildExecReadClientMessageHex(execMsgId, execId, targetPath, content),
            );
          } else if (esm.writeArgs) {
            const targetPath = String(esm.writeArgs.path ?? '');
            const fileText = String(esm.writeArgs.fileText ?? '');
            recordOfflineFileEdit(cwd, targetPath, fileText);
            const toolEvt = {
              agentId,
              raw: {
                type: 'tool_call',
                subtype: 'completed',
                tool_call: {
                  writeToolCall: {
                    args: { path: targetPath, fileText },
                    result: { success: { linesCreated: fileText.split('\n').length } },
                  },
                },
              },
              at: evtAt,
            };
            transcript.push(toolEvt);
            emitLocalSyntheticMessage({ type: 'local:event', ...toolEvt });
            void sendBidiAppend(
              buildExecWriteClientMessageHex(execMsgId, execId, targetPath, fileText),
            );
          } else if (esm.requestContextArgs) {
            void sendBidiAppend(
              buildExecRequestContextClientMessageHex(execMsgId, execId, cwd),
            );
          }
        }
        if (obj?.interactionUpdate) {
          const iu = obj.interactionUpdate;
          const evtAt = new Date().toISOString();

          if (iu.thinkingDelta?.text) {
            const delta = String(iu.thinkingDelta.text);
            accThinking += delta;
            const thinkEvt = {
              agentId,
              raw: {
                type: 'thinking',
                subtype: 'delta',
                text: delta,
              },
              at: evtAt,
            };
            emitLocalSyntheticMessage({ type: 'local:event', ...thinkEvt });
          }

          if (iu.textDelta?.text) {
            const delta = String(iu.textDelta.text);
            accAssistant += delta;
            const deltaEvt = {
              agentId,
              raw: {
                type: 'assistant',
                timestamp_ms: Date.now(),
                message: {
                  role: 'assistant',
                  content: [{ type: 'text', text: delta }],
                },
              },
              at: evtAt,
            };
            emitLocalSyntheticMessage({ type: 'local:event', ...deltaEvt });
          }

          if (iu.turnEnded) {
            const te = iu.turnEnded;
            usageStats = {
              inputTokens: Number(te.inputTokens ?? 0),
              outputTokens: Number(te.outputTokens ?? 0),
              cacheReadTokens: Number(te.cacheReadTokens ?? 0),
            };
            if (accThinking) {
              transcript.push({
                agentId,
                raw: { type: 'thinking', subtype: 'delta', text: accThinking },
                at: evtAt,
              });
            }
            if (accAssistant) {
              transcript.push({
                agentId,
                raw: {
                  type: 'assistant',
                  message: {
                    role: 'assistant',
                    content: [{ type: 'text', text: accAssistant }],
                  },
                },
                at: evtAt,
              });
            }
            aborted = true;
            try {
              xhr.abort();
            } catch {
              /* ignore */
            }
            finalizeRun('done');
            resolve();
            return;
          }
        }
      }
    };

    xhr.open('POST', 'https://api2.cursor.sh/agent.v1.AgentService/RunSSE', true);
    for (const [k, v] of Object.entries(commonHeaders)) {
      xhr.setRequestHeader(k, v);
    }
    xhr.setRequestHeader('Content-Type', 'application/connect+json');

    xhr.onprogress = () => {
      processAvailableText();
    };

    xhr.onload = () => {
      processAvailableText();
      if (!finalized) {
        if (accThinking) {
          transcript.push({
            agentId,
            raw: { type: 'thinking', subtype: 'delta', text: accThinking },
            at: new Date().toISOString(),
          });
        }
        if (accAssistant) {
          transcript.push({
            agentId,
            raw: {
              type: 'assistant',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: accAssistant }],
              },
            },
            at: new Date().toISOString(),
          });
        }
        finalizeRun(xhr.status >= 200 && xhr.status < 300 ? 'done' : 'error', `HTTP ${xhr.status}`);
      }
      resolve();
    };

    xhr.onerror = () => {
      processAvailableText();
      if (!finalized) {
        finalizeRun(accAssistant ? 'done' : 'error', 'Direct Cursor Cloud connection interrupted');
      }
      resolve();
    };

    xhr.send(sseEnvelope as any);

    // Send the initial AgentClientMessage (`runRequest`) via BidiAppend 150ms after opening RunSSE
    setTimeout(() => {
      void sendBidiAppend(firstHex);
    }, 150);
  });
}
