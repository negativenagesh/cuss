import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  browseMacDirectories,
  composeCliPrompt,
  CursorIdeState,
  cwdToCursorProjectSlug,
  DirectoryBrowseResult,
  discoverLocalProjects,
  ExecutionMode,
  listWorkspaceFiles,
  ModelFamily,
  parseCliModelsOutput,
  parseCursorJsonlTranscript,
  ProjectEntry,
  PromptAttachments,
  readCursorIdeState,
  readWorkspaceFile,
  resolveCliModelSpec,
  WorkspaceFileContent,
  WorkspaceFileEntry,
} from './model-catalog';

/**
 * LocalConnector (SPEC.md §4 v2): drives the Cursor Agent CLI installed with
 * Cursor.app on this Mac. Uses the user's own Cursor login — no API key.
 * One prompt = one CLI process; follow-ups resume the same chatId.
 */

export interface LocalAgent {
  id: string; // CLI chatId
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

export interface RunEvent {
  agentId: string;
  raw: unknown; // parsed NDJSON line from the CLI or synthetic CUSS turn metadata
  at: string;
}

export interface PromptTurnOptions {
  mode?: ExecutionMode;
  model?: string;
  effort?: string;
  context?: string;
  fast?: boolean;
  thinking?: boolean;
  attachments?: PromptAttachments;
}

interface QueuedTurn {
  text: string;
  options?: PromptTurnOptions;
}

const CLI =
  process.env.CURSOR_CLI ?? '/Applications/Cursor.app/Contents/Resources/app/bin/cursor';
const REGISTRY_DIR = join(homedir(), '.config', 'mission-control');
const REGISTRY_PATH = join(REGISTRY_DIR, 'local-agents.json');
const DELETED_PATH = join(REGISTRY_DIR, 'deleted-agents.json');
const CLI_CONFIG_PATH = join(homedir(), '.cursor', 'cli-config.json');

const FULL_MAC_PATH = [
  join(homedir(), 'google-cloud-sdk', 'bin'),
  join(homedir(), '.local', 'node-v22.23.3-darwin-arm64', 'bin'),
  join(homedir(), '.local', 'bin'),
  '/opt/homebrew/bin',
  '/opt/homebrew/sbin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
  '/usr/sbin',
  '/sbin',
  process.env.PATH ?? '',
]
  .filter(Boolean)
  .join(':');

/** Metadata calls (`create-chat`, `--list-models`) never pop a browser. */
const CHILD_ENV = { ...process.env, PATH: FULL_MAC_PATH, TERM: 'dumb', NO_OPEN_BROWSER: '1' };
/** Agent runs have full Mac PATH (`gcloud`, `bq`, `brew`, `node`) and CAN open Mac browsers when needed. */
const RUN_ENV = { ...process.env, PATH: FULL_MAC_PATH, TERM: 'dumb' };
const EXEC_TIMEOUT_MS = 25_000;

function looksLikeLogin(text: string): boolean {
  return /not logged in|login required|please log in|cursor agent login/i.test(text);
}

export class LocalAgentService extends EventEmitter {
  private agents = new Map<string, LocalAgent>();
  private deletedIds = new Set<string>();
  private running = new Map<string, ChildProcess>();
  private queues = new Map<string, QueuedTurn[]>();
  private recentEvents = new Map<string, RunEvent[]>();
  private cachedModels: { at: number; families: ModelFamily[]; rawModels: { slug: string; label: string }[] } | null = null;
  private verifiedAccount: { email?: string; displayName?: string } = {};
  private loginProc: ChildProcess | null = null;
  private currentLoginUrl: string | undefined;
  private mirrorFrameSeq = 0;
  private warmChatIds = new Map<string, string>();
  private static readonly EVENT_BUFFER = 250;

  /**
   * Last N events of an agent, for replay when a phone opens the chat late.
   * If in-memory buffer is empty (e.g. after bridge restart or IDE-native session),
   * automatically hydrates from `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl`.
   */
  getRecentEvents(agentId: string): RunEvent[] {
    const mem = this.recentEvents.get(agentId);
    if (mem && mem.length > 0) return mem;
    const diskPath = this.findTranscriptJsonlPath(agentId);
    if (diskPath) {
      const parsed = parseCursorJsonlTranscript(agentId, diskPath);
      if (parsed.events.length > 0) {
        const sliced = parsed.events.slice(-LocalAgentService.EVENT_BUFFER);
        this.recentEvents.set(agentId, sliced);
        return sliced;
      }
    }
    return [];
  }

  private findTranscriptJsonlPath(agentId: string): string | undefined {
    const agent = this.agents.get(agentId);
    const projectsRoot = join(homedir(), '.cursor', 'projects');
    if (agent?.cwd) {
      const slug = cwdToCursorProjectSlug(agent.cwd);
      const p = join(projectsRoot, slug, 'agent-transcripts', agentId, `${agentId}.jsonl`);
      if (existsSync(p)) return p;
    }
    if (!existsSync(projectsRoot)) return undefined;
    try {
      for (const dir of readdirSync(projectsRoot)) {
        const candidate = join(projectsRoot, dir, 'agent-transcripts', agentId, `${agentId}.jsonl`);
        if (existsSync(candidate)) return candidate;
      }
    } catch {
      /* ignore */
    }
    return undefined;
  }

  private record(evt: RunEvent) {
    const list = this.recentEvents.get(evt.agentId) ?? [];
    const raw = evt.raw as any;

    // Ignore no-op thinking completion markers in the replay buffer so they don't split deltas
    if (raw?.type === 'thinking' && raw?.subtype === 'completed') {
      this.emit('event', evt);
      return;
    }

    const prev = list.length > 0 ? (list[list.length - 1].raw as any) : null;

