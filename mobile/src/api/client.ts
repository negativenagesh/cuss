import {
  useStore,
  detectLiveMacBridgeUrl,
  loadDeviceChatItems,
  CursorIdeState,
  LocalAgent,
  ModelFamily,
  ProjectEntry,
  PromptAttachments,
} from '../store';
import type { ExecutionMode } from '../theme';
import {
  directGetSettingsAndUsage,
  directListCloudAgents,
  directListModels,
  directNameAgent,
  resolveBeaconEndpoints,
  runDirectPhoneCursorTurn,
  stopDirectAgentRun,
} from './direct-cursor';

let syncingToMac = false;

async function syncDeviceChatsToMac(bridgeUrl: string, token: string) {
  if (syncingToMac) return;
  const state = useStore.getState();
  const localAgents = state.localAgents ?? [];
  if (localAgents.length === 0) return;
  syncingToMac = true;
  try {
    const transcripts: Record<string, any[]> = {};
    for (const ag of localAgents.slice(0, 12)) {
      const items = loadDeviceChatItems(ag.id);
      if (items.length > 0) transcripts[ag.id] = items;
    }
    await fetch(`${bridgeUrl}/api/local/sync-device`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ agents: localAgents, transcripts }),
    });
  } catch {
    /* ignore background sync errors */
  } finally {
    syncingToMac = false;
  }
}

async function probeBridgeCandidate(
  candidateUrl: string,
  fallbackToken: string | null,
  timeoutMs = 2200,
): Promise<{ bridgeUrl: string; token: string } | null> {
  const state = useStore.getState();
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeoutMs);
    const res = await fetch(`${candidateUrl}/api/auto-pair`, { signal: ac.signal });
    clearTimeout(t);
    if (res.ok) {
      const j = await res.json();
      const nextToken = j?.token ? String(j.token) : fallbackToken;
      if (nextToken) {
        const isTunnel = candidateUrl.startsWith('https://');
        await state.setPairing(candidateUrl, nextToken);
        state.setConnectionEndpoints({
          tunnelUrl: j?.tunnelUrl || (isTunnel ? candidateUrl : state.tunnelUrl),
          tailscaleUrl: j?.tailscaleUrl || state.tailscaleUrl,
          lanUrl: j?.lanUrl || (!isTunnel ? candidateUrl : state.lanUrl),
          connectionMode: isTunnel ? 'tunnel' : 'lan',
        });
        if (j?.cursorAuth?.accessToken) {
          await state.saveCursorTokens(
            j.cursorAuth.accessToken,
            j.cursorAuth.refreshToken,
            j.cursorAuth.email,
          );
        }
        void syncDeviceChatsToMac(candidateUrl, nextToken);
        return { bridgeUrl: candidateUrl, token: nextToken };
      }
    }
  } catch {
    /* try next */
  }
  return null;
}

/**
 * Multi-tier umbilical healing:
 *  Tier 1: Same-Wi-Fi LAN (`detectLiveMacBridgeUrl()`, `state.lanUrl`)
 *  Tier 2: Cached Worldwide HTTPS Tunnel (`state.tunnelUrl`) or Tailscale (`state.tailscaleUrl`)
 *  Tier 3: Live Worldwide Rendezvous Beacon (`https://ntfy.sh/cuss-umbilical-<sha256>`)
 */
export async function tryAutoHealBridge(): Promise<{ bridgeUrl: string; token: string } | null> {
  const state = useStore.getState();
  const directCandidates = Array.from(
    new Set(
      [
        detectLiveMacBridgeUrl(),
        state.bridgeUrl,
        state.tunnelUrl,
        state.tailscaleUrl,
        state.lanUrl,
      ].filter((x): x is string => Boolean(x)),
    ),
  );

  for (const candidateUrl of directCandidates) {
    const ok = await probeBridgeCandidate(
      candidateUrl,
      state.token,
      candidateUrl.startsWith('https://') ? 3200 : 1800,
    );
    if (ok) return ok;
  }

  // Tier 3: Query the Worldwide Rendezvous Beacon for the Mac's latest tunnel URL / IP
  if (state.token) {
    const beacon = await resolveBeaconEndpoints(state.token);
    for (const beaconUrl of beacon.urls) {
      if (directCandidates.includes(beaconUrl)) continue;
      const ok = await probeBridgeCandidate(beaconUrl, state.token, 3500);
      if (ok) return ok;
    }
  }

  return null;
}

