import {
  useStore,
  detectLiveMacBridgeUrl,
  CursorIdeState,
  ModelFamily,
  ProjectEntry,
  PromptAttachments,
} from '../store';
import type { ExecutionMode } from '../theme';

async function tryAutoHealBridge(): Promise<{ bridgeUrl: string; token: string } | null> {
  const state = useStore.getState();
  const candidates = Array.from(
    new Set(
      [
        detectLiveMacBridgeUrl(),
        state.bridgeUrl,
        'http://10.10.0.160:4040',
        'http://192.168.1.10:4040',
      ].filter((x): x is string => Boolean(x)),
    ),
  );

  for (const candidateUrl of candidates) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 1800);
      const res = await fetch(`${candidateUrl}/api/auto-pair`, { signal: ac.signal });
      clearTimeout(t);
      if (res.ok) {
        const j = await res.json();
        const nextToken = j?.token ? String(j.token) : state.token;
        if (nextToken) {
          await state.setPairing(candidateUrl, nextToken);
          return { bridgeUrl: candidateUrl, token: nextToken };
        }
      }
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

/** REST client for the bridge (SPEC.md §4) with automatic Wi-Fi IP healing. */
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  let { bridgeUrl, token, setPairing } = useStore.getState();
  const liveDetectedUrl = detectLiveMacBridgeUrl();

  // If Expo Go knows our Mac's current Wi-Fi IP and it differs from a stale LAN IP, switch before fetching!
  if (
    liveDetectedUrl &&
    bridgeUrl &&
    liveDetectedUrl !== bridgeUrl &&
    /^https?:\/\/(192\.168\.|10\.|172\.)/i.test(bridgeUrl)
  ) {
    bridgeUrl = liveDetectedUrl;
    if (token) void setPairing(bridgeUrl, token);
  }

  if (!bridgeUrl || !token) {
    const healed = await tryAutoHealBridge();
    if (!healed) {
      throw Object.assign(new Error('not paired'), { status: 0, code: 'not_paired' });
    }
    bridgeUrl = healed.bridgeUrl;
    token = healed.token;
  }

  const doFetch = async (targetUrl: string, targetToken: string, timeout: number) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeout);
    try {
      return await fetch(`${targetUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${targetToken}`,
          'Content-Type': 'application/json',
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: ac.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let res: Response;
  try {
    // Use a fast 4.5s initial probe on GET/auth calls so a changed Wi-Fi IP heals in <5s instead of hanging 30s
    const initialTimeout = options.timeoutMs ?? 8_000;
    res = await doFetch(bridgeUrl, token, initialTimeout);
  } catch (e: any) {
    // Network unreachable or timed out (e.g. Wi-Fi IP changed from 192.168.1.10 -> 10.10.0.160) -> auto-heal & retry once!
    const healed = await tryAutoHealBridge();
    if (healed) {
      res = await doFetch(healed.bridgeUrl, healed.token, options.timeoutMs ?? 12_000);
    } else {
      const msg = String(e?.message ?? e);
      if (e?.name === 'AbortError' || /cancelled|canceled|aborted/i.test(msg)) {
        throw Object.assign(
          new Error(
            `Cannot reach Mac at ${bridgeUrl}. Ensure your phone and Mac are on the same Wi-Fi (or Tailscale).`,
          ),
          { status: 0, code: 'timeout' },
        );
      }
      throw e;
    }
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    throw Object.assign(new Error(json?.message ?? res.statusText), {
      status: res.status,
      code: json?.code ?? `http_${res.status}`,
    });
  }
  return json as T;
}

export const listAgents = () => api<{ agents: any[] }>('/api/agents');
export const createAgent = (input: {
  prompt: string;
  repoUrl?: string;
  model?: string;
  mode?: string;
  autoCreatePR?: boolean;
}) => api('/api/agents', { method: 'POST', body: input });
export const sendPrompt = (agentId: string, text: string) =>
  api(`/api/agents/${agentId}/prompt`, { method: 'POST', body: { text } });
export const cancelRun = (agentId: string) => api(`/api/agents/${agentId}/cancel`, { method: 'POST' });
export const archiveAgent = (agentId: string) => api(`/api/agents/${agentId}/archive`, { method: 'POST' });
export const agentDetail = (agentId: string) => api(`/api/agents/${agentId}`);

// --- Local agents: run on the Mac itself via the Cursor Agent CLI (SPEC.md §4 v2) ---
export const localList = (syncIde = false) =>
  api<{ agents: any[]; account?: { email?: string; displayName?: string } }>(
    `/api/local/agents${syncIde ? '?sync=1' : ''}`,
  );

export interface CursorAuthStatus {
  loggedIn: boolean;
  email?: string;
  displayName?: string;
  loginInProgress: boolean;
  loginUrl?: string;
}

export const localAuthStatus = () => api<CursorAuthStatus>('/api/local/auth/status');

export const localAuthLogin = (forceBrowser = false) =>
  api<CursorAuthStatus>('/api/local/auth/login', {
    method: 'POST',
    body: { forceBrowser },
    timeoutMs: 15_000,
  });

export const localAuthComplete = (body: {
  accessToken: string;
  refreshToken?: string;
  email?: string;
}) =>
  api<{ loggedIn: boolean; email?: string }>('/api/local/auth/complete', {
    method: 'POST',
    body,
    timeoutMs: 10_000,
  });

export const localAuthLogout = () =>
  api<{ loggedOut: boolean }>('/api/local/auth/logout', { method: 'POST' });

export const localSyncIde = () =>
  api<{ agents: any[] }>('/api/local/sync-ide', { method: 'POST' });

export const localIdeState = () => api<CursorIdeState>('/api/local/ide-state');

export const localBrowseDirs = (dirPath?: string) =>
  api<{
    currentPath: string;
    parentPath: string;
    directories: { name: string; path: string; branch?: string; isGitRepo: boolean }[];
  }>(`/api/local/browse-dirs${dirPath ? `?path=${encodeURIComponent(dirPath)}` : ''}`);

export const localGitDiff = (cwd: string) =>
  api<{
    branch?: string;
    branches?: string[];
    changedFiles: { status: string; path: string }[];
    statSummary: string;
    diff: string;
  }>(`/api/local/git-diff?cwd=${encodeURIComponent(cwd)}`);

export const localGitAction = (body: {
  cwd: string;
  type: 'checkout' | 'create-branch' | 'commit' | 'push' | 'pull';
  branch?: string;
  message?: string;
}) => api<{ ok: boolean; output: string }>('/api/local/git-action', { method: 'POST', body });

export const localRename = (agentId: string, name: string) =>
  api<{ agent: any }>(`/api/local/agents/${agentId}`, { method: 'PATCH', body: { name } });

export const localDelete = (agentId: string) =>
  api<{ deleted: boolean; id: string }>(`/api/local/agents/${agentId}`, { method: 'DELETE' });

export const localExecShell = (cwd: string, command: string) =>
  api<{ exitCode: number; output: string; urls: string[] }>('/api/local/exec-shell', {
    method: 'POST',
    body: { cwd, command },
    timeoutMs: 25_000,
  });

export const localOpenUrlOnMac = (url: string) =>
  api<{ opened: boolean }>('/api/local/open-url', { method: 'POST', body: { url } });

export interface MacMirrorFrame {
  ok: boolean;
  seq?: number;
  frontApp: string;
  windowTitle?: string;
  browserUrl?: string;
  browserTitle?: string;
  runningApps?: string[];
  installedApps?: string[];
  screenWidth?: number;
  screenHeight?: number;
  activeProcesses?: string[];
  terminalLines?: string[];
  imageBase64?: string;
  capturedAt: string;
  hint?: string;
}

export const localMacScreen = (agentId?: string) =>
  api<MacMirrorFrame>(
    `/api/local/mac-screen${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ''}`,
    { timeoutMs: 10_000 },
  );

export const localMacAction = (body: {
  type:
    | 'focus-app'
    | 'send-key'
    | 'click'
    | 'doubleclick'
    | 'rightclick'
    | 'move'
    | 'scroll'
    | 'type-text'
    | 'backspace';
  target?: string;
  x?: number;
  y?: number;
  deltaY?: number;
  text?: string;
  count?: number;
}) =>
  api<{ ok: boolean; detail?: string }>('/api/local/mac-action', {
    method: 'POST',
    body,
    timeoutMs: 6_000,
  });

export const localTranscribe = (audioBase64: string, ext = 'm4a') =>
  api<{ text: string }>('/api/local/transcribe', {
    method: 'POST',
    body: { audioBase64, ext },
    timeoutMs: 25_000,
  });

export const localModels = (refresh = false) =>
  api<{
    account?: { email?: string; displayName?: string };
    families: ModelFamily[];
    rawModels: { slug: string; label: string }[];
  }>(`/api/local/models${refresh ? '?refresh=1' : ''}`, { timeoutMs: 35_000 });

export const localProjects = () => api<{ projects: ProjectEntry[] }>('/api/local/projects');

export const localFiles = (cwd: string, q = '') =>
  api<{ files: { path: string; relativePath: string; size: number }[] }>(
    `/api/local/files?cwd=${encodeURIComponent(cwd)}&q=${encodeURIComponent(q)}`,
  );

export interface WorkspaceFileContent {
  ok: boolean;
  kind: 'code' | 'markdown' | 'json' | 'csv' | 'image' | 'binary';
  name: string;
  relativePath: string;
  absolutePath: string;
  size: number;
  language: string;
  content: string;
  lineCount: number;
  truncated?: boolean;
  highlightLine?: number;
  mimeType?: string;
  imageBase64?: string;
  updatedAt?: string;
  error?: string;
}

export const localFileContent = (cwd: string | undefined, filePath: string) =>
  api<WorkspaceFileContent>(
    `/api/local/file-content?cwd=${encodeURIComponent(cwd ?? '')}&path=${encodeURIComponent(filePath)}`,
  );

export interface LocalTurnPayload {
  mode?: ExecutionMode;
  model?: string;
  effort?: string;
  context?: string;
  fast?: boolean;
  thinking?: boolean;
  attachments?: PromptAttachments;
}

export const localCreate = (
  input: { prompt: string; cwd: string } & LocalTurnPayload,
) => api<{ agent: any }>('/api/local/agents', { method: 'POST', body: input, timeoutMs: 60_000 });

export const localPrompt = (agentId: string, text: string, options: LocalTurnPayload = {}) =>
  api(`/api/local/agents/${agentId}/prompt`, {
    method: 'POST',
    body: { text, ...options },
  });

export const localStop = (agentId: string) => api(`/api/local/agents/${agentId}/stop`, { method: 'POST' });
export const localShowOnMac = (agentId: string) => api(`/api/local/agents/${agentId}/show`, { method: 'POST' });
export const localDetail = (agentId: string) =>
  api<{ agent: any; events: any[] }>(`/api/local/agents/${agentId}`);
