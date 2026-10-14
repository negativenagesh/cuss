import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { homedir, networkInterfaces } from 'node:os';
import { join } from 'node:path';

export interface BridgeConfig {
  port: number;
  pairingToken: string;
  apiKey: string | null;
}

const CONFIG_DIR = join(homedir(), '.config', 'mission-control');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

/** Load or create the bridge config. Never logs secret values. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  let stored: Partial<BridgeConfig> = {};
  if (existsSync(CONFIG_PATH)) {
    stored = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
  }
  let changed = false;
  if (!stored.pairingToken) {
    stored.pairingToken = randomBytes(24).toString('hex');
    changed = true;
  }
  if (!stored.port) {
    stored.port = 4040;
    changed = true;
  }
  if (changed) {
    mkdirSync(CONFIG_DIR, { recursive: true });
    writeFileSync(CONFIG_PATH, JSON.stringify(stored, null, 2));
    chmodSync(CONFIG_PATH, 0o600);
  }
  return {
    port: Number(env.PORT ?? stored.port ?? 4040),
    pairingToken: stored.pairingToken!,
    apiKey: env.CURSOR_API_KEY ?? (stored as any).apiKey ?? null,
  };
}

/** Constant-time token check. */
export function tokenOk(presented: string | undefined | null, expected: string): boolean {
  if (!presented) return false;
  const a = createHash('sha256').update(presented).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Best-guess LAN / Tailscale IPv4 addresses for the pairing printout. */
export function localAddresses(): string[] {
  const out: string[] = [];
  for (const infos of Object.values(networkInterfaces())) {
    for (const i of infos ?? []) {
      if (i.family === 'IPv4' && !i.internal) out.push(i.address);
    }
  }
  // Tailscale addresses (100.64.0.0/10) first — recommended route per SPEC.md §5.
  return out.sort((a, b) => Number(!a.startsWith('100.')) - Number(!b.startsWith('100.')));
}

export function pairingUrl(host: string, port: number, token: string): string {
  return `missioncontrol://pair?url=${encodeURIComponent(`http://${host}:${port}`)}&token=${token}`;
}
