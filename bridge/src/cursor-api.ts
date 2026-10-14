/**
 * Thin client for the official Cursor Cloud Agents API v1 (SPEC.md §2).
 * Only this file knows about api.cursor.com; controllers see normalized shapes.
 */

export interface AgentSummary {
  id: string;
  name: string;
  status: string;
  url?: string;
  latestRunId?: string;
  updatedAt?: string;
  createdAt?: string;
}

export interface AgentDetail extends AgentSummary {
  env?: unknown;
  repos?: unknown[];
  workOnCurrentBranch?: boolean;
  autoCreatePR?: boolean;
}

export interface CreateAgentInput {
  prompt: string;
  repoUrl?: string;
  startingRef?: string;
  model?: string;
  mode?: 'agent' | 'plan';
  autoCreatePR?: boolean;
  name?: string;
}

export class CursorApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const BASE = 'https://api.cursor.com';

export class CursorApi {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return {
      Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`,
      'Content-Type': 'application/json',
      ...extra,
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${BASE}${path}`, {
      method,
      headers: this.headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      let code = `http_${res.status}`;
      let message = res.statusText;
      try {
        const j = (await res.json()) as { code?: string; message?: string };
        code = j.code ?? code;
        message = j.message ?? message;
      } catch {
        /* non-JSON error body */
      }
      throw new CursorApiError(res.status, code, message);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  listAgents(limit = 50, cursor?: string) {
    const q = new URLSearchParams({ limit: String(limit) });
    if (cursor) q.set('cursor', cursor);
    return this.request<{ items: AgentSummary[]; nextCursor?: string }>('GET', `/v1/agents?${q}`);
  }

  getAgent(id: string) {
    return this.request<AgentDetail>('GET', `/v1/agents/${id}`);
  }

  createAgent(input: CreateAgentInput) {
    return this.request<{ agent: AgentDetail; run: { id: string; status: string } }>('POST', '/v1/agents', {
      prompt: { text: input.prompt },
      ...(input.name ? { name: input.name } : {}),
      ...(input.model ? { model: { id: input.model } } : {}),
      ...(input.mode ? { mode: input.mode } : {}),
      ...(input.autoCreatePR !== undefined ? { autoCreatePR: input.autoCreatePR } : {}),
      ...(input.repoUrl
        ? { repos: [{ url: input.repoUrl, ...(input.startingRef ? { startingRef: input.startingRef } : {}) }] }
        : {}),
    });
  }

  createRun(agentId: string, text: string) {
    return this.request<{ run: { id: string; status: string } }>('POST', `/v1/agents/${agentId}/runs`, {
      prompt: { text },
    });
  }

  listRuns(agentId: string, limit = 20) {
    return this.request<{ items: { id: string; status: string }[] }>('GET', `/v1/agents/${agentId}/runs?limit=${limit}`);
  }

  getRun(agentId: string, runId: string) {
    return this.request<Record<string, unknown>>('GET', `/v1/agents/${agentId}/runs/${runId}`);
  }

  cancelRun(agentId: string, runId: string) {
    return this.request<{ id: string }>('POST', `/v1/agents/${agentId}/runs/${runId}/cancel`);
  }

  archiveAgent(agentId: string) {
    return this.request<{ id: string }>('POST', `/v1/agents/${agentId}/archive`);
  }

  deleteAgent(agentId: string) {
    return this.request<{ id: string }>('DELETE', `/v1/agents/${agentId}`);
  }

  getUsage(agentId: string) {
    return this.request<Record<string, unknown>>('GET', `/v1/agents/${agentId}/usage`);
  }

  /**
   * Open the official SSE stream for a run (SPEC.md §2 "Stream A Run").
   * Returns 'closed' when the stream ended, 'expired' on 410, or throws.
   */
  async streamRun(
    agentId: string,
    runId: string,
    opts: {
      lastEventId?: string;
      signal?: AbortSignal;
      onEvent: (event: string, data: string, id?: string) => void;
    },
  ): Promise<'closed' | 'expired'> {
    const headers: Record<string, string> = {
      Authorization: this.headers().Authorization,
      Accept: 'text/event-stream',
    };
    if (opts.lastEventId) headers['Last-Event-ID'] = opts.lastEventId;
    const res = await this.fetchImpl(`${BASE}/v1/agents/${agentId}/runs/${runId}/stream`, {
      method: 'GET',
      headers,
      signal: opts.signal,
    });
    if (res.status === 410) return 'expired';
    if (!res.ok || !res.body) {
      throw new CursorApiError(res.status, `http_${res.status}`, res.statusText);
    }
    await parseSse(res.body, opts.onEvent);
    return 'closed';
  }
}

/** Incremental SSE parser: handles multi-line data, id, event fields. */
export async function parseSse(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: string, id?: string) => void,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let event = 'message';
  let dataLines: string[] = [];
  let id: string | undefined;

  const dispatch = () => {
    if (dataLines.length === 0) {
      event = 'message';
      id = undefined;
      return;
    }
    onEvent(event, dataLines.join('\n'), id);
    event = 'message';
    dataLines = [];
    id = undefined;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).replace(/\r$/, '');
      buf = buf.slice(idx + 1);
      if (line === '') {
        dispatch();
      } else if (line.startsWith('event:')) {
        event = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).replace(/^ /, ''));
      } else if (line.startsWith('id:')) {
        id = line.slice(3).trim();
      }
      // comments / other fields ignored
    }
  }
  dispatch();
}