    // Coalesce consecutive thinking deltas in the replay buffer so long chain-of-thought
    // never evicts earlier conversation turns, while still emitting live deltas to WS clients.
    if (
      raw?.type === 'thinking' &&
      raw?.subtype === 'delta' &&
      prev?.type === 'thinking' &&
      prev?.subtype === 'delta'
    ) {
      list[list.length - 1] = {
        agentId: evt.agentId,
        raw: { ...prev, text: String(prev.text ?? '') + String(raw.text ?? '') },
        at: evt.at,
      };
      this.recentEvents.set(evt.agentId, list);
      this.emit('event', evt);
      return;
    }

    // Coalesce streaming assistant deltas + final assistant message into one replay entry
    // while still emitting every live event to WS subscribers.
    if (raw?.type === 'assistant' && prev?.type === 'assistant' && Array.isArray(raw?.message?.content)) {
      const prevText = (prev?.message?.content ?? [])
        .filter((c: any) => c?.type === 'text')
        .map((c: any) => String(c.text ?? ''))
        .join('');
      const nextChunk = (raw?.message?.content ?? [])
        .filter((c: any) => c?.type === 'text')
        .map((c: any) => String(c.text ?? ''))
        .join('');
      const isDelta = typeof raw.timestamp_ms === 'number';
      const mergedText = isDelta ? prevText + nextChunk : nextChunk || prevText;
      list[list.length - 1] = {
        agentId: evt.agentId,
        raw: {
          ...raw,
          timestamp_ms: undefined,
          message: { role: 'assistant', content: [{ type: 'text', text: mergedText }] },
        },
        at: evt.at,
      };
      this.recentEvents.set(evt.agentId, list);
      this.emit('event', evt);
      return;
    }

    list.push(evt);
    if (list.length > LocalAgentService.EVENT_BUFFER) list.shift();
    this.recentEvents.set(evt.agentId, list);
    this.emit('event', evt);
  }

  constructor(
    private readonly cliPath: string = CLI,
    private readonly registryPath: string = REGISTRY_PATH,
  ) {
    super();
    this.load();
    // Warm verified account info and pre-allocate a chat ID for the active workspace on boot
    if (this.cliPath === CLI) {
      void this.getAuthStatus().catch(() => {});
      const topProj = this.listProjects()[0]?.path;
      if (topProj) this.replenishWarmChatId(topProj);
    }
  }

  private replenishWarmChatId(cwd: string) {
    if (this.cliPath !== CLI || !cwd || !existsSync(cwd) || this.warmChatIds.has(cwd)) return;
    this.exec([...this.cmd('create-chat')], cwd)
      .then((out) => {
        const id = out.trim().split(/\s+/).pop();
        if (id) this.warmChatIds.set(cwd, id);
      })
      .catch(() => {});
  }

  list(): LocalAgent[] {
    return [...this.agents.values()].sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
  }

  get(id: string): LocalAgent | undefined {
    return this.agents.get(id);
  }

  /** Rename a chat session (like Cursor's Rename Chat). */
  renameChat(id: string, name: string): LocalAgent {
    const agent = this.mustGet(id);
    const trimmed = name.trim().slice(0, 100);
    if (!trimmed) throw new Error('name cannot be empty');
    agent.name = trimmed;
    this.save();
    this.emit('changed', this.list());
    return agent;
  }

  /** Delete a chat session (stops active process, removes from registry, and remembers deletion). */
  deleteChat(id: string): { deleted: boolean; id: string } {
    const existed = this.agents.has(id);
    this.stop(id);
    this.agents.delete(id);
    this.queues.delete(id);
    this.recentEvents.delete(id);
    this.deletedIds.add(id);
    this.save();
    this.emit('changed', this.list());
    return { deleted: existed, id };
  }

  /** Read logged-in account metadata from ~/.cursor/cli-config.json or cached CLI status. */
  getAccountInfo(): { email?: string; displayName?: string } {
    if (this.verifiedAccount.email) {
      return this.verifiedAccount;
    }
    try {
      if (!existsSync(CLI_CONFIG_PATH)) return {};
      const cfg = JSON.parse(readFileSync(CLI_CONFIG_PATH, 'utf8'));
      if (cfg?.authInfo?.email) {
        this.verifiedAccount = {
          email: cfg.authInfo.email,
          displayName: cfg?.authInfo?.displayName,
        };
        return this.verifiedAccount;
      }
    } catch {
      /* ignore */
    }
    return {};
  }

