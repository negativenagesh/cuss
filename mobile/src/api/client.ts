import { useStore, CursorIdeState, ModelFamily, ProjectEntry, PromptAttachments } from '../store';
import type { ExecutionMode } from '../theme';

/** REST client for the bridge (SPEC.md §4). Throws {status, code} on error. */
export async function api<T = any>(
  path: string,
  options: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const { bridgeUrl, token } = useStore.getState();
  if (!bridgeUrl || !token) throw Object.assign(new Error('not paired'), { status: 0, code: 'not_paired' });
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), options.timeoutMs ?? 30_000);
  let res: Response;
  try {
    res = await fetch(`${bridgeUrl}${path}`, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: ac.signal,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (e?.name === 'AbortError' || /cancelled|canceled|aborted/i.test(msg)) {
      throw Object.assign(
        new Error('Bridge took too long — restart it on the Mac (npm start in bridge/) and retry'),
        { status: 0, code: 'timeout' },
      );
    }
    throw e;
  } finally {
    clearTimeout(timer);
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

export const localMacScreen = () =>
  api<{
    ok: boolean;
    frontApp: string;
    imageBase64?: string;
    capturedAt: string;
    hint?: string;
  }>('/api/local/mac-screen', { timeoutMs: 15_000 });

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
