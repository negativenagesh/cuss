import { detectLiveMacBridgeUrl, useStore } from '../store';

export type LiveMessage =
  | { type: 'hello'; ok: boolean }
  | { type: 'agents:update'; agents: any[] }
  | { type: 'run:event'; agentId: string; runId: string; event: string; data: string }
  | { type: 'run:final'; agentId: string; runId: string; run: any }
  | { type: 'local:update'; agents: any[] }
  | { type: 'local:event'; agentId: string; raw: any; at: string }
  | { type: 'mirror:frame'; frame: any }
  | { type: 'mirror:input:ack'; id?: number; ok: boolean; detail?: string }
  | { type: 'mirror:focus:info'; id?: number; focus: any };

const activeListeners = new Set<(msg: LiveMessage) => void>();

/**
 * Emit synthetic live events directly inside the mobile app when running in
 * Autonomous Direct Cloud mode (`https://api2.cursor.sh` while the Mac is shut down).
 */
export function emitLocalSyntheticMessage(msg: LiveMessage) {
  for (const fn of activeListeners) {
    try {
      fn(msg);
    } catch {
      /* ignore */
    }
  }
}

/** WebSocket to the bridge (LAN or Worldwide HTTPS Tunnel) with auto-reconnect (SPEC.md §4). */
export class LiveSocket {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private retry = 0;

  constructor(private onMessage: (msg: LiveMessage) => void, private onOpen?: () => void) {
    activeListeners.add(this.onMessage);
  }

  connect() {
    if (this.closedByUser) return;
    const state = useStore.getState();
    const bridgeUrl = state.bridgeUrl ?? state.tunnelUrl ?? detectLiveMacBridgeUrl();
    const token = state.token;
    if (!bridgeUrl || !token) return;
    try {
      const wsUrl = `${bridgeUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);
      this.ws.onopen = () => {
        this.retry = 0;
        this.onOpen?.();
      };
      this.ws.onmessage = (e) => {
        try {
          this.onMessage(JSON.parse(String(e.data)));
        } catch {
          /* ignore malformed */
        }
      };
      this.ws.onclose = () => {
        if (this.closedByUser) return;
        const delay = Math.min(1500 * 2 ** this.retry++, 15000);
        setTimeout(() => this.connect(), delay);
      };
      this.ws.onerror = () => {
        /* handled by onclose */
      };
    } catch {
      /* ignore when offline */
    }
  }

  isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        /* ignore */
      }
    }
  }

  close() {
    this.closedByUser = true;
    activeListeners.delete(this.onMessage);
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
  }
}
