import { ChildProcess, execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { localAddresses } from './config';

export interface TunnelStatus {
  tunnelUrl: string | null;
  lanUrl: string;
  tailscaleUrl: string | null;
  beaconTopic: string;
  caffeinateActive: boolean;
  updatedAt: string;
}

const CONFIG_DIR = join(homedir(), '.config', 'mission-control');
const TUNNEL_JSON_PATH = join(CONFIG_DIR, 'tunnel.json');
const CLI_AUTH_JSON_PATH = join(homedir(), '.cursor', 'auth.json');
const CLI_CONFIG_PATH = join(homedir(), '.cursor', 'cli-config.json');
const DESKTOP_STATE_DB_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  'Cursor',
  'User',
  'globalStorage',
  'state.vscdb',
);

let currentTunnelUrl: string | null = null;
let tunnelProc: ChildProcess | null = null;
let caffeinateProc: ChildProcess | null = null;
let activeBeaconTopic = '';
let activePort = 4040;
let activePairingToken = '';
let stopped = false;

export function getBeaconTopic(pairingToken: string): string {
  const hash = createHash('sha256')
    .update(`cuss-worldwide-umbilical-v1:${pairingToken}`)
    .digest('hex')
    .slice(0, 32);
  return `cuss-umbilical-${hash}`;
}

export function getTunnelStatus(port = activePort, pairingToken = activePairingToken): TunnelStatus {
  const addrs = localAddresses();
  const lanIp =
    addrs.find((a) => !a.startsWith('100.') && !a.startsWith('169.254.')) ||
    addrs[0] ||
    '127.0.0.1';
  const tailscaleIp = addrs.find((a) => a.startsWith('100.')) || null;
  const beaconTopic = pairingToken ? getBeaconTopic(pairingToken) : activeBeaconTopic;

  if (!currentTunnelUrl && existsSync(TUNNEL_JSON_PATH)) {
    try {
      const saved = JSON.parse(readFileSync(TUNNEL_JSON_PATH, 'utf8'));
      if (typeof saved?.tunnelUrl === 'string' && saved.tunnelUrl.startsWith('https://')) {
        currentTunnelUrl = saved.tunnelUrl;
      }
    } catch {
      /* ignore */
    }
  }

  return {
    tunnelUrl: currentTunnelUrl,
    lanUrl: `http://${lanIp}:${port}`,
    tailscaleUrl: tailscaleIp ? `http://${tailscaleIp}:${port}` : null,
    beaconTopic,
    caffeinateActive: Boolean(caffeinateProc && !caffeinateProc.killed),
    updatedAt: new Date().toISOString(),
  };
}

function saveTunnelSnapshot(status: TunnelStatus) {
  try {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(TUNNEL_JSON_PATH, JSON.stringify(status, null, 2), { mode: 0o600 });
    chmodSync(TUNNEL_JSON_PATH, 0o600);
  } catch {
    /* ignore */
  }
}

