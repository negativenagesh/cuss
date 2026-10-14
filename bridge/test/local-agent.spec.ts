import { mkdtempSync, chmodSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { LocalAgentService, RunEvent } from '../src/local-agent';

const FAKE_CLI = join(__dirname, 'fake-cursor.sh');
const tmp = mkdtempSync(join(tmpdir(), 'mc-local-'));
const REGISTRY = join(tmp, 'local-agents.json');

function waitFor(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(fn: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!fn()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting');
    await waitFor(20);
  }
}

beforeAll(() => chmodSync(FAKE_CLI, 0o755));

describe('LocalAgentService (cursor-agent CLI driver, SPEC.md §4 v2)', () => {
  it('createChat registers an agent named from the first prompt', async () => {
    const svc = new LocalAgentService(FAKE_CLI, REGISTRY);
    const a = await svc.createChat(tmp, 'fix the login bug in auth module', 'sonnet-4-thinking');
    expect(a.id).toBe('chat-fake-0001');
    expect(a.name).toBe('fix the login bug in auth module');
    expect(a.cwd).toBe(tmp);
    expect(a.lastStatus).toBe('idle');
    expect(existsSync(REGISTRY)).toBe(true);
  });

  it('prompt spawns a run, streams NDJSON events, ends done', async () => {
    const svc = new LocalAgentService(FAKE_CLI, join(tmp, 'r2.json'));
    const a = await svc.createChat(tmp, 'add tests');
    const events: RunEvent[] = [];
    const statuses: string[] = [];
    svc.on('event', (e: RunEvent) => events.push(e));
    svc.on('changed', () => statuses.push(svc.get(a.id)!.lastStatus));

    expect(svc.prompt(a.id, 'add tests')).toEqual({ queued: false });
    await waitUntil(() => svc.get(a.id)!.lastStatus === 'done');

    const raws = events.map((e) => e.raw as any);
    expect(raws[0]).toMatchObject({ type: 'cuss_user_turn', text: 'add tests' });
    expect(raws.find((r) => r.type === 'system')).toMatchObject({ type: 'system', chatId: a.id });
    expect(raws.map((r) => r.type)).toEqual(
      expect.arrayContaining(['cuss_user_turn', 'system', 'assistant', 'tool_call', 'result', 'exit']),
    );
    expect(statuses).toContain('running');
    expect(statuses[statuses.length - 1]).toBe('done');
  });

  it('queues a second prompt while a run is active and resumes the same chat', async () => {
    const svc = new LocalAgentService(FAKE_CLI, join(tmp, 'r3.json'));
    const a = await svc.createChat(tmp, 'first task');
    const events: RunEvent[] = [];
    svc.on('event', (e: RunEvent) => events.push(e));

    svc.prompt(a.id, 'first task');
    const second = svc.prompt(a.id, 'second task');
    expect(second).toEqual({ queued: true });
    expect(svc.get(a.id)!.lastStatus).toBe('queued');

    await waitUntil(() => svc.get(a.id)!.lastStatus === 'done');
    const results = events
      .map((e) => e.raw as any)
      .filter((r) => r.type === 'result')
      .map((r) => r.text);
    expect(results).toEqual(['finished first task', 'finished second task']);
  });

  it('stop kills the active run', async () => {
    const svc = new LocalAgentService(FAKE_CLI, join(tmp, 'r4.json'));
    const a = await svc.createChat(tmp, 'task');
    svc.prompt(a.id, 'task');
    await waitUntil(() => svc.get(a.id)!.lastStatus === 'running');
    expect(svc.stop(a.id)).toBe(true);
    await waitUntil(() => svc.get(a.id)!.lastStatus !== 'running');
    expect(svc.stop(a.id)).toBe(false); // already stopped
  });

  it('persists the registry and resets stale running state on reload', () => {
    const data = JSON.parse(readFileSync(REGISTRY, 'utf8'));
    data[0].lastStatus = 'running';
    const p = join(tmp, 'reload.json');
    require('node:fs').writeFileSync(p, JSON.stringify(data));
    const svc = new LocalAgentService(FAKE_CLI, p);
    expect(svc.get('chat-fake-0001')!.lastStatus).toBe('idle');
  });

  it('rejects prompts for unknown agents', () => {
    const svc = new LocalAgentService(FAKE_CLI, join(tmp, 'r5.json'));
    expect(() => svc.prompt('nope', 'x')).toThrowError(/unknown local agent/);
  });

  it('renames and deletes a chat session cleanly', async () => {
    const svc = new LocalAgentService(FAKE_CLI, join(tmp, 'r6.json'));
    const a = await svc.createChat(tmp, 'initial name');
    const renamed = svc.renameChat(a.id, 'Scout BQ Audit');
    expect(renamed.name).toBe('Scout BQ Audit');
    const del = svc.deleteChat(a.id);
    expect(del.deleted).toBe(true);
    expect(svc.get(a.id)).toBeUndefined();
  });
});