  /**
   * Check live Cursor CLI authentication status (`~/.cursor/cli-config.json` + `cursor agent status`).
   */
  async getAuthStatus(): Promise<{
    loggedIn: boolean;
    email?: string;
    displayName?: string;
    loginInProgress: boolean;
    loginUrl?: string;
  }> {
    if (this.loginProc) {
      return {
        loggedIn: false,
        loginInProgress: true,
        loginUrl: this.currentLoginUrl,
      };
    }

    const info = this.getAccountInfo();
    if (info.email) {
      return {
        loggedIn: true,
        email: info.email,
        displayName: info.displayName,
        loginInProgress: false,
      };
    }

    // Fallback check via `cursor agent status`
    try {
      const out = await this.exec([...this.cmd('status')], homedir());
      const clean = out.replace(/\x1b\[[0-9;]*m/g, '');
      const m = /Logged in as\s+([^\s\r\n]+)/i.exec(clean);
      if (m) {
        const email = m[1].trim();
        this.verifiedAccount = { email };
        return {
          loggedIn: true,
          email,
          loginInProgress: false,
        };
      }
    } catch {
      /* not logged in */
    }
    return {
      loggedIn: false,
      loginInProgress: false,
    };
  }

  /**
   * Spawn `NO_OPEN_BROWSER=1 cursor agent login` in the background on the Mac,
   * capture the `https://cursor.com/loginDeepControl?...` OAuth URL within ~500ms,
   * and return it so the Android phone can open it in Chrome/Brave and complete sign-in!
   */
  async startMobileLogin(forceBrowser = false): Promise<{
    loggedIn: boolean;
    email?: string;
    displayName?: string;
    loginInProgress: boolean;
    loginUrl?: string;
  }> {
    const existing = this.getAccountInfo();
    if (!forceBrowser) {
      try {
        this.loginProc?.kill('SIGTERM');
      } catch {
        /* ignore */
      }
      this.loginProc = null;
      this.currentLoginUrl = undefined;
      if (existing.email) {
        return {
          loggedIn: true,
          email: existing.email,
          displayName: existing.displayName,
          loginInProgress: false,
        };
      }
    }

    if (this.loginProc && this.currentLoginUrl) {
      return {
        loggedIn: false,
        loginInProgress: true,
        loginUrl: this.currentLoginUrl,
      };
    }

    try {
      this.loginProc?.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.loginProc = null;
    this.currentLoginUrl = undefined;

    return await new Promise((resolve) => {
      const child = spawn(this.cliPath, ['agent', 'login'], {
        cwd: homedir(),
        env: { ...CHILD_ENV, NO_OPEN_BROWSER: '1', FORCE_COLOR: '0' },
      });
      this.loginProc = child;
      let buf = '';
      let resolved = false;

      const finishResolve = (payload: {
        loggedIn: boolean;
        email?: string;
        displayName?: string;
        loginInProgress: boolean;
        loginUrl?: string;
      }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(waitTimer);
        resolve(payload);
      };

      const checkChunk = (chunk: Buffer) => {
        buf += chunk.toString('utf8').replace(/\x1b\[[0-9;]*m/g, '');
        const urlMatch = /https:\/\/cursor\.com\/[^\s"'<>)\r\n]+/i.exec(buf);
        if (urlMatch) {
          this.currentLoginUrl = urlMatch[0].trim();
          finishResolve({
            loggedIn: false,
            loginInProgress: true,
            loginUrl: this.currentLoginUrl,
          });
        }
      };

      child.stdout.on('data', checkChunk);
      child.stderr.on('data', checkChunk);

      child.on('exit', () => {
        this.loginProc = null;
        this.currentLoginUrl = undefined;
        this.cachedModels = null;
        const after = this.getAccountInfo();
        finishResolve({
          loggedIn: Boolean(after.email),
          email: after.email,
          displayName: after.displayName,
          loginInProgress: false,
        });
      });

      child.on('error', () => {
        this.loginProc = null;
        this.currentLoginUrl = undefined;
        finishResolve({
          loggedIn: Boolean(existing.email),
          email: existing.email,
          displayName: existing.displayName,
          loginInProgress: false,
        });
      });

      const waitTimer = setTimeout(() => {
        finishResolve({
          loggedIn: Boolean(existing.email),
          email: existing.email,
          displayName: existing.displayName,
          loginInProgress: Boolean(this.loginProc),
          loginUrl: this.currentLoginUrl,
        });
      }, 4500);
    });
  }

  /**
   * Sign out of Cursor CLI on the Mac (`cursor agent logout`) and clear stored auth tokens.
   */
  async logoutCursor(): Promise<{ loggedOut: boolean }> {
    try {
      this.loginProc?.kill('SIGTERM');
    } catch {
      /* ignore */
    }
    this.loginProc = null;
    this.currentLoginUrl = undefined;
    this.cachedModels = null;
    this.verifiedAccount = {};
    try {
      await this.exec([...this.cmd('logout')], homedir());
    } catch {
      /* ignore if already logged out */
    }
    return { loggedOut: true };
  }

  /** Query `cursor agent --list-models` on the Mac (cached 5 min) + group into families with options. */
  async listModels(forceRefresh = false): Promise<{
    account: { email?: string; displayName?: string };
    families: ModelFamily[];
    rawModels: { slug: string; label: string }[];
  }> {
    const now = Date.now();
    if (!forceRefresh && this.cachedModels && now - this.cachedModels.at < 300_000) {
      return {
        account: this.getAccountInfo(),
        families: this.cachedModels.families,
        rawModels: this.cachedModels.rawModels,
      };
    }
    try {
      const out = await this.exec([...this.cmd('--list-models')], homedir());
      const parsed = parseCliModelsOutput(out);
      this.cachedModels = { at: now, ...parsed };
      return { account: this.getAccountInfo(), ...parsed };
    } catch {
      // Fallback to built-in catalog if CLI is busy or offline
      const parsed = parseCliModelsOutput('');
      return { account: this.getAccountInfo(), ...parsed };
    }
  }

  listProjects(): ProjectEntry[] {
    const extra = this.list().map((a) => a.cwd);
    return discoverLocalProjects(extra);
  }

  listFiles(cwd: string, query = '', limit = 60): WorkspaceFileEntry[] {
    return listWorkspaceFiles(cwd, query, limit);
  }

  readFileContent(cwd: string | undefined, filePath: string): WorkspaceFileContent {
    return readWorkspaceFile(cwd, filePath);
  }

  getIdeState(): CursorIdeState {
    return readCursorIdeState();
  }

  browseDirs(dirPath?: string): DirectoryBrowseResult {
    return browseMacDirectories(dirPath);
  }

  async getGitDiff(cwd: string): Promise<{
    branch?: string;
    branches: string[];
    changedFiles: { status: string; path: string }[];
    statSummary: string;
    diff: string;
  }> {
    if (!cwd || !existsSync(cwd)) {
      return { branches: [], changedFiles: [], statSummary: '', diff: '' };
    }
    const runGit = (args: string[]) =>
      new Promise<string>((resolve) => {
        const p = spawn('git', args, { cwd, env: RUN_ENV });
        let out = '';
        const t = setTimeout(() => {
          p.kill('SIGKILL');
          resolve(out);
        }, 4000);
        p.stdout.on('data', (d) => (out += d.toString('utf8')));
        p.on('error', () => {
          clearTimeout(t);
          resolve('');
        });
        p.on('exit', () => {
          clearTimeout(t);
          resolve(out);
        });
      });

    const [porcelain, statOut, diffOut, branchesOut] = await Promise.all([
      runGit(['status', '--porcelain', '-b']),
      runGit(['diff', 'HEAD', '--stat']),
      runGit(['diff', 'HEAD']),
      runGit(['branch', '--format=%(refname:short)']),
    ]);

    const lines = porcelain.split(/\r?\n/).filter(Boolean);
    let branch: string | undefined;
    const changedFiles: { status: string; path: string }[] = [];
    for (const ln of lines) {
      if (ln.startsWith('## ')) {
        branch = ln.slice(3).split('...')[0].trim();
      } else if (ln.length > 3) {
        changedFiles.push({
          status: ln.slice(0, 2).trim() || 'M',
          path: ln.slice(3).trim(),
        });
      }
    }

    const branches = branchesOut
      .split(/\r?\n/)
      .map((b) => b.trim())
      .filter(Boolean)
      .slice(0, 30);

    return {
      branch,
      branches,
      changedFiles: changedFiles.slice(0, 50),
      statSummary: statOut.trim().slice(0, 2000),
      diff: diffOut.slice(0, 14_000),
    };
  }

  /** Execute Git branch switch, branch creation, stage+commit, or push/pull in `cwd`. */
  async runGitAction(
    cwd: string,
    action: {
      type: 'checkout' | 'create-branch' | 'commit' | 'push' | 'pull';
      branch?: string;
      message?: string;
    },
  ): Promise<{ ok: boolean; output: string }> {
    if (!cwd || !existsSync(cwd)) throw new Error('Invalid workspace path');
    const execGit = (args: string[]) =>
      new Promise<{ code: number; out: string }>((resolve) => {
        const p = spawn('git', args, { cwd, env: RUN_ENV });
        let out = '';
        const t = setTimeout(() => {
          p.kill('SIGKILL');
          resolve({ code: 124, out: `${out}\nTimed out` });
        }, 15_000);
        p.stdout.on('data', (d) => (out += d.toString('utf8')));
        p.stderr.on('data', (d) => (out += d.toString('utf8')));
        p.on('error', (e) => {
          clearTimeout(t);
          resolve({ code: 1, out: String(e) });
        });
        p.on('exit', (code) => {
          clearTimeout(t);
          resolve({ code: code ?? 1, out: out.trim() });
        });
      });

    if (action.type === 'checkout' && action.branch?.trim()) {
      const r = await execGit(['checkout', action.branch.trim()]);
      return { ok: r.code === 0, output: r.out };
    }
    if (action.type === 'create-branch' && action.branch?.trim()) {
      const r = await execGit(['checkout', '-b', action.branch.trim()]);
      return { ok: r.code === 0, output: r.out };
    }
    if (action.type === 'commit' && action.message?.trim()) {
      await execGit(['add', '-A']);
      const r = await execGit(['commit', '-m', action.message.trim()]);
      return { ok: r.code === 0, output: r.out };
    }
    if (action.type === 'push') {
      const r = await execGit(['push']);
      return { ok: r.code === 0, output: r.out };
    }
    if (action.type === 'pull') {
      const r = await execGit(['pull']);
      return { ok: r.code === 0, output: r.out };
    }
    throw new Error('Unsupported git action');
  }

  /** Run an interactive shell command in `cwd` (e.g. `gcloud auth login --no-launch-browser`, `bq ls`) and extract any URLs. */
  async runShellCommand(
    cwd: string,
    command: string,
  ): Promise<{ exitCode: number; output: string; urls: string[] }> {
    const targetCwd = cwd && existsSync(cwd) ? cwd : homedir();
    return new Promise((resolve) => {
      const p = spawn('/bin/zsh', ['-c', command], { cwd: targetCwd, env: RUN_ENV });
      let out = '';
      const t = setTimeout(() => {
        p.kill('SIGTERM');
        const urls = [...new Set(out.match(/https?:\/\/[^\s"'<>)+]+/g) ?? [])];
        resolve({ exitCode: 0, output: out.trim().slice(0, 8000), urls });
      }, 14_000);
      p.stdout.on('data', (d) => (out += d.toString('utf8')));
      p.stderr.on('data', (d) => (out += d.toString('utf8')));
      p.on('error', (e) => {
        clearTimeout(t);
        resolve({ exitCode: 1, output: String(e), urls: [] });
      });
      p.on('exit', (code) => {
        clearTimeout(t);
        const urls = [...new Set(out.match(/https?:\/\/[^\s"'<>)+]+/g) ?? [])];
        resolve({ exitCode: code ?? 0, output: out.trim().slice(0, 8000), urls });
      });
    });
  }

  /** Open a URL in the Mac's default browser (`open <url>`). */
  async openUrlOnMac(url: string): Promise<{ opened: boolean }> {
    if (!/^https?:\/\//i.test(url.trim())) throw new Error('URL must start with http:// or https://');
    await new Promise<void>((resolve, reject) => {
      const p = spawn('open', [url.trim()], { env: RUN_ENV });
      p.on('error', reject);
      p.on('exit', () => resolve());
    });
    return { opened: true };
  }

  /**
   * Capture a live REA-inspired Mirror Frame (`4427.index.js` Repaint-Debug + macOS Display + Browser + Process Tree):
   * - Compressed JPEG display frame (~60KB, with cursor `-C`)
   * - Frontmost macOS application & active window title
   * - Active browser tab URL & title (Chrome / Brave / Safari)
   * - Live terminal/event buffer lines + running Cursor/shell child processes
   */
  async captureMacScreen(agentId?: string): Promise<{
    ok: boolean;
    seq: number;
    frontApp: string;
    windowTitle?: string;
    browserUrl?: string;
    browserTitle?: string;
    activeProcesses: string[];
    terminalLines: string[];
    imageBase64?: string;
    capturedAt: string;
    hint?: string;
  }> {
    const seq = ++this.mirrorFrameSeq;
    const imgPath = '/tmp/cuss-mac-peek.jpg';

    const metaScript = `
tell application "System Events"
  set frontProc to first process whose frontmost is true
  set appName to name of frontProc
  set winTitle to ""
  try
    set winTitle to name of front window of frontProc
  end try
end tell
set bUrl to ""
set bTitle to ""
try
  if appName is "Google Chrome" then
    tell application "Google Chrome"
      set bUrl to URL of active tab of front window
      set bTitle to title of active tab of front window
    end tell
  else if appName is "Brave Browser" then
    tell application "Brave Browser"
      set bUrl to URL of active tab of front window
      set bTitle to title of active tab of front window
    end tell
  else if appName is "Safari" then
    tell application "Safari"
      set bUrl to URL of current tab of front window
      set bTitle to name of current tab of front window
    end tell
  end if
end try
return appName & "|||" & winTitle & "|||" & bUrl & "|||" & bTitle
`;

    const [metaRaw, psRaw, capCode] = await Promise.all([
      this.execOsascript(metaScript).catch(() => 'macOS Desktop||||||'),
      new Promise<string>((resolve) => {
        const p = spawn('/bin/ps', ['-Ao', 'pid,comm,args'], { env: RUN_ENV });
        let out = '';
        p.stdout.on('data', (d) => (out += d.toString('utf8')));
        p.on('error', () => resolve(''));
        p.on('exit', () => resolve(out));
      }),
      new Promise<number>((resolve) => {
        const p = spawn(
          '/bin/zsh',
          [
            '-c',
            '/usr/sbin/screencapture -x -C -t jpg /tmp/cuss-mac-peek.jpg && /usr/bin/sips -Z 920 -s formatOptions 55 /tmp/cuss-mac-peek.jpg >/dev/null 2>&1',
          ],
          { env: RUN_ENV },
        );
        p.on('error', () => resolve(1));
        p.on('exit', (c) => resolve(c ?? 1));
      }),
    ]);

    const [frontAppRaw, winTitleRaw, bUrlRaw, bTitleRaw] = metaRaw.trim().split('|||');
    const frontApp = (frontAppRaw || 'macOS Desktop').trim();
    const windowTitle = (winTitleRaw || '').trim() || undefined;
    const browserUrl = (bUrlRaw || '').trim() || undefined;
    const browserTitle = (bTitleRaw || '').trim() || undefined;

    const activeProcesses = psRaw
      .split(/\r?\n/)
      .filter((ln) => /cursor-agent|gcloud|bq |git |python|pytest|vitest/i.test(ln) && !/grep/i.test(ln))
      .map((ln) => ln.trim().replace(/\s+/g, ' ').slice(0, 110))
      .slice(0, 8);

    // Build live 24-line terminal grid snapshot (inspired by REA 4427.index.js getSnapshot().lines)
    const targetId = agentId || [...this.running.keys()][0] || this.list()[0]?.id;
    const evts = targetId ? this.getRecentEvents(targetId).slice(-14) : [];
    const terminalLines: string[] = [];
    for (const ev of evts) {
      const r = ev.raw as any;
      if (r?.type === 'cuss_user_turn') {
        terminalLines.push(`$ [USER] ${String(r.text ?? '').replace(/\s+/g, ' ').slice(0, 88)}`);
      } else if (r?.type === 'thinking' && r?.text) {
        terminalLines.push(`~ [THINK] ${String(r.text).replace(/\s+/g, ' ').slice(-88)}`);
      } else if (r?.type === 'tool_call') {
        const tn = Object.keys(r.tool_call ?? {})[0] ?? 'tool';
        const args = r.tool_call?.[tn]?.args ?? {};
        const sum = args.command ?? args.path ?? args.file_path ?? tn;
        terminalLines.push(`> [${tn.replace(/ToolCall$/i, '').toUpperCase()}] ${String(sum).slice(0, 80)}`);
        const out =
          r.tool_call?.[tn]?.result?.success?.interleavedOutput ??
          r.tool_call?.[tn]?.result?.success?.stdout;
        if (out) {
          for (const ln of String(out).trim().split(/\r?\n/).slice(-4)) {
            terminalLines.push(`  ${ln.slice(0, 92)}`);
          }
        }
      } else if (r?.type === 'assistant') {
        const txt = (r.message?.content ?? [])
          .filter((c: any) => c?.type === 'text')
          .map((c: any) => String(c.text ?? ''))
          .join(' ');
        if (txt.trim()) {
          terminalLines.push(`* [ASSISTANT] ${txt.trim().replace(/\s+/g, ' ').slice(-88)}`);
        }
      }
    }

    if (capCode === 0 && existsSync(imgPath)) {
      const b64 = readFileSync(imgPath).toString('base64');
      return {
        ok: true,
        seq,
        frontApp,
        windowTitle,
        browserUrl,
        browserTitle,
        activeProcesses,
        terminalLines: terminalLines.slice(-20),
        imageBase64: `data:image/jpeg;base64,${b64}`,
        capturedAt: new Date().toISOString(),
      };
    }

    return {
      ok: false,
      seq,
      frontApp,
      windowTitle,
      browserUrl,
      browserTitle,
      activeProcesses,
      terminalLines: terminalLines.slice(-20),
      capturedAt: new Date().toISOString(),
      hint: 'Grant Screen Recording permission to Terminal / node in macOS System Settings -> Privacy & Security -> Screen Recording to view the live Mac screen.',
    };
  }

  /**
   * Perform a remote control action on the Mac from the Live Mirror view:
   * - `focus-app`: Activate Cursor, Terminal, Google Chrome, or Brave Browser on the Mac
   * - `send-key`: Send Enter, Escape, Space, or Cmd+R to the frontmost Mac window
   */
  async performMacAction(action: {
    type: 'focus-app' | 'send-key';
    target: string;
  }): Promise<{ ok: boolean }> {
    if (action.type === 'focus-app' && action.target) {
      await this.execOsascript(`tell application ${JSON.stringify(action.target)} to activate`).catch(
        () => {},
      );
      return { ok: true };
    }
    if (action.type === 'send-key') {
      const keyMap: Record<string, string> = {
        enter: 'key code 36',
        escape: 'key code 53',
        space: 'key code 49',
        reload: 'keystroke "r" using command down',
      };
      const cmd = keyMap[action.target.toLowerCase()];
      if (cmd) {
        await this.execOsascript(`tell application "System Events" to ${cmd}`).catch(() => {});
      }
      return { ok: true };
    }
    return { ok: false };
  }

  /** Transcribe base64 recorded audio from the mobile voice mic via macOS SFSpeechRecognizer. */
  async transcribeAudio(base64Audio: string, ext = 'm4a'): Promise<{ text: string }> {
    const rawPath = `/tmp/cuss-voice-in.${ext.replace(/[^a-z0-9]/gi, '') || 'm4a'}`;
    const wavPath = '/tmp/cuss-voice-16k.wav';
    const cleanB64 = base64Audio.replace(/^data:audio\/[^;]+;base64,/, '');
    writeFileSync(rawPath, Buffer.from(cleanB64, 'base64'));

    await new Promise<void>((resolve) => {
      const p = spawn('/opt/homebrew/bin/ffmpeg', ['-y', '-i', rawPath, '-ar', '16000', '-ac', '1', wavPath], {
        env: RUN_ENV,
      });
      p.on('error', () => resolve());
      p.on('exit', () => resolve());
    });

    const targetAudio = existsSync(wavPath) ? wavPath : rawPath;
    const swiftCode = `
import Foundation
import Speech

let sema = DispatchSemaphore(value: 0)
var output = ""
SFSpeechRecognizer.requestAuthorization { status in
    guard status == .authorized, let rec = SFSpeechRecognizer(locale: Locale(identifier: "en-US")), rec.isAvailable else {
        sema.signal()
        return
    }
    let req = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: "${targetAudio}"))
    rec.recognitionTask(with: req) { result, error in
        if let r = result {
            output = r.bestTranscription.formattedString
            if r.isFinal { sema.signal() }
        } else if error != nil {
            sema.signal()
        }
    }
}
_ = sema.wait(timeout: .now() + 12)
print(output)
`;
    const text = await new Promise<string>((resolve) => {
      const p = spawn('/usr/bin/swift', ['-e', swiftCode], { env: RUN_ENV });
      let out = '';
      const timer = setTimeout(() => {
        p.kill('SIGKILL');
        resolve(out.trim());
      }, 15_000);
      p.stdout.on('data', (d) => (out += d.toString('utf8')));
      p.on('error', () => {
        clearTimeout(timer);
        resolve('');
      });
      p.on('exit', () => {
        clearTimeout(timer);
        resolve(out.trim());
      });
    });

    return { text };
  }

  /**
   * Sync recent native `.jsonl` transcripts from `~/.cursor/projects/<slug>/agent-transcripts/`
   * for active Cursor workspaces so chats started in the Mac IDE also appear on the phone!
   */
  syncIdeTranscripts(maxPerWorkspace = 3): LocalAgent[] {
    const projectsRoot = join(homedir(), '.cursor', 'projects');
    if (!existsSync(projectsRoot)) return this.list();
    const knownProjects = this.listProjects().slice(0, 6);
    let added = false;

    for (const proj of knownProjects) {
      const slug = cwdToCursorProjectSlug(proj.path);
      const transDir = join(projectsRoot, slug, 'agent-transcripts');
      if (!existsSync(transDir)) continue;
      try {
        const dirs = readdirSync(transDir)
          .map((id) => {
            const jsonl = join(transDir, id, `${id}.jsonl`);
            if (!existsSync(jsonl)) return null;
            const st = statSync(jsonl);
            return { id, jsonl, mtime: st.mtimeMs, iso: st.mtime.toISOString() };
          })
          .filter((x): x is { id: string; jsonl: string; mtime: number; iso: string } => Boolean(x))
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, maxPerWorkspace);

        for (const item of dirs) {
          if (this.agents.has(item.id) || this.deletedIds.has(item.id)) continue;
          const parsed = parseCursorJsonlTranscript(item.id, item.jsonl);
          if (!parsed.firstPrompt) continue;
          this.agents.set(item.id, {
            id: item.id,
            name: parsed.firstPrompt.split(/\s+/).slice(0, 8).join(' ').slice(0, 80),
            cwd: proj.path,
            mode: 'agent',
            createdAt: item.iso,
            lastStatus: 'done',
            lastActivityAt: item.iso,
          });
          added = true;
        }
      } catch {
        /* ignore */
      }
    }
    if (added) this.save();
    return this.list();
  }

  /** cursor agent create-chat -> chatId (uses pre-warmed ID in <1ms when available!) */
  async createChat(
    cwd: string,
    firstPrompt: string,
    modelOrOptions?: string | PromptTurnOptions,
  ): Promise<LocalAgent> {
    let id = this.warmChatIds.get(cwd);
    if (id) {
      this.warmChatIds.delete(cwd);
    } else {
      id = (await this.exec([...this.cmd('create-chat')], cwd)).trim().split(/\s+/).pop()!;
    }
    if (!id) throw new Error('create-chat returned no id');
    // Replenish a warm chat ID for the next spawn in the background
    this.replenishWarmChatId(cwd);

    const opts: PromptTurnOptions =
      typeof modelOrOptions === 'string' ? { model: modelOrOptions } : modelOrOptions ?? {};
    const resolvedSpec = resolveCliModelSpec(
      {
        model: opts.model,
        effort: opts.effort,
        context: opts.context,
        fast: opts.fast,
        thinking: opts.thinking,
      },
      this.cachedModels?.families,
    );

    const agent: LocalAgent = {
      id,
      name: firstPrompt.split(/\s+/).slice(0, 8).join(' ').slice(0, 80),
      cwd,
      model: opts.model ?? resolvedSpec,
      modelSpec: resolvedSpec,
      mode: opts.mode ?? 'agent',
      effort: opts.effort,
      contextWindow: opts.context,
      fast: opts.fast,
      thinking: opts.thinking,
      createdAt: new Date().toISOString(),
      lastStatus: 'idle',
      lastActivityAt: new Date().toISOString(),
    };
    this.deletedIds.delete(id);
    this.agents.set(id, agent);
    this.save();
    this.emit('changed', this.list());
    return agent;
  }

  /** Queue a prompt; starts immediately if the chat is idle. */
  prompt(agentId: string, text: string, options?: PromptTurnOptions): { queued: boolean } {
    const agent = this.mustGet(agentId);
    if (options?.mode) agent.mode = options.mode;
    if (options?.model !== undefined) agent.model = options.model;
    if (options?.effort !== undefined) agent.effort = options.effort;
    if (options?.context !== undefined) agent.contextWindow = options.context;
    if (options?.fast !== undefined) agent.fast = options.fast;
    if (options?.thinking !== undefined) agent.thinking = options.thinking;

    const spec = resolveCliModelSpec(
      {
        model: agent.model,
        effort: agent.effort,
        context: agent.contextWindow,
        fast: agent.fast,
        thinking: agent.thinking,
      },
      this.cachedModels?.families,
    );
    if (spec !== undefined || agent.model === 'auto') {
      agent.modelSpec = spec;
    }

    if (this.running.has(agentId)) {
      const q = this.queues.get(agentId) ?? [];
      q.push({ text, options });
      this.queues.set(agentId, q);
      this.touch(agent, 'queued');
      return { queued: true };
    }
    this.startRun(agent, text, options);
    return { queued: false };
  }

  stop(agentId: string): boolean {
    const p = this.running.get(agentId);
    if (!p) return false;
    p.kill('SIGTERM');
    return true;
  }

  /** Open a visible Terminal window on the Mac attached to this chat session. */
  async showOnMac(agentId: string): Promise<void> {
    const agent = this.mustGet(agentId);
    const command = `${this.cliPath} agent --resume ${agent.id}`;
    const script = `tell application "Terminal" to do script ${JSON.stringify(command)}\ntell application "Terminal" to activate`;
    await this.execOsascript(script);
  }

  private execOsascript(script: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const p = spawn('osascript', ['-e', script], { env: CHILD_ENV });
      let out = '';
      let err = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (err += d));
      p.on('error', reject);
      p.on('exit', (code) => (code === 0 ? resolve(out) : reject(new Error(`osascript exit ${code}: ${err}`))));
    });
  }

  private readQuickGitSummary(cwd: string): string | undefined {
    try {
      const headPath = join(cwd, '.git', 'HEAD');
      if (!existsSync(headPath)) return undefined;
      return `HEAD: ${readFileSync(headPath, 'utf8').trim()}`;
    } catch {
      return undefined;
    }
  }

  private startRun(agent: LocalAgent, text: string, options?: PromptTurnOptions) {
    const effectiveMode: ExecutionMode = options?.mode ?? agent.mode ?? 'agent';
    const effectiveSpec = agent.modelSpec ?? agent.model;
    const gitSummary = options?.attachments?.includeGit ? this.readQuickGitSummary(agent.cwd) : undefined;
    const { cliPrompt, cliModeFlag } = composeCliPrompt(text, effectiveMode, options?.attachments, gitSummary);

    // Record user turn metadata in the stream so the mobile chat renders mode/model/attachment pills
    this.record({
      agentId: agent.id,
      raw: {
        type: 'cuss_user_turn',
        text,
        mode: effectiveMode,
        model: agent.model ?? 'auto',
        modelSpec: effectiveSpec ?? 'auto',
        effort: agent.effort,
        contextWindow: agent.contextWindow,
        fast: agent.fast,
        thinking: agent.thinking,
        attachments: options?.attachments,
      },
      at: new Date().toISOString(),
    });

    const useSandbox = options?.attachments?.sandbox === true;
    const useWorktree = options?.attachments?.worktree === true;
    const args = [
      ...this.cmd(),
      '--print',
      '--output-format', 'stream-json',
      '--stream-partial-output',
      '--trust',
      ...(useSandbox ? ['--sandbox', 'enabled'] : ['--force', '--sandbox', 'disabled', '--approve-mcps']),
      ...(useWorktree ? ['--worktree'] : []),
      '--resume', agent.id,
      ...(cliModeFlag ? ['--mode', cliModeFlag] : []),
      ...(effectiveSpec ? ['--model', effectiveSpec] : []),
      cliPrompt,
    ];
    const child = spawn(this.cliPath, args, {
      cwd: agent.cwd,
      env: RUN_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    this.running.set(agent.id, child);
    this.touch(agent, 'running');

    let buf = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buf += chunk.toString('utf8');
      let idx: number;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).trim();
        buf = buf.slice(idx + 1);
        if (!line) continue;
        let parsed: any = line;
        try {
          parsed = JSON.parse(line);
        } catch {
          /* non-JSON line: forward as text */
        }
        if (parsed && typeof parsed === 'object' && parsed.type === 'result') {
          if (parsed.usage) {
            agent.usage = {
              inputTokens: Number(parsed.usage.inputTokens ?? 0),
              outputTokens: Number(parsed.usage.outputTokens ?? 0),
              cacheReadTokens: Number(parsed.usage.cacheReadTokens ?? 0),
            };
            this.save();
          }
          // Ensure CLI process exits promptly once final result JSON is emitted
          setTimeout(() => {
            try {
              if (this.running.get(agent.id) === child) child.kill('SIGTERM');
            } catch {
              /* ignore */
            }
          }, 500);
        }
        const evt: RunEvent = { agentId: agent.id, raw: parsed, at: new Date().toISOString() };
        this.record(evt);
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      this.record({ agentId: agent.id, raw: { type: 'stderr', text: chunk.toString('utf8') }, at: new Date().toISOString() } satisfies RunEvent);
    });
    child.on('error', (err) => {
      this.running.delete(agent.id);
      this.touch(agent, 'error');
      this.record({ agentId: agent.id, raw: { type: 'error', text: String(err) }, at: new Date().toISOString() } satisfies RunEvent);
    });
    child.on('exit', (code) => {
      this.running.delete(agent.id);
      this.touch(agent, code === 0 ? 'done' : 'error');
      this.record({ agentId: agent.id, raw: { type: 'exit', code }, at: new Date().toISOString() } satisfies RunEvent);
      const q = this.queues.get(agent.id);
      const next = q?.shift();
      if (next) this.startRun(agent, next.text, next.options);
      else this.queues.delete(agent.id);
    });
  }

  private cmd(...sub: string[]): string[] {
    return ['agent', ...sub];
  }

  private exec(args: string[], cwd: string): Promise<string> {
    const singleLineCmd =
      args.includes('create-chat') || args.includes('status') || args.includes('whoami');
    return new Promise((resolve, reject) => {
      let settled = false;
      const p = spawn(this.cliPath, args, {
        cwd,
        env: CHILD_ENV,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let out = '';
      let err = '';
      const finishOk = (val: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          p.kill('SIGTERM');
        } catch {
          /* ignore */
        }
        resolve(val);
      };
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        p.kill('SIGKILL');
        if (out.trim().length > 0 && !looksLikeLogin(`${err}\n${out}`)) {
          resolve(out);
          return;
        }
        reject(
          Object.assign(
            new Error(
              'Cursor CLI timed out on Mac. Please retry.',
            ),
            { code: looksLikeLogin(`${err}\n${out}`) ? 'cli_login_required' : 'cli_timeout' },
          ),
        );
      }, EXEC_TIMEOUT_MS);
      p.stdout.on('data', (d) => {
        out += d.toString('utf8');
        // create-chat, status, and whoami emit a single line and may keep background sockets open; resolve immediately!
        if (singleLineCmd && out.includes('\n') && out.trim().length > 0) {
          finishOk(out);
        }
      });
      p.stderr.on('data', (d) => (err += d.toString('utf8')));
      p.on('error', (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(e);
      });
      p.on('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        const text = `${err}\n${out}`;
        if (code === 0 || (out.trim().length > 0 && !looksLikeLogin(text))) return resolve(out);
        if (looksLikeLogin(text)) {
          return reject(
            Object.assign(new Error('Cursor CLI is not logged in. Run `cursor agent login` once on this Mac.'), {
              code: 'cli_login_required',
            }),
          );
        }
        reject(new Error(`exit ${code}: ${text.trim()}`));
      });
    });
  }

  private mustGet(id: string): LocalAgent {
    const a = this.agents.get(id);
    if (!a) throw Object.assign(new Error(`unknown local agent ${id}`), { code: 'not_found' });
    return a;
  }

  private touch(agent: LocalAgent, status: LocalAgent['lastStatus']) {
    agent.lastStatus = status;
    agent.lastActivityAt = new Date().toISOString();
    this.save();
    this.emit('changed', this.list());
  }

  private get deletedPath(): string {
    return `${this.registryPath}.deleted.json`;
  }

  private load() {
    try {
      if (existsSync(this.deletedPath)) {
        for (const id of JSON.parse(readFileSync(this.deletedPath, 'utf8')) as string[]) {
          this.deletedIds.add(id);
        }
      }
    } catch {
      /* ignore */
    }
    try {
      if (existsSync(this.registryPath)) {
        for (const a of JSON.parse(readFileSync(this.registryPath, 'utf8')) as LocalAgent[]) {
          if (this.deletedIds.has(a.id)) continue;
          if (a.lastStatus === 'running' || a.lastStatus === 'queued') a.lastStatus = 'idle';
          this.agents.set(a.id, a);
        }
      }
    } catch {
      /* corrupt registry: start empty */
    }
  }

  private save() {
    mkdirSync(REGISTRY_DIR, { recursive: true });
    writeFileSync(this.registryPath, JSON.stringify(this.list(), null, 2));
    writeFileSync(this.deletedPath, JSON.stringify([...this.deletedIds], null, 2));
  }
}
