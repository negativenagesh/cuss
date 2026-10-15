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
  source?: 'ide-active' | 'ide-history' | 'session' | 'downloads';
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
}

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

/** Load saved chat conversation items directly from the Android device's local storage. */
export function loadDeviceChatItems<T = any>(agentId: string): T[] {
  if (!agentId) return [];
  try {
    const f = getDeviceChatFile(agentId);
    if (!f.exists) return [];
    const raw = f.textSync();
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Save chat conversation items directly onto the Android device's local storage. */
export function saveDeviceChatItems(agentId: string, items: unknown[]) {
  if (!agentId || !Array.isArray(items)) return;
  try {
    const f = getDeviceChatFile(agentId);
    f.write(JSON.stringify(items.slice(-200)));
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

interface State {
  bridgeUrl: string | null;
  token: string | null;
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
  setPairing: (url: string, token: string) => Promise<void>;
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
  async setPairing(bridgeUrl, token) {
    await SecureStore.setItemAsync('bridgeUrl', bridgeUrl);
    await SecureStore.setItemAsync('pairingToken', token);
    set({ bridgeUrl, token });
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
    const detectedUrl = detectLiveMacBridgeUrl();

    // If the Mac's Wi-Fi IP changed (e.g. 192.168.1.10 -> 10.10.0.160), auto-switch immediately!
    if (detectedUrl && (!bridgeUrl || (isPrivateLanUrl(bridgeUrl) && bridgeUrl !== detectedUrl))) {
      bridgeUrl = detectedUrl;
      await SecureStore.setItemAsync('bridgeUrl', bridgeUrl);
    }

    // Auto-pair over same Wi-Fi if token is not yet saved
    if (bridgeUrl && !token) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 2500);
        const res = await fetch(`${bridgeUrl}/api/auto-pair`, { signal: ac.signal });
        clearTimeout(t);
        if (res.ok) {
          const j = await res.json();
          if (j?.token) {
            token = String(j.token);
            await SecureStore.setItemAsync('pairingToken', token);
          }
        }
      } catch {
        /* manual or QR pairing remains available */
      }
    }

    const secureSigned = await SecureStore.getItemAsync('cursorSignedIn');
    const snap = readDeviceStateSnapshot();
    const cursorSignedIn = secureSigned === '1' || Boolean(snap.cursorSignedIn);
    set({
      bridgeUrl,
      token,
      localAgents: Array.isArray(snap.localAgents) ? snap.localAgents : [],
      agents: Array.isArray(snap.agents) ? snap.agents : [],
      projects: Array.isArray(snap.projects) ? snap.projects : [],
      accountEmail: snap.accountEmail ?? null,
      cursorSignedIn,
      deletedChatIds: Array.isArray(snap.deletedChatIds) ? snap.deletedChatIds : [],
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