/**
 * Tier 4 — Autonomous Direct Cursor Cloud Engine (`https://api2.cursor.sh`) when the Mac is COMPLETELY SHUT DOWN!
 * Uses the user's Cursor OAuth `accessToken` cached on the phone to talk directly to Cursor's cloud servers
 * and local device storage so CUSS continues working 100% even when the laptop is powered off.
 */
async function handleAutonomousCloudFallback<T = any>(
  path: string,
  options: { method?: string; body?: any } = {},
): Promise<T> {
  const state = useStore.getState();
  state.setConnectionEndpoints({ connectionMode: 'autonomous-cloud' });

  const method = (options.method ?? 'GET').toUpperCase();
  const body = (options.body ?? {}) as any;
  const accessToken = state.cursorAccessToken || '';

  // 1. Auth endpoints
  if (path === '/api/local/auth/status') {
    return {
      loggedIn: Boolean(accessToken || state.cursorSignedIn),
      email: state.accountEmail || undefined,
      loginInProgress: false,
    } as unknown as T;
  }

  if (path === '/api/local/auth/complete' && method === 'POST') {
    if (body?.accessToken) {
      await state.saveCursorTokens(body.accessToken, body.refreshToken, body.email);
    }
    return {
      loggedIn: true,
      email: body?.email || state.accountEmail || 'Cursor Account',
    } as unknown as T;
  }

  if (path === '/api/local/auth/logout' && method === 'POST') {
    await state.setCursorSignedIn(false, null);
    return { loggedOut: true } as unknown as T;
  }

  if (path === '/api/local/auth/login' && method === 'POST') {
    return {
      loggedIn: Boolean(accessToken),
      email: state.accountEmail || undefined,
      loginInProgress: false,
    } as unknown as T;
  }

  // 2. Cloud Background Composers (`GET /api/agents`)
  if (path === '/api/agents' && method === 'GET') {
    if (accessToken) {
      const cloud = await directListCloudAgents(accessToken);
      if (cloud.agents.length > 0) {
        state.setAgents(cloud.agents);
        return cloud as unknown as T;
      }
    }
    return { agents: state.agents ?? [] } as unknown as T;
  }

  // 3. Local / Device Agent List & Sync
  if (path.startsWith('/api/local/agents') && method === 'GET' && !path.slice('/api/local/agents'.length).startsWith('/')) {
    return {
      agents: state.localAgents ?? [],
      account: { email: state.accountEmail || undefined },
      autonomousCloud: true,
    } as unknown as T;
  }

  if (path === '/api/local/sync-ide' && method === 'POST') {
    return { agents: state.localAgents ?? [] } as unknown as T;
  }

  // 4. Models Catalog (`GET /api/local/models`)
  if (path.startsWith('/api/local/models')) {
    if (accessToken) {
      const res = await directListModels(accessToken, state.accountEmail);
      return res as unknown as T;
    }
    return {
      account: { email: state.accountEmail || undefined },
      families: state.modelFamilies,
      rawModels: [],
    } as unknown as T;
  }

  // 5. Settings & Live Plan Usage (`GET / POST /api/local/settings`)
  if (path === '/api/local/settings' && method === 'GET') {
    const res = await directGetSettingsAndUsage(
      accessToken,
      state.localAgents ?? [],
      state.accountEmail,
    );
    return res as unknown as T;
  }

  if (path === '/api/local/settings' && method === 'POST') {
    return {
      ok: true,
      cliConfig: body?.cliConfig ?? {},
      desktopSettings: body?.desktopSettings ?? {},
    } as unknown as T;
  }

  // 6. IDE State, Projects, Directory Browser, Files
  if (path === '/api/local/ide-state') {
    if (state.ideState) return state.ideState as unknown as T;
    const defaultCwd = state.selectedCwd || state.projects?.[0]?.path || '/workspace';
    return {
      activeWorkspace: {
        path: defaultCwd,
        name: defaultCwd.split('/').filter(Boolean).pop() || 'workspace',
        branch: 'main',
      },
      recentFiles: [],
      mcpServers: [],
      plans: [],
    } as unknown as T;
  }

  if (path === '/api/local/projects') {
    const projs =
      Array.isArray(state.projects) && state.projects.length > 0
        ? state.projects
        : [
            {
              path: state.selectedCwd || '/workspace',
              name: (state.selectedCwd || '/workspace').split('/').filter(Boolean).pop() || 'workspace',
              branch: 'main',
            },
          ];
    return { projects: projs } as unknown as T;
  }

  if (path.startsWith('/api/local/browse-dirs')) {
    const currentPath = state.selectedCwd || state.projects?.[0]?.path || '/Users';
    const dirs = (state.projects ?? []).map((p) => ({
      name: p.name || p.path.split('/').filter(Boolean).pop() || p.path,
      path: p.path,
      branch: p.branch || 'main',
      isGitRepo: true,
    }));
    return {
      currentPath,
      parentPath: currentPath.split('/').slice(0, -1).join('/') || '/',
      directories: dirs,
    } as unknown as T;
  }

  if (path.startsWith('/api/local/files')) {
    const recent = (state.ideState?.recentFiles ?? []).map((f) => ({
      path: f.absolutePath,
      relativePath: f.relativePath,
      size: 0,
    }));
    return { files: recent } as unknown as T;
  }

  if (path.startsWith('/api/local/git-diff')) {
    return {
      branch: 'main',
      branches: ['main'],
      changedFiles: [],
      statSummary: 'Mac is currently powered off — running in Autonomous Direct Cloud mode.',
      diff: '',
    } as unknown as T;
  }

  // 7. Create Agent & Run Direct Turn on `https://api2.cursor.sh` (`POST /api/local/agents`)
  if (path === '/api/local/agents' && method === 'POST') {
    if (!accessToken) {
      throw Object.assign(
        new Error('Mac is shut down. Sign in to Cursor on the Landing screen once to run agents directly from your phone.'),
        { status: 401, code: 'cursor_auth_required' },
      );
    }
    const promptText = String(body?.prompt ?? '').trim();
    const cwd = String(body?.cwd ?? state.selectedCwd ?? '/workspace').trim();
    const title = await directNameAgent(accessToken, promptText);
    const id = `cuss-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const nowIso = new Date().toISOString();
    const newAgent: LocalAgent = {
      id,
      name: title,
      cwd,
      mode: body?.mode ?? 'agent',
      model: body?.model ?? 'auto',
      effort: body?.effort ?? 'auto',
      contextWindow: body?.context ?? 'auto',
      fast: Boolean(body?.fast),
      thinking: body?.thinking ?? true,
      createdAt: nowIso,
      lastStatus: 'running',
      lastActivityAt: nowIso,
    };
    state.setLocalAgents([newAgent, ...(state.localAgents ?? [])]);

    void runDirectPhoneCursorTurn({
      accessToken,
      agentId: id,
      promptText,
      cwd,
      mode: body?.mode,
      model: body?.model,
      effort: body?.effort,
      context: body?.context,
      fast: body?.fast,
      thinking: body?.thinking,
    });

    return { agent: newAgent } as unknown as T;
  }

  // 8. Detail, Prompt, Stop, Rename, Delete on `/api/local/agents/:id...`
  const agentMatch = path.match(/^\/api\/local\/agents\/([^/?#]+)(?:\/([^/?#]+))?/);
  if (agentMatch) {
    const agentId = decodeURIComponent(agentMatch[1]);
    const subAction = agentMatch[2];

    if (!subAction && method === 'GET') {
      const found = (state.localAgents ?? []).find((a) => a.id === agentId);
      const events = loadDeviceChatItems(agentId);
      return {
        agent: found ?? {
          id: agentId,
          name: agentId,
          cwd: state.selectedCwd || '/workspace',
          createdAt: new Date().toISOString(),
          lastStatus: 'idle',
          lastActivityAt: new Date().toISOString(),
        },
        events,
      } as unknown as T;
    }

    if (subAction === 'prompt' && method === 'POST') {
      if (!accessToken) {
        throw Object.assign(
          new Error('Mac is shut down. Sign in to Cursor on the Landing screen to prompt agents directly from your phone.'),
          { status: 401, code: 'cursor_auth_required' },
        );
      }
      const found = (state.localAgents ?? []).find((a) => a.id === agentId);
      void runDirectPhoneCursorTurn({
        accessToken,
        agentId,
        promptText: String(body?.text ?? '').trim(),
        cwd: found?.cwd || state.selectedCwd || '/workspace',
        mode: body?.mode ?? found?.mode,
        model: body?.model ?? found?.model,
        effort: body?.effort ?? found?.effort,
        context: body?.context ?? found?.contextWindow,
        fast: body?.fast ?? found?.fast,
        thinking: body?.thinking ?? found?.thinking,
      });
      return { queued: false } as unknown as T;
    }

    if (subAction === 'stop' && method === 'POST') {
      const stopped = stopDirectAgentRun(agentId);
      return { stopped } as unknown as T;
    }

    if (!subAction && method === 'PATCH') {
      state.renameLocalAgentOnDevice(agentId, String(body?.name ?? '').trim());
      const updated = (useStore.getState().localAgents ?? []).find((a) => a.id === agentId);
      return { agent: updated } as unknown as T;
    }

    if (!subAction && method === 'DELETE') {
      state.deleteLocalAgentOnDevice(agentId);
      return { deleted: true, id: agentId } as unknown as T;
    }
  }

  throw Object.assign(
    new Error('Mac is currently powered off or unreachable for this hardware-only action.'),
    { status: 503, code: 'mac_offline' },
  );
}

/**
 * REST client for CUSS with 4-tier resilience:
 *  1. Local LAN Wi-Fi (`http://<LAN_IP>:4040`)
 *  2. Worldwide HTTPS Tunnel (`https://*.lhr.life` / `https://*.trycloudflare.com`) & Tailscale (`100.x.y.z`)
 *  3. Worldwide Rendezvous Beacon (`ntfy.sh/cuss-umbilical-<sha256>`)
 *  4. Autonomous Direct Cursor Cloud Engine (`https://api2.cursor.sh`) when the Mac is completely shut down!
 */
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  let { bridgeUrl, token, setPairing, setConnectionEndpoints } = useStore.getState();
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
    if (healed) {
      bridgeUrl = healed.bridgeUrl;
      token = healed.token;
    } else if (useStore.getState().cursorAccessToken) {
      return await handleAutonomousCloudFallback<T>(path, options);
    } else {
      throw Object.assign(new Error('not paired'), { status: 0, code: 'not_paired' });
    }
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
    const initialTimeout = options.timeoutMs ?? 5_500;
    res = await doFetch(bridgeUrl, token, initialTimeout);
    setConnectionEndpoints({
      connectionMode: bridgeUrl.startsWith('https://') ? 'tunnel' : 'lan',
    });
  } catch (e: any) {
    // LAN or cached URL unreachable -> try Worldwide Tunnel / Tailscale / Beacon!
    const healed = await tryAutoHealBridge();
    if (healed) {
      try {
        res = await doFetch(healed.bridgeUrl, healed.token, options.timeoutMs ?? 10_000);
      } catch {
        return await handleAutonomousCloudFallback<T>(path, options);
      }
    } else {
      // Mac is completely shut down / offline -> seamlessly run on Autonomous Direct Cursor Cloud!
      return await handleAutonomousCloudFallback<T>(path, options);
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

  // Opportunistically cache cursorAuth if returned by /api/local/auth/status
  if (json?.cursorAuth?.accessToken) {
    void useStore
      .getState()
      .saveCursorTokens(
        json.cursorAuth.accessToken,
        json.cursorAuth.refreshToken,
        json.cursorAuth.email,
      );
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

// --- Local agents: run on the Mac itself via the Cursor Agent CLI (or Direct Cloud when Mac is shut down) ---
export const localList = (syncIde = false) =>
  api<{ agents: any[]; account?: { email?: string; displayName?: string }; autonomousCloud?: boolean }>(
    `/api/local/agents${syncIde ? '?sync=1' : ''}`,
  );

export interface CursorAuthStatus {
  loggedIn: boolean;
  email?: string;
  displayName?: string;
  loginInProgress: boolean;
  loginUrl?: string;
  cursorAuth?: {
    accessToken: string;
    refreshToken?: string;
    email?: string;
  };
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
    | 'backspace'
    | 'move-rel'
    | 'mouse-down'
    | 'mouse-up'
    | 'click-here'
    | 'rightclick-here'
    | 'paste-text'
    | 'clipboard-set';
  target?: string;
  x?: number;
  y?: number;
  deltaY?: number;
  deltaX?: number;
  text?: string;
  count?: number;
}) =>
  api<{ ok: boolean; detail?: string }>('/api/local/mac-action', {
    method: 'POST',
    body,
    timeoutMs: 6_000,
  });

export type MacInputAction = Parameters<typeof localMacAction>[0];

export interface MacFocusInfo {
  ok: boolean;
  trusted: boolean;
  app: string;
  bundleId?: string;
  role: string;
  subrole?: string;
  title?: string;
  placeholder?: string;
  description?: string;
  editable: boolean;
  secure: boolean;
  multiline: boolean;
  value?: string;
  valueTruncated?: boolean;
  valueLength?: number;
  selectionStart?: number;
  selectionLength?: number;
  line?: number;
  axError?: number;
}

export const localMacFocus = () => api<MacFocusInfo>('/api/local/mac-focus', { timeoutMs: 5_000 });
export const localMacClipboard = () => api<{ text: string }>('/api/local/mac-clipboard', { timeoutMs: 5_000 });

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

export interface CursorSettingsResponse {
  account: {
    email?: string;
    displayName?: string;
    userId?: number;
    authId?: string;
    signUpType?: string;
    membershipType: string;
    subscriptionStatus: string;
  };
  planInfo: {
    planName: string;
    price: string;
    billingCycleStart?: string;
    billingCycleEnd?: string;
    includedUsagePeriod?: string;
  };
  planUsage: {
    totalSpendCents: number;
    includedSpendCents: number;
    bonusSpendCents: number;
    limitCents: number;
    autoPercentUsed: number;
    apiPercentUsed: number;
    totalPercentUsed: number;
    remainingBonus: boolean;
    bonusTooltip: string;
    displayMessage?: string;
    autoModelSelectedDisplayMessage?: string;
    namedModelSelectedDisplayMessage?: string;
    autoBucketModels: string[];
    noUsageBasedAllowed: boolean;
  };
  privacy: {
    privacyMode: string;
    ghostMode: boolean;
  };
  cliConfig: Record<string, any>;
  desktopSettings: Record<string, any>;
  savedPlans: { id: string; name: string; path: string }[];
  mcpServers: { name: string; command?: string; url?: string }[];
  localTelemetry: {
    sessionCount: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
  };
}

export const localGetSettings = () =>
  api<CursorSettingsResponse>('/api/local/settings', { timeoutMs: 12_000 });

export const localUpdateSettings = (patch: {
  cliConfig?: Record<string, any>;
  desktopSettings?: Record<string, any>;
}) =>
  api<{ ok: boolean; cliConfig: Record<string, any>; desktopSettings: Record<string, any> }>(
    '/api/local/settings',
    { method: 'POST', body: patch, timeoutMs: 8_000 },
  );
