import { Inject } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, WebSocket } from 'ws';
import { CursorApi } from './cursor-api';
import { LocalAgentService, RunEvent } from './local-agent';
import { tokenOk } from './config';

/**
 * Live channel for the phone app (SPEC.md §4 WebSocket).
 * Protocol (JSON, our own — NOT Nest's {event,data} shape):
 *   {type:'agents:watch'}      -> {type:'agents:update', agents}
 *   {type:'run:subscribe'|'run:unsubscribe', agentId, runId}
 *   {type:'local:watch'}       -> {type:'local:update', agents}
 *   {type:'local:subscribe'|'local:unsubscribe', agentId} -> {type:'local:event', agentId, raw, at}
 */
@WebSocketGateway({ path: '/ws' })
export class LiveGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;

  private watchers = new Map<WebSocket, NodeJS.Timeout>();
  private runAbort = new Map<WebSocket, AbortController>();
  private localWatchers = new Set<WebSocket>();
  private localSubs = new Map<WebSocket, string>();
  private lastListJson: string | null = null;

  constructor(
    @Inject(CursorApi) private readonly api: CursorApi | null,
    @Inject('PAIRING_TOKEN') private readonly pairingToken: string,
    @Inject(LocalAgentService) private readonly local: LocalAgentService,
  ) {
    this.local.on('changed', (agents) => {
      for (const client of this.localWatchers) this.send(client, { type: 'local:update', agents });
    });
    this.local.on('event', (evt: RunEvent) => {
      for (const [client, agentId] of this.localSubs) {
        if (agentId === evt.agentId) this.send(client, { type: 'local:event', ...evt });
      }
    });
  }

  handleConnection(client: WebSocket, req: { url?: string; headers: Record<string, string | string[] | undefined> }) {
    const url = new URL(req.url ?? '/ws', 'http://localhost');
    const queryToken = url.searchParams.get('token');
    const auth = req.headers['authorization'];
    const headerToken = Array.isArray(auth) ? auth[0] : auth;
    const presented = queryToken ?? (headerToken?.startsWith('Bearer ') ? headerToken.slice(7) : undefined);
    if (!tokenOk(presented, this.pairingToken)) {
      client.close(4401, 'unauthorized');
      return;
    }
    this.send(client, { type: 'hello', ok: true });
    client.on('message', (raw: Buffer) => this.route(client, raw));
  }

  handleDisconnect(client: WebSocket) {
    this.stopWatching(client);
    this.stopRun(client);
    this.localWatchers.delete(client);
    this.localSubs.delete(client);
  }

  private route(client: WebSocket, raw: Buffer) {
    let msg: any;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    switch (msg?.type) {
      case 'agents:watch':
        return this.watchAgents(client);
      case 'run:subscribe':
        return void this.subscribeRun(client, msg);
      case 'run:unsubscribe':
        return this.stopRun(client);
      case 'local:watch':
        return this.watchLocal(client);
      case 'local:subscribe':
        return this.subscribeLocal(client, msg);
      case 'local:unsubscribe':
        return void this.localSubs.delete(client);
    }
  }

  private watchAgents(client: WebSocket) {
    this.stopWatching(client);
    if (!this.api) return;
    const tick = async () => {
      try {
        const page = await this.api!.listAgents(100);
        const json = JSON.stringify(page.items);
        if (json !== this.lastListJson) {
          this.lastListJson = json;
          this.send(client, { type: 'agents:update', agents: page.items });
        }
      } catch {
        /* transient upstream error: retry next tick */
      }
    };
    void tick();
    this.watchers.set(client, setInterval(tick, 5000));
  }

  private async subscribeRun(client: WebSocket, msg: { agentId?: string; runId?: string }) {
    this.stopRun(client);
    if (!this.api || !msg.agentId || !msg.runId) return;
    const ac = new AbortController();
    this.runAbort.set(client, ac);
    let lastEventId: string | undefined;
    // Auto-resume loop per SPEC.md §2 (Last-Event-ID, 410 -> final fetch).
    for (;;) {
      if (ac.signal.aborted) return;
      try {
        const outcome = await this.api.streamRun(msg.agentId, msg.runId, {
          signal: ac.signal,
          lastEventId,
          onEvent: (event, data, id) => {
            if (id) lastEventId = id;
            this.send(client, { type: 'run:event', agentId: msg.agentId, runId: msg.runId, event, data });
          },
        });
        if (outcome === 'expired') {
          const run = await this.api.getRun(msg.agentId, msg.runId);
          this.send(client, { type: 'run:final', agentId: msg.agentId, runId: msg.runId, run });
        }
        return;
      } catch (e) {
        if (ac.signal.aborted) return;
        await new Promise((r) => setTimeout(r, 2000)); // backoff, then resume from lastEventId
      }
    }
  }

  private watchLocal(client: WebSocket) {
    this.localWatchers.add(client);
    this.send(client, { type: 'local:update', agents: this.local.list() });
  }

  private subscribeLocal(client: WebSocket, msg: { agentId?: string }) {
    if (!msg.agentId || !this.local.get(msg.agentId)) return;
    this.localSubs.set(client, msg.agentId);
    // Replay recent events so a phone opening the chat late sees the full story.
    for (const evt of this.local.getRecentEvents(msg.agentId)) {
      this.send(client, { type: 'local:event', ...evt });
    }
    const a = this.local.get(msg.agentId)!;
    this.send(client, { type: 'local:event', agentId: a.id, raw: { type: 'status', status: a.lastStatus }, at: a.lastActivityAt });
  }

  private stopWatching(client: WebSocket) {
    const t = this.watchers.get(client);
    if (t) clearInterval(t);
    this.watchers.delete(client);
  }

  private stopRun(client: WebSocket) {
    this.runAbort.get(client)?.abort();
    this.runAbort.delete(client);
  }

  private send(client: WebSocket, msg: unknown) {
    if (client.readyState === client.OPEN) client.send(JSON.stringify(msg));
  }
}
