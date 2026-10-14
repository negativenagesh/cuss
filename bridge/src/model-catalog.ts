import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';

export type ExecutionMode = 'agent' | 'plan' | 'ask' | 'debug' | 'multitask';

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

export interface ModelSelectionInput {
  model?: string;
  effort?: string;
  context?: string;
  fast?: boolean;
  thinking?: boolean;
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

interface FamilyMeta {
  id: string;
  name: string;
  provider: ModelFamily['provider'];
  tagline: string;
  contexts: string[];
  defaultContext: string;
  efforts: string[];
  defaultEffort: string;
  supportsFast: boolean;
  supportsThinking: boolean;
  defaultThinking: boolean;
}

/**
 * Ground-truth parameter matrix from REA capture ev_72cac7c7 (/api/background-composer/available-models)
 * paired with local `cursor agent --list-models` on macOS (Cursor 3.24.18).
 */
const KNOWN_FAMILIES: FamilyMeta[] = [
  {
    id: 'auto',
    name: 'Auto',
    provider: 'cursor',
    tagline: 'Cursor Router picks the optimal frontier model per turn (Default)',
    contexts: ['auto'],
    defaultContext: 'auto',
    efforts: ['auto'],
    defaultEffort: 'auto',
    supportsFast: false,
    supportsThinking: true,
    defaultThinking: true,
  },
  {
    id: 'grok-4.7',
    name: 'Grok 4.7',
    provider: 'xai',
    tagline: 'xAI flagship with 256K/500K context and blazing fast mode',
    contexts: ['256k', '500k'],
    defaultContext: '256k',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'cursor-grok-4.6',
    name: 'Grok 4.6',
    provider: 'xai',
    tagline: 'Cursor-tuned Grok 4.6 for fast agentic tool loops',
    contexts: ['256k'],
    defaultContext: '256k',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'cursor-grok-4.5',
    name: 'Grok 4.5',
    provider: 'xai',
    tagline: 'High-speed Grok 4.5 coding & terminal agent',
    contexts: ['256k'],
    defaultContext: '256k',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'composer-2.5',
    name: 'Composer 2.5',
    provider: 'cursor',
    tagline: 'Cursor native low-latency multi-file composer model',
    contexts: ['200k'],
    defaultContext: '200k',
    efforts: ['medium'],
    defaultEffort: 'medium',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'gpt-5.3-codex',
    name: 'Codex 5.3',
    provider: 'openai',
    tagline: 'Surgical repository-scale terminal and code execution specialist',
    contexts: ['272k'],
    defaultContext: '272k',
    efforts: ['low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'claude-opus-5-5',
    name: 'Claude Opus 5.5',
    provider: 'anthropic',
    tagline: 'Flagship Anthropic reasoning & deep architecture synthesis',
    contexts: ['300k', '1m'],
    defaultContext: '1m',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'claude-opus-5',
    name: 'Claude Opus 5',
    provider: 'anthropic',
    tagline: '1M context workhorse with toggleable extended thinking',
    contexts: ['300k', '1m'],
    defaultContext: '1m',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: true,
    defaultThinking: true,
  },
  {
    id: 'claude-opus-4-8',
    name: 'Claude Opus 4.8',
    provider: 'anthropic',
    tagline: 'Battle-tested 1M Opus with granular effort & fast overrides',
    contexts: ['300k', '1m'],
    defaultContext: '1m',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: true,
    defaultThinking: true,
  },
  {
    id: 'claude-sonnet-5-5',
    name: 'Claude Sonnet 5.5',
    provider: 'anthropic',
    tagline: 'High-velocity code generation and multi-file refactoring',
    contexts: ['300k', '1m'],
    defaultContext: '1m',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: false,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'claude-sonnet-5',
    name: 'Claude Sonnet 5',
    provider: 'anthropic',
    tagline: 'Balanced 1M coding agent with optional chain-of-thought',
    contexts: ['300k', '1m'],
    defaultContext: '1m',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: false,
    supportsThinking: true,
    defaultThinking: true,
  },
  {
    id: 'gpt-5.6-sol',
    name: 'GPT-5.6 Sol',
    provider: 'openai',
    tagline: 'OpenAI Sol 1M frontier agent with deep reasoning effort control',
    contexts: ['272k', '1m'],
    defaultContext: '1m',
    efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    provider: 'openai',
    tagline: 'OpenAI Luna 1M tuned for rapid iterative code synthesis',
    contexts: ['272k', '1m'],
    defaultContext: '1m',
    efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'gpt-5.6-terra',
    name: 'GPT-5.6 Terra',
    provider: 'openai',
    tagline: 'OpenAI Terra 1M full-stack systems & tool orchestration',
    contexts: ['272k', '1m'],
    defaultContext: '1m',
    efforts: ['none', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    provider: 'openai',
    tagline: 'Versatile 1M reasoning model with fast turbo mode',
    contexts: ['272k', '1m'],
    defaultContext: '1m',
    efforts: ['none', 'low', 'medium', 'high', 'xhigh'],
    defaultEffort: 'high',
    supportsFast: true,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'gemini-4-argon',
    name: 'Gemini 4 Argon',
    provider: 'google',
    tagline: 'Google frontier multimodal & large-codebase reasoning',
    contexts: ['1m'],
    defaultContext: '1m',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    supportsFast: false,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'gemini-3.8-flash',
    name: 'Gemini 3.8 Flash',
    provider: 'google',
    tagline: 'Ultra-low latency Flash reasoning for quick edits',
    contexts: ['1m'],
    defaultContext: '1m',
    efforts: ['low', 'medium', 'high'],
    defaultEffort: 'high',
    supportsFast: false,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'muse-spark-1.3',
    name: 'Muse Spark 1.3',
    provider: 'other',
    tagline: 'Creative 1M synthesis model with 6 effort tiers',
    contexts: ['300k', '1m'],
    defaultContext: '1m',
    efforts: ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: false,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'claude-haiku-5-5',
    name: 'Claude Haiku 5.5',
    provider: 'anthropic',
    tagline: 'Instantaneous lightweight agent with optional thinking',
    contexts: ['300k', '1m'],
    defaultContext: '300k',
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    supportsFast: false,
    supportsThinking: true,
    defaultThinking: true,
  },
  {
    id: 'kimi-k3',
    name: 'Kimi K3',
    provider: 'moonshot',
    tagline: 'Moonshot K3 long-context code & reasoning agent',
    contexts: ['256k'],
    defaultContext: '256k',
    efforts: ['low', 'high', 'max'],
    defaultEffort: 'high',
    supportsFast: false,
    supportsThinking: false,
    defaultThinking: false,
  },
  {
    id: 'glm-5.2',
    name: 'GLM 5.2',
    provider: 'zhipu',
    tagline: 'GLM 5.2 high-efficiency bilingual coding agent',
    contexts: ['200k'],
    defaultContext: '200k',
    efforts: ['high', 'max'],
    defaultEffort: 'high',
    supportsFast: false,
    supportsThinking: false,
    defaultThinking: false,
  },
];

const EFFORT_TOKENS = ['minimal', 'none', 'low', 'medium', 'high', 'xhigh', 'extra-high', 'max'] as const;

export function parseVariantMetadata(slug: string, label: string): ModelVariant {
  const fast = slug.endsWith('-fast') || /\bfast\b/i.test(label);
  const thinking = slug.includes('-thinking') || (/\bthinking\b/i.test(label) && !/no thinking/i.test(label));
  let effort: string | undefined;
  for (const tok of EFFORT_TOKENS) {
    const re = new RegExp(`(?:^|-)${tok}(?:-fast|$)`, 'i');
    if (re.test(slug)) {
      effort = tok === 'extra-high' ? 'xhigh' : tok.toLowerCase();
      break;
    }
  }
  const context = /\b1M\b/.test(label) ? '1m' : undefined;
  return { slug, label: label.replace(/\s+/g, ' ').trim(), effort, context, fast, thinking };
}

/**
 * Parse raw `cursor agent --list-models` stdout into structured families + variants.
 */
export function parseCliModelsOutput(stdout: string): {
  families: ModelFamily[];
  rawModels: { slug: string; label: string }[];
} {
  const rawModels: { slug: string; label: string }[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('Available') || line.startsWith('Tip:')) continue;
    const m = /^([a-z0-9._-]+)\s+-\s+(.+)$/i.exec(line);
    if (!m) continue;
    rawModels.push({ slug: m[1].trim(), label: m[2].trim() });
  }

  // Sort KNOWN_FAMILIES longest-prefix first so claude-opus-5-5 matches before claude-opus-5
  const sortedMeta = [...KNOWN_FAMILIES].sort((a, b) => b.id.length - a.id.length);
  const byFamily = new Map<string, ModelVariant[]>();
  for (const fam of KNOWN_FAMILIES) byFamily.set(fam.id, []);

  for (const item of rawModels) {
    const matched = sortedMeta.find(
      (f) => item.slug === f.id || item.slug.startsWith(`${f.id}-`),
    );
    if (matched) {
      byFamily.get(matched.id)!.push(parseVariantMetadata(item.slug, item.label));
    }
  }

  const PINNED_TOP_IDS = new Set([
    'auto',
    'grok-4.7',
    'cursor-grok-4.6',
    'cursor-grok-4.5',
    'composer-2.5',
  ]);
  const families: ModelFamily[] = [];
  for (const meta of KNOWN_FAMILIES) {
    const variants = byFamily.get(meta.id) ?? [];
    // Always keep Auto + Grok + Composer pinned at the top, plus any family listed by the CLI
    if (variants.length === 0 && rawModels.length > 0 && !PINNED_TOP_IDS.has(meta.id)) continue;
    families.push({
      id: meta.id,
      name: meta.name,
      provider: meta.provider,
      tagline: meta.tagline,
      efforts: meta.efforts,
      contexts: meta.contexts,
      supportsFast: meta.supportsFast,
      supportsThinking: meta.supportsThinking,
      defaultEffort: meta.defaultEffort,
      defaultContext: meta.defaultContext,
      defaultThinking: meta.defaultThinking,
      variants:
        variants.length > 0
          ? variants
          : [{ slug: meta.id, label: meta.name, effort: meta.defaultEffort, context: meta.defaultContext, fast: false, thinking: meta.defaultThinking }],
    });
  }

  return { families, rawModels };
}

/**
 * Resolve a structured model + parameter selection into the exact verified slug
 * accepted by `cursor agent --model <spec>`.
 * Never emits invalid bracket strings like `grok-4.7[thinking=false,...]`.
 */
export function resolveCliModelSpec(
  selection: ModelSelectionInput,
  families: ModelFamily[] = parseCliModelsOutput('').families,
): string | undefined {
  if (!selection.model || selection.model === 'auto' || selection.model === 'default') {
    return undefined; // CLI default is Auto
  }
  if (selection.model.includes('[')) return selection.model;

  const fam = families.find((f) => f.id === selection.model);
  if (!fam) {
    return selection.model;
  }

  const effort = selection.effort && fam.efforts.includes(selection.effort) ? selection.effort : fam.defaultEffort;
  const fast = fam.supportsFast ? Boolean(selection.fast) : false;
  const thinking = fam.supportsThinking ? (selection.thinking ?? fam.defaultThinking) : false;

  // 1. Exact match in CLI-discovered variants for (effort, fast, thinking)
  const exact = fam.variants.find(
    (v) =>
      (v.effort ?? fam.defaultEffort) === effort &&
      v.fast === fast &&
      (fam.supportsThinking ? v.thinking === thinking : true),
  );
  if (exact) return exact.slug;

  // 2. Match by (effort, fast)
  const byEffortFast = fam.variants.find(
    (v) => (v.effort ?? fam.defaultEffort) === effort && v.fast === fast,
  );
  if (byEffortFast) return byEffortFast.slug;

  // 3. Match by effort only
  const byEffort = fam.variants.find((v) => (v.effort ?? fam.defaultEffort) === effort);
  if (byEffort) return byEffort.slug;

  // 4. Construct verified slug pattern: <family>[-thinking][-<effort>][-fast]
  if (fam.id === 'composer-2.5') {
    return fast ? 'composer-2.5-fast' : 'composer-2.5';
  }
  const segments = [fam.id];
  if (fam.supportsThinking && thinking) {
    segments.push('thinking');
  }
  if (effort && effort !== 'auto' && !(fam.id === 'gpt-5.3-codex' && effort === 'medium')) {
    segments.push(effort);
  }
  if (fam.supportsFast && fast) {
    segments.push('fast');
  }
  return segments.join('-');
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

function readGitBranch(dir: string): string | undefined {
  try {
    const headPath = join(dir, '.git', 'HEAD');
    if (!existsSync(headPath)) return undefined;
    const head = readFileSync(headPath, 'utf8').trim();
    if (head.startsWith('ref: refs/heads/')) return head.slice('ref: refs/heads/'.length);
    return head.slice(0, 7);
  } catch {
    return undefined;
  }
}

function fileUriToPath(uri: string | undefined): string | undefined {
  if (!uri || !uri.startsWith('file://')) return undefined;
  try {
    return decodeURIComponent(uri.replace(/^file:\/\//, ''));
  } catch {
    return undefined;
  }
}

/** Read Cursor IDE's globalStorage/storage.json for active window & historical workspaces. */
export function readCursorStorageWorkspaces(): { activePath?: string; allPaths: string[] } {
  const storagePath = join(
    homedir(),
    'Library',
    'Application Support',
    'Cursor',
    'User',
    'globalStorage',
    'storage.json',
  );
  if (!existsSync(storagePath)) return { allPaths: [] };
  try {
    const data = JSON.parse(readFileSync(storagePath, 'utf8'));
    const activeUri =
      data?.windowsState?.lastActiveWindow?.folder ??
      data?.backupWorkspaces?.folders?.[0]?.folderUri;
    const activePath = fileUriToPath(activeUri);
    const assoc = Object.keys(data?.profileAssociations?.workspaces ?? {})
      .map(fileUriToPath)
      .filter((p): p is string => Boolean(p));
    const allPaths = [...new Set([ ...(activePath ? [activePath] : []), ...assoc ])];
    return { activePath, allPaths };
  } catch {
    return { allPaths: [] };
  }
}

/** Discover real project folders on this Mac (IDE active window first, then IDE history, sessions, and Downloads). */
export function discoverLocalProjects(extraCwds: string[] = []): ProjectEntry[] {
  const seen = new Set<string>();
  const out: ProjectEntry[] = [];
  const { activePath, allPaths } = readCursorStorageWorkspaces();

  const add = (p: string, source: ProjectEntry['source']) => {
    if (!p || seen.has(p)) return;
    try {
      if (!existsSync(p) || !statSync(p).isDirectory()) return;
      seen.add(p);
      out.push({
        path: p,
        name: basename(p) || p,
        branch: readGitBranch(p),
        activeInIde: p === activePath,
        source: p === activePath ? 'ide-active' : source,
      });
    } catch {
      /* ignore inaccessible */
    }
  };

  if (activePath) add(activePath, 'ide-active');
  for (const p of allPaths) add(p, 'ide-history');
  for (const c of extraCwds) add(c, 'session');

  const downloads = join(homedir(), 'Downloads');
  add(join(downloads, 'cuss'), 'downloads');
  try {
    for (const entry of readdirSync(downloads, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const full = join(downloads, entry.name);
      if (
        existsSync(join(full, '.git')) ||
        existsSync(join(full, 'package.json')) ||
        existsSync(join(full, 'pyproject.toml'))
      ) {
        add(full, 'downloads');
      }
    }
  } catch {
    /* ignore */
  }
  return out.slice(0, 25);
}

/** Read live Cursor IDE state (~/.cursor/ide_state.json, plans, mcp.json, active window). */
export function readCursorIdeState(): CursorIdeState {
  const home = homedir();
  const { activePath } = readCursorStorageWorkspaces();
  const activeWorkspace = activePath
    ? { path: activePath, name: basename(activePath), branch: readGitBranch(activePath) }
    : undefined;

  const recentFiles: CursorIdeState['recentFiles'] = [];
  const ideStatePath = join(home, '.cursor', 'ide_state.json');
  if (existsSync(ideStatePath)) {
    try {
      const ide = JSON.parse(readFileSync(ideStatePath, 'utf8'));
      for (const f of ide?.recentlyViewedFiles ?? []) {
        if (
          f?.absolutePath &&
          f?.relativePath &&
          !/^[0-9a-f]{6}$/i.test(f.relativePath) &&
          existsSync(f.absolutePath)
        ) {
          recentFiles.push({
            relativePath: f.relativePath,
            absolutePath: f.absolutePath,
            workspaceName: basename(
              f.absolutePath.slice(0, Math.max(0, f.absolutePath.length - f.relativePath.length - 1)),
            ),
          });
        }
      }
    } catch {
      /* ignore */
    }
  }

  const mcpServers: { name: string; transport: string }[] = [];
  const mcpPath = join(home, '.cursor', 'mcp.json');
  if (existsSync(mcpPath)) {
    try {
      const mcp = JSON.parse(readFileSync(mcpPath, 'utf8'));
      for (const [name, cfg] of Object.entries<any>(mcp?.mcpServers ?? {})) {
        mcpServers.push({
          name,
          transport: cfg?.url ? 'http' : cfg?.command ? `stdio (${cfg.command})` : 'mcp',
        });
      }
    } catch {
      /* ignore */
    }
  }

  const plans: CursorPlanEntry[] = [];
  const plansDir = join(home, '.cursor', 'plans');
  if (existsSync(plansDir)) {
    try {
      const entries = readdirSync(plansDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => {
          const full = join(plansDir, f);
          const st = statSync(full);
          return { f, full, mtime: st.mtimeMs, iso: st.mtime.toISOString() };
        })
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 15);
      for (const item of entries) {
        const raw = readFileSync(item.full, 'utf8');
        const cleanName = item.f
          .replace(/\.plan\.md$|\.md$/i, '')
          .replace(/_[0-9a-f]{8}$/i, '')
          .replace(/[_-]+/g, ' ');
        plans.push({
          id: item.f,
          name: cleanName,
          filename: item.f,
          path: item.full,
          updatedAt: item.iso,
          preview: raw.replace(/^#+\s*/gm, '').trim().slice(0, 160),
          content: raw.slice(0, 4000),
        });
      }
    } catch {
      /* ignore */
    }
  }

  return { activeWorkspace, recentFiles: recentFiles.slice(0, 15), mcpServers, plans };
}

export interface DirectoryBrowseResult {
  currentPath: string;
  parentPath: string;
  directories: { name: string; path: string; branch?: string; isGitRepo: boolean }[];
}

/** Interactive directory navigator for the Workspace Vault Dropdown. */
export function browseMacDirectories(dirPath?: string): DirectoryBrowseResult {
  const target = dirPath && existsSync(dirPath) ? dirPath : join(homedir(), 'Downloads');
  const parentPath = join(target, '..');
  const directories: DirectoryBrowseResult['directories'] = [];
  try {
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      const full = join(target, entry.name);
      const branch = readGitBranch(full);
      directories.push({
        name: entry.name,
        path: full,
        branch,
        isGitRepo: Boolean(branch) || existsSync(join(full, '.git')),
      });
    }
  } catch {
    /* ignore */
  }
  directories.sort((a, b) => Number(b.isGitRepo) - Number(a.isGitRepo) || a.name.localeCompare(b.name));
  return { currentPath: target, parentPath, directories: directories.slice(0, 50) };
}

/** Convert a cwd path into Cursor's ~/.cursor/projects/<slug> directory name. */
export function cwdToCursorProjectSlug(cwd: string): string {
  return cwd.replace(/^\/+/, '').replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Parse a Cursor native `.jsonl` transcript file from
 * `~/.cursor/projects/<slug>/agent-transcripts/<sessionId>/<sessionId>.jsonl`
 * into CUSS `RunEvent` records so chat history survives bridge restarts and IDE chats sync!
 */
export function parseCursorJsonlTranscript(
  agentId: string,
  jsonlPath: string,
): { events: { agentId: string; raw: unknown; at: string }[]; firstPrompt?: string; updatedAt: string } {
  if (!existsSync(jsonlPath)) return { events: [], updatedAt: new Date().toISOString() };
  const st = statSync(jsonlPath);
  const updatedAt = st.mtime.toISOString();
  const events: { agentId: string; raw: unknown; at: string }[] = [];
  let firstPrompt: string | undefined;

  try {
    const lines = readFileSync(jsonlPath, 'utf8').split(/\r?\n/);
    for (const ln of lines) {
      if (!ln.trim()) continue;
      let j: any;
      try {
        j = JSON.parse(ln);
      } catch {
        continue;
      }
      const role = j?.role;
      const content = Array.isArray(j?.message?.content) ? j.message.content : [];
      if (role === 'user') {
        const rawText = content
          .filter((c: any) => c?.type === 'text')
          .map((c: any) => String(c.text ?? ''))
          .join('\n');
        // Strip <timestamp>...</timestamp> and <user_query> wrappers added by Cursor IDE
        const queryMatch = /<user_query>\s*([\s\S]*?)\s*<\/user_query>/i.exec(rawText);
        const cleanText = (queryMatch ? queryMatch[1] : rawText.replace(/<timestamp>[\s\S]*?<\/timestamp>/gi, ''))
          .trim();
        if (cleanText) {
          if (!firstPrompt) firstPrompt = cleanText;
          events.push({
            agentId,
            raw: { type: 'cuss_user_turn', text: cleanText, mode: 'agent' },
            at: updatedAt,
          });
        }
      } else if (role === 'assistant') {
        const texts: string[] = [];
        for (const c of content) {
          if (c?.type === 'text' && c.text?.trim()) {
            texts.push(String(c.text).replace(/\[REDACTED\]/g, '').trim());
          } else if (c?.type === 'tool_use') {
            const toolName = `${c.name ?? 'Tool'}ToolCall`;
            events.push({
              agentId,
              raw: {
                type: 'tool_call',
                subtype: 'completed',
                call_id: `disk-${events.length}`,
                tool_call: {
                  [toolName]: {
                    args: c.input ?? {},
                  },
                },
              },
              at: updatedAt,
            });
          }
        }
        const joined = texts.filter(Boolean).join('\n\n');
        if (joined) {
          events.push({
            agentId,
            raw: {
              type: 'assistant',
              message: { content: [{ type: 'text', text: joined }] },
            },
            at: updatedAt,
          });
        }
      }
    }
  } catch {
    /* ignore malformed */
  }
  return { events, firstPrompt, updatedAt };
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.expo',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  'captures',
  'exported-scripts',
]);

export interface WorkspaceFileEntry {
  path: string;
  relativePath: string;
  size: number;
}

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

const EXT_TO_LANG: Record<string, string> = {
  '.ts': 'TYPESCRIPT',
  '.tsx': 'TSX',
  '.js': 'JAVASCRIPT',
  '.jsx': 'JSX',
  '.mjs': 'JAVASCRIPT',
  '.cjs': 'JAVASCRIPT',
  '.py': 'PYTHON',
  '.json': 'JSON',
  '.jsonl': 'JSONL',
  '.md': 'MARKDOWN',
  '.mdx': 'MDX',
  '.sh': 'SHELL',
  '.zsh': 'SHELL',
  '.bash': 'SHELL',
  '.yml': 'YAML',
  '.yaml': 'YAML',
  '.toml': 'TOML',
  '.sql': 'SQL',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.svg': 'SVG',
  '.csv': 'CSV',
  '.tsv': 'TSV',
  '.rs': 'RUST',
  '.go': 'GO',
  '.java': 'JAVA',
  '.kt': 'KOTLIN',
  '.swift': 'SWIFT',
  '.rb': 'RUBY',
  '.php': 'PHP',
  '.c': 'C',
  '.cpp': 'CPP',
  '.h': 'C-HEADER',
  '.xml': 'XML',
  '.graphql': 'GRAPHQL',
  '.prisma': 'PRISMA',
  '.dockerfile': 'DOCKERFILE',
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
};

/**
 * Resolve & read any file on the Mac workspace (code, markdown, json, csv, image, or binary)
 * so the mobile app can render and view any clicked file inline.
 */
export function readWorkspaceFile(cwd: string | undefined, rawPath: string): WorkspaceFileContent {
  let cleaned = (rawPath ?? '').trim().replace(/^@+/, '').replace(/^['"`]|['"`]$/g, '');
  let highlightLine: number | undefined;

  // Strip #L42 or :42:10 line/col suffixes
  const hashLine = /#L(\d+)(?:-L?\d+)?$/i.exec(cleaned);
  if (hashLine) {
    highlightLine = Number(hashLine[1]);
    cleaned = cleaned.slice(0, hashLine.index);
  } else {
    const colonLine = /:(\d+)(?::\d+)?$/.exec(cleaned);
    if (colonLine) {
      highlightLine = Number(colonLine[1]);
      cleaned = cleaned.slice(0, colonLine.index);
    }
  }

  if (cleaned.startsWith('~/')) {
    cleaned = join(homedir(), cleaned.slice(2));
  }

  const baseDir = cwd && existsSync(cwd) ? cwd : process.cwd();
  let resolvedPath = isAbsolute(cleaned) ? resolve(cleaned) : resolve(baseDir, cleaned);

  // If the file doesn't exist directly, search the workspace for a matching relative path or basename
  if (!existsSync(resolvedPath) || statSync(resolvedPath).isDirectory()) {
    const candidates = listWorkspaceFiles(baseDir, cleaned, 15);
    const exactBase = candidates.find(
      (c) =>
        c.relativePath === cleaned ||
        c.relativePath.endsWith(`/${cleaned}`) ||
        basename(c.path).toLowerCase() === basename(cleaned).toLowerCase(),
    );
    if (exactBase) {
      resolvedPath = exactBase.path;
    } else if (candidates.length > 0) {
      resolvedPath = candidates[0].path;
    }
  }

  if (!existsSync(resolvedPath) || statSync(resolvedPath).isDirectory()) {
    return {
      ok: false,
      kind: 'code',
      name: basename(cleaned) || cleaned || 'Unknown',
      relativePath: cleaned,
      absolutePath: resolvedPath,
      size: 0,
      language: 'TEXT',
      content: '',
      lineCount: 0,
      error: `File not found on Mac: ${cleaned}`,
    };
  }

  const st = statSync(resolvedPath);
  const ext = extname(resolvedPath).toLowerCase();
  const relPath =
    baseDir && resolvedPath.startsWith(baseDir)
      ? relative(baseDir, resolvedPath) || basename(resolvedPath)
      : resolvedPath;
  const name = basename(resolvedPath);
  const updatedAt = st.mtime.toISOString();

  // 1. Image files -> Base64 data URI for direct image rendering
  if (IMAGE_MIME_BY_EXT[ext]) {
    const mimeType = IMAGE_MIME_BY_EXT[ext];
    const maxImgBytes = 8 * 1024 * 1024;
    if (st.size > maxImgBytes) {
      return {
        ok: true,
        kind: 'binary',
        name,
        relativePath: relPath,
        absolutePath: resolvedPath,
        size: st.size,
        language: ext.slice(1).toUpperCase(),
        content: `Image file (${(st.size / (1024 * 1024)).toFixed(2)} MB) exceeds inline preview limit.`,
        lineCount: 1,
        updatedAt,
      };
    }
    const b64 = readFileSync(resolvedPath).toString('base64');
    return {
      ok: true,
      kind: 'image',
      name,
      relativePath: relPath,
      absolutePath: resolvedPath,
      size: st.size,
      language: ext.slice(1).toUpperCase(),
      mimeType,
      imageBase64: `data:${mimeType};base64,${b64}`,
      content: '',
      lineCount: 0,
      updatedAt,
    };
  }

  // 2. Read buffer & check if binary vs UTF-8 text
  const rawBuf = readFileSync(resolvedPath);
  const sample = rawBuf.subarray(0, Math.min(rawBuf.length, 4096));
  const hasNullByte = sample.includes(0);

  if (hasNullByte) {
    // Provide clean hex + ASCII inspection for binary artifacts (.ttf, .db, .pdf, .bin, etc.)
    const previewBytes = rawBuf.subarray(0, Math.min(rawBuf.length, 512));
    const hexLines: string[] = [];
    for (let offset = 0; offset < previewBytes.length; offset += 16) {
      const slice = previewBytes.subarray(offset, offset + 16);
      const hex = Array.from(slice)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join(' ')
        .padEnd(47, ' ');
      const ascii = Array.from(slice)
        .map((b) => (b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'))
        .join('');
      hexLines.push(`${offset.toString(16).padStart(4, '0')}  ${hex}  |${ascii}|`);
    }
    return {
      ok: true,
      kind: 'binary',
      name,
      relativePath: relPath,
      absolutePath: resolvedPath,
      size: st.size,
      language: ext ? ext.slice(1).toUpperCase() : 'BINARY',
      content: hexLines.join('\n'),
      lineCount: hexLines.length,
      truncated: rawBuf.length > 512,
      updatedAt,
    };
  }

  const maxTextBytes = 260_000;
  const truncated = rawBuf.length > maxTextBytes;
  const textContent = rawBuf.subarray(0, maxTextBytes).toString('utf8');
  const lineCount = textContent.split(/\r?\n/).length;
  const language =
    EXT_TO_LANG[ext] ??
    (name.toLowerCase() === 'dockerfile'
      ? 'DOCKERFILE'
      : name.toLowerCase().startsWith('.env')
        ? 'ENV'
        : ext
          ? ext.slice(1).toUpperCase()
          : 'TEXT');

  const kind: WorkspaceFileContent['kind'] =
    ext === '.md' || ext === '.mdx' || ext === '.markdown'
      ? 'markdown'
      : ext === '.csv' || ext === '.tsv'
        ? 'csv'
        : ext === '.json'
          ? 'json'
          : 'code';

  return {
    ok: true,
    kind,
    name,
    relativePath: relPath,
    absolutePath: resolvedPath,
    size: st.size,
    language,
    content: textContent,
    lineCount,
    truncated,
    highlightLine,
    updatedAt,
  };
}

/** Fast bounded file search inside `cwd` for the composer's @File attachment drawer. */
export function listWorkspaceFiles(cwd: string, query = '', limit = 60): WorkspaceFileEntry[] {
  if (!cwd || !existsSync(cwd)) return [];
  const q = query.trim().toLowerCase();
  const results: WorkspaceFileEntry[] = [];

  const walk = (dir: string, depth: number) => {
    if (depth > 4 || results.length >= limit * 3) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name.startsWith('.') && e.name !== '.env.example') continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (!IGNORED_DIRS.has(e.name)) walk(full, depth + 1);
      } else if (e.isFile()) {
        const rel = relative(cwd, full);
        if (!q || rel.toLowerCase().includes(q)) {
          let size = 0;
          try {
            size = statSync(full).size;
          } catch {
            /* ignore */
          }
          results.push({ path: full, relativePath: rel, size });
          if (results.length >= limit) return;
        }
      }
    }
  };

  walk(cwd, 0);
  return results.slice(0, limit);
}

/**
 * Build the CLI prompt payload combining user text, execution mode framing,
 * @file context attachments, /slash commands, and @subagents.
 */
export function composeCliPrompt(
  text: string,
  mode: ExecutionMode = 'agent',
  attachments?: PromptAttachments,
  gitSummary?: string,
): { cliPrompt: string; cliModeFlag?: 'plan' | 'ask' } {
  const sections: string[] = [];

  if (mode === 'debug') {
    sections.push(
      '[MODE: DEBUG — Inspect logs, stack traces, and relevant code first. Isolate the root cause with concrete evidence before applying a minimal, verified fix.]',
    );
  } else if (mode === 'multitask') {
    sections.push(
      '[MODE: MULTITASK — Decompose this request into independent parallel tracks, use specialized subagents (@explore, @debug, @shell) where helpful, and synthesize all results.]',
    );
  }

  if (attachments?.slashCommand) {
    sections.push(`[COMMAND: /${attachments.slashCommand.replace(/^\//, '')}]`);
  }
  if (attachments?.subagents && attachments.subagents.length > 0) {
    sections.push(`[SUBAGENTS: ${attachments.subagents.map((s) => (s.startsWith('@') ? s : `@${s}`)).join(' ')}]`);
  }
  if (attachments?.files && attachments.files.length > 0) {
    sections.push(`[ATTACHED FILES — focus on these paths first:\n${attachments.files.map((f) => `- @${f}`).join('\n')}\n]`);
  }
  if (attachments?.planContent) {
    sections.push(`[ATTACHED CURSOR PLAN (${attachments.planName ?? 'plan.md'}):\n${attachments.planContent.trim()}\n]`);
  }
  if (attachments?.includeGit && gitSummary) {
    sections.push(`[GIT WORKSPACE STATUS:\n${gitSummary.trim()}\n]`);
  }

  sections.push(text.trim());

  const cliModeFlag = mode === 'plan' ? 'plan' : mode === 'ask' ? 'ask' : undefined;
  return {
    cliPrompt: sections.join('\n\n'),
    cliModeFlag,
  };
}