export async function publishRendezvousBeacon(
  port = activePort,
  pairingToken = activePairingToken,
): Promise<boolean> {
  if (!pairingToken) return false;
  const status = getTunnelStatus(port, pairingToken);
  saveTunnelSnapshot(status);
  if (!status.beaconTopic) return false;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const body = JSON.stringify({
      tunnelUrl: status.tunnelUrl,
      lanUrl: status.lanUrl,
      tailscaleUrl: status.tailscaleUrl,
      port,
      at: Date.now(),
    });
    const res = await fetch(`https://ntfy.sh/${status.beaconTopic}`, {
      method: 'POST',
      headers: {
        Title: 'CUSS Umbilical Beacon',
        Priority: 'low',
      },
      body,
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Prevent macOS sleep while the CUSS Bridge is running (supports lid-closed clamshell & background runs).
 */
export function startCaffeinateAwakeGuard() {
  if (process.platform !== 'darwin' || caffeinateProc) return;
  try {
    caffeinateProc = spawn('/usr/bin/caffeinate', ['-dimsu', '-w', String(process.pid)], {
      stdio: 'ignore',
      detached: false,
    });
    caffeinateProc.on('error', () => {
      caffeinateProc = null;
    });
    caffeinateProc.on('exit', () => {
      caffeinateProc = null;
    });
  } catch {
    caffeinateProc = null;
  }
}

function hasCommand(cmd: string): boolean {
  try {
    execFileSync('/usr/bin/which', [cmd], { stdio: 'ignore', timeout: 1500 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Start a persistent worldwide HTTPS + WebSocket tunnel to localhost:port (`cloudflared` or `localhost.run` via `/usr/bin/ssh`)
 * and publish the live endpoint to the deterministic rendezvous beacon so paired phones can connect from ANY network.
 */
export function startWorldwideTunnel(port: number, pairingToken: string) {
  activePort = port;
  activePairingToken = pairingToken;
  activeBeaconTopic = getBeaconTopic(pairingToken);
  stopped = false;

  startCaffeinateAwakeGuard();
  void publishRendezvousBeacon(port, pairingToken);

  const launch = () => {
    if (stopped) return;
    const useCloudflared = hasCommand('cloudflared');
    const cmd = useCloudflared ? 'cloudflared' : '/usr/bin/ssh';
    const args = useCloudflared
      ? ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`]
      : [
          '-o',
          'StrictHostKeyChecking=no',
          '-o',
          'UserKnownHostsFile=/dev/null',
          '-o',
          'ServerAliveInterval=25',
          '-o',
          'ServerAliveCountMax=3',
          '-o',
          'ExitOnForwardFailure=yes',
          '-T',
          '-R',
          `80:127.0.0.1:${port}`,
          'nokey@localhost.run',
        ];

    try {
      const child = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      tunnelProc = child;

      const onChunk = (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        const match =
          text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/i) ||
          text.match(/https:\/\/[a-zA-Z0-9-]+\.lhr\.life/i);
        if (match && match[0] && match[0] !== currentTunnelUrl) {
          currentTunnelUrl = match[0].trim();
          console.log(`\nWorldwide Umbilical Tunnel LIVE: ${currentTunnelUrl}`);
          void publishRendezvousBeacon(port, pairingToken);
        }
      };

      child.stdout?.on('data', onChunk);
      child.stderr?.on('data', onChunk);

      child.on('exit', () => {
        if (tunnelProc === child) tunnelProc = null;
        if (!stopped) {
          setTimeout(launch, 4000);
        }
      });
      child.on('error', () => {
        if (tunnelProc === child) tunnelProc = null;
        if (!stopped) {
          setTimeout(launch, 6000);
        }
      });
    } catch {
      if (!stopped) {
        setTimeout(launch, 6000);
      }
    }
  };

  launch();

  // Periodically republish beacon every 10 minutes so ntfy cache stays fresh
  const iv = setInterval(() => {
    if (stopped) {
      clearInterval(iv);
      return;
    }
    void publishRendezvousBeacon(port, pairingToken);
  }, 10 * 60 * 1000);
  iv.unref?.();
}

/**
 * Read the user's Cursor OAuth credentials (`accessToken`, `refreshToken`, `email`) from `~/.cursor/auth.json`
 * or Cursor Desktop's `state.vscdb` so the paired phone can also execute Direct Phone-to-Cursor (`api2.cursor.sh`)
 * calls even when the Mac is completely shut down!
 */
export function readCursorOAuthCredentials(): {
  accessToken?: string;
  refreshToken?: string;
  email?: string;
} {
  let accessToken = '';
  let refreshToken = '';
  let email = '';

  if (existsSync(CLI_AUTH_JSON_PATH)) {
    try {
      const j = JSON.parse(readFileSync(CLI_AUTH_JSON_PATH, 'utf8'));
      accessToken = String(j?.accessToken ?? '').trim();
      refreshToken = String(j?.refreshToken ?? '').trim();
    } catch {
      /* ignore */
    }
  }

  if (existsSync(CLI_CONFIG_PATH)) {
    try {
      const cfg = JSON.parse(readFileSync(CLI_CONFIG_PATH, 'utf8'));
      email = String(cfg?.authInfo?.email ?? '').trim();
    } catch {
      /* ignore */
    }
  }

  if ((!accessToken || !email) && existsSync(DESKTOP_STATE_DB_PATH)) {
    const queryKey = (k: string): string => {
      try {
        return execFileSync(
          '/usr/bin/sqlite3',
          ['-cmd', '.timeout 400', DESKTOP_STATE_DB_PATH, `SELECT value FROM ItemTable WHERE key = '${k}';`],
          { encoding: 'utf8', timeout: 1500 },
        ).trim();
      } catch {
        return '';
      }
    };
    if (!accessToken) accessToken = queryKey('cursorAuth/accessToken');
    if (!refreshToken) refreshToken = queryKey('cursorAuth/refreshToken');
    if (!email) email = queryKey('cursorAuth/cachedEmail');
  }

  return {
    accessToken: accessToken || undefined,
    refreshToken: refreshToken || undefined,
    email: email || undefined,
  };
}

/**
 * List Cloud Background Composers directly from `https://api2.cursor.sh/aiserver.v1.BackgroundComposerService/ListBackgroundComposers`
 * using the user's Cursor OAuth `accessToken` (no `CURSOR_API_KEY` required!).
 */
export async function listCloudBackgroundComposersViaOAuth(accessToken?: string): Promise<
  {
    id: string;
    name: string;
    status: string;
    url?: string;
    updatedAt?: string;
    cwd?: string;
    model?: string;
  }[]
> {
  const token = accessToken || readCursorOAuthCredentials().accessToken;
  if (!token) return [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(
      'https://api2.cursor.sh/aiserver.v1.BackgroundComposerService/ListBackgroundComposers',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Connect-Protocol-Version': '1',
        },
        body: JSON.stringify({
          n: 40,
          includeStatus: true,
          includeArchived: false,
        }),
        signal: ctrl.signal,
      },
    );
    clearTimeout(timer);
    if (!res.ok) return [];
    const data: any = await res.json();
    const composers = Array.isArray(data?.composers) ? data.composers : [];
    return composers.map((c: any) => {
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
    });
  } catch {
    return [];
  }
}
