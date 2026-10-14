import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  browseMacDirectories,
  composeCliPrompt,
  listWorkspaceFiles,
  parseCliModelsOutput,
  parseCursorJsonlTranscript,
  readWorkspaceFile,
  resolveCliModelSpec,
} from '../src/model-catalog';

const SAMPLE_CLI_OUTPUT = `Available models

auto - Auto (current, default)
claude-opus-5-5-low - Claude Opus 5.5 1M Low
claude-opus-5-5-high - Claude Opus 5.5 1M High
claude-opus-5-5-high-fast - Claude Opus 5.5 1M High Fast
claude-opus-5-5-xhigh-fast - Claude Opus 5.5 1M Extra High Fast
claude-opus-5-low - Claude Opus 5 1M Low
claude-opus-5-thinking-high - Claude Opus 5 1M Thinking
claude-opus-5-thinking-xhigh-fast - Claude Opus 5 1M Extra High Thinking Fast
grok-4.7-high - Grok 4.7 High
grok-4.7-xhigh-fast - Grok 4.7 Extra High Fast
gpt-5.3-codex-high-fast - Codex 5.3 High Fast
`;

describe('model-catalog (Cursor CLI model & composer parity)', () => {
  it('groups CLI models into families with effort, context, fast, and thinking metadata', () => {
    const { families, rawModels } = parseCliModelsOutput(SAMPLE_CLI_OUTPUT);
    expect(rawModels.length).toBe(11);
    const opus55 = families.find((f) => f.id === 'claude-opus-5-5')!;
    expect(opus55).toBeDefined();
    expect(opus55.efforts).toEqual(['low', 'medium', 'high', 'xhigh', 'max']);
    expect(opus55.contexts).toEqual(['300k', '1m']);
    expect(opus55.supportsFast).toBe(true);
    expect(opus55.variants.some((v) => v.slug === 'claude-opus-5-5-xhigh-fast' && v.fast && v.effort === 'xhigh')).toBe(true);
  });

  it('resolves default context selection to the exact CLI variant slug', () => {
    const { families } = parseCliModelsOutput(SAMPLE_CLI_OUTPUT);
    expect(
      resolveCliModelSpec({ model: 'claude-opus-5-5', effort: 'xhigh', context: '1m', fast: true }, families),
    ).toBe('claude-opus-5-5-xhigh-fast');
    expect(
      resolveCliModelSpec({ model: 'claude-opus-5', effort: 'xhigh', context: '1m', fast: true, thinking: true }, families),
    ).toBe('claude-opus-5-thinking-xhigh-fast');
  });

  it('always resolves selections (including grok-4.7 with 500k) to verified CLI variant slugs', () => {
    const { families } = parseCliModelsOutput(SAMPLE_CLI_OUTPUT);
    expect(families[0].id).toBe('auto');
    expect(families[1].id).toBe('grok-4.7');
    expect(
      resolveCliModelSpec(
        { model: 'grok-4.7', effort: 'xhigh', context: '500k', fast: true, thinking: false },
        families,
      ),
    ).toBe('grok-4.7-xhigh-fast');
  });

  it('composes structured prompts for plan, ask, debug, multitask, @files, and /commands', () => {
    const plan = composeCliPrompt('Design auth flow', 'plan', {
      files: ['src/auth.ts', 'src/config.ts'],
      slashCommand: 'plan',
      subagents: ['explore'],
    });
    expect(plan.cliModeFlag).toBe('plan');
    expect(plan.cliPrompt).toContain('[COMMAND: /plan]');
    expect(plan.cliPrompt).toContain('@explore');
    expect(plan.cliPrompt).toContain('- @src/auth.ts');

    const ask = composeCliPrompt('How does LiveGateway work?', 'ask');
    expect(ask.cliModeFlag).toBe('ask');

    const debug = composeCliPrompt('Fix race condition', 'debug');
    expect(debug.cliModeFlag).toBeUndefined();
    expect(debug.cliPrompt).toContain('[MODE: DEBUG');
  });

  it('lists workspace files while skipping node_modules and .git', () => {
    const root = mkdtempSync(join(tmpdir(), 'cuss-files-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(join(root, 'src', 'app.tsx'), 'export default 1;');
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;');

    const files = listWorkspaceFiles(root, 'app');
    expect(files.map((f) => f.relativePath)).toEqual(['src/app.tsx']);
  });

  it('parses Cursor native .jsonl transcripts and strips <user_query> tags', () => {
    const root = mkdtempSync(join(tmpdir(), 'cuss-jsonl-'));
    const jsonlPath = join(root, 'session.jsonl');
    const lines = [
      JSON.stringify({
        role: 'user',
        message: {
          content: [
            {
              type: 'text',
              text: '<timestamp>Wed Oct 14</timestamp>\n<user_query>\nCheck running Scout jobs\n</user_query>',
            },
          ],
        },
      }),
      JSON.stringify({
        role: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Checking Scout jobs now.' },
            { type: 'tool_use', name: 'Shell', input: { command: 'bq ls' } },
          ],
        },
      }),
    ];
    writeFileSync(jsonlPath, lines.join('\n'));
    const parsed = parseCursorJsonlTranscript('sess-1', jsonlPath);
    expect(parsed.firstPrompt).toBe('Check running Scout jobs');
    expect(parsed.events.length).toBe(3);
    expect((parsed.events[0].raw as any).text).toBe('Check running Scout jobs');
    expect((parsed.events[1].raw as any).type).toBe('tool_call');
    expect((parsed.events[2].raw as any).type).toBe('assistant');
  });

  it('browses directories while skipping hidden and ignored folders', () => {
    const root = mkdtempSync(join(tmpdir(), 'cuss-dirs-'));
    mkdirSync(join(root, 'alpha-repo', '.git'), { recursive: true });
    mkdirSync(join(root, 'node_modules'), { recursive: true });
    const res = browseMacDirectories(root);
    expect(res.currentPath).toBe(root);
    expect(res.directories.map((d) => d.name)).toEqual(['alpha-repo']);
    expect(res.directories[0].isGitRepo).toBe(true);
  });

  it('reads and classifies workspace files (code, markdown, csv, @prefix, and :line suffix)', () => {
    const root = mkdtempSync(join(tmpdir(), 'cuss-read-file-'));
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'src', 'index.ts'), 'const x = 1;\nexport default x;\n');
    writeFileSync(join(root, 'README.md'), '# Hello CUSS\n');
    writeFileSync(join(root, 'data.csv'), 'id,name\n1,alpha\n');

    const codeFile = readWorkspaceFile(root, '@src/index.ts:2');
    expect(codeFile.ok).toBe(true);
    expect(codeFile.kind).toBe('code');
    expect(codeFile.language).toBe('TYPESCRIPT');
    expect(codeFile.highlightLine).toBe(2);
    expect(codeFile.content).toContain('export default x;');

    const mdFile = readWorkspaceFile(root, 'README.md');
    expect(mdFile.ok).toBe(true);
    expect(mdFile.kind).toBe('markdown');

    const csvFile = readWorkspaceFile(root, 'data.csv');
    expect(csvFile.ok).toBe(true);
    expect(csvFile.kind).toBe('csv');
  });
});
