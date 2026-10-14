import { describe, expect, it, vi } from 'vitest';
import { CursorApi, CursorApiError, parseSse } from '../src/cursor-api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('CursorApi (official Cloud Agents API v1, SPEC.md §2)', () => {
  it('listAgents hits GET /v1/agents with Basic auth', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, { items: [{ id: 'bc-1', name: 'a', status: 'ACTIVE' }] }));
    const api = new CursorApi('KEY', f as any);
    const page = await api.listAgents(20);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://api.cursor.com/v1/agents?limit=20');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(`Basic ${Buffer.from('KEY:').toString('base64')}`);
    expect(page.items[0].id).toBe('bc-1');
  });

  it('createAgent posts prompt + repos in the documented shape', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, { agent: { id: 'bc-9' }, run: { id: 'run-1', status: 'CREATING' } }));
    const api = new CursorApi('KEY', f as any);
    await api.createAgent({ prompt: 'add readme', repoUrl: 'https://github.com/o/r', startingRef: 'main', mode: 'agent' });
    const body = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(body).toEqual({
      prompt: { text: 'add readme' },
      mode: 'agent',
      repos: [{ url: 'https://github.com/o/r', startingRef: 'main' }],
    });
  });

  it('createRun maps to POST /v1/agents/:id/runs (follow-up prompt)', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(200, { run: { id: 'run-2', status: 'CREATING' } }));
    const api = new CursorApi('KEY', f as any);
    await api.createRun('bc-1', 'also add tests');
    expect(f.mock.calls[0][0]).toBe('https://api.cursor.com/v1/agents/bc-1/runs');
    expect(JSON.parse((f.mock.calls[0][1] as any).body)).toEqual({ prompt: { text: 'also add tests' } });
  });

  it('surfaces 409 agent_busy with the official error code', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(409, { code: 'agent_busy', message: 'busy' }));
    const api = new CursorApi('KEY', f as any);
    await expect(api.createRun('bc-1', 'x')).rejects.toMatchObject({ status: 409, code: 'agent_busy' });
  });

  it('throws CursorApiError on 401', async () => {
    const f = vi.fn().mockResolvedValue(jsonResponse(401, { code: 'unauthorized', message: 'Invalid API key' }));
    const api = new CursorApi('BAD', f as any);
    await expect(api.listAgents()).rejects.toBeInstanceOf(CursorApiError);
  });
});

describe('parseSse (official run stream, SPEC.md §2)', () => {
  function streamOf(text: string): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
        c.close();
      },
    });
  }

  it('parses typed events with ids and multi-line data', async () => {
    const events: any[] = [];
    await parseSse(
      streamOf('event: status\ndata: {"status":"RUNNING"}\n\nid: 1-0\nevent: assistant\ndata: {"text":"hi"}\n\n'),
      (event, data, id) => events.push({ event, data, id }),
    );
    expect(events).toEqual([
      { event: 'status', data: '{"status":"RUNNING"}', id: undefined },
      { event: 'assistant', data: '{"text":"hi"}', id: '1-0' },
    ]);
  });

  it('handles events split across chunks', async () => {
    const events: any[] = [];
    const enc = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(c) {
        c.enqueue(enc.encode('event: assist'));
        c.enqueue(enc.encode('ant\ndata: {"text":"a"}\ndata: {"b":1}\n\n'));
        c.close();
      },
    });
    await parseSse(stream, (event, data) => events.push({ event, data }));
    expect(events).toEqual([{ event: 'assistant', data: '{"text":"a"}\n{"b":1}' }]);
  });

  it('streamRun returns "expired" on 410 (SPEC.md §2 retention rule)', async () => {
    const f = vi.fn().mockResolvedValue(new Response('gone', { status: 410 }));
    const api = new CursorApi('KEY', f as any);
    const outcome = await api.streamRun('bc-1', 'run-1', { onEvent: () => {} });
    expect(outcome).toBe('expired');
  });

  it('streamRun sends Last-Event-ID when resuming', async () => {
    const f = vi.fn().mockResolvedValue(
      new Response(streamOf('event: done\ndata: {}\n\n') as any, { status: 200 }),
    );
    const api = new CursorApi('KEY', f as any);
    await api.streamRun('bc-1', 'run-1', { lastEventId: '9-0', onEvent: () => {} });
    expect((f.mock.calls[0][1] as any).headers['Last-Event-ID']).toBe('9-0');
  });
});
