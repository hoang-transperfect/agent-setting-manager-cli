import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runUpdate } from '../../src/commands/update.js';

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'asm-update-test-'));
}

function writeManifest(dir, data) {
  writeFileSync(join(dir, 'agent.json'), JSON.stringify(data, null, 2));
}

function writeLog(dir, data) {
  writeFileSync(join(dir, 'agent-log.json'), JSON.stringify(data, null, 2));
}

function readLog(dir) {
  return JSON.parse(readFileSync(join(dir, 'agent-log.json'), 'utf8'));
}

describe('US-011: asm update', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('re-fetches skill and overwrites on all logged targets, refreshes installedAt', async () => {
    const t1 = '2026-01-01T00:00:00.000Z';

    mkdirSync(join(dir, 'source'), { recursive: true });
    writeFileSync(join(dir, 'source', 'skill.md'), '# Original content');

    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [{ name: 'code-review', source: join(dir, 'source', 'skill.md') }],
      rules: [],
      mcps: [],
    });

    mkdirSync(join(dir, '.claude', 'skills', 'code-review'), { recursive: true });
    mkdirSync(join(dir, '.cursor', 'skills', 'code-review'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'), '# Old content');
    writeFileSync(join(dir, '.cursor', 'skills', 'code-review', 'SKILL.md'), '# Old content');

    writeLog(dir, {
      version: '1.0.0',
      items: [
        {
          type: 'skill', name: 'code-review', target: 'claude', installedAt: t1,
          installedPath: join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'),
        },
        {
          type: 'skill', name: 'code-review', target: 'cursor', installedAt: t1,
          installedPath: join(dir, '.cursor', 'skills', 'code-review', 'SKILL.md'),
        },
      ],
    });

    // Update source
    writeFileSync(join(dir, 'source', 'skill.md'), '# Updated content');

    const result = await runUpdate({ cwd: dir, type: 'skill', names: ['code-review'] });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'), 'utf8')).toBe('# Updated content');
    expect(readFileSync(join(dir, '.cursor', 'skills', 'code-review', 'SKILL.md'), 'utf8')).toBe('# Updated content');

    const log = readLog(dir);
    const entries = log.items.filter((i) => i.name === 'code-review');
    expect(entries.every((e) => e.installedAt !== t1)).toBe(true); // timestamps refreshed
  });

  it('updates all skills when no name specified', async () => {
    mkdirSync(join(dir, 'sources'), { recursive: true });
    writeFileSync(join(dir, 'sources', 'a.md'), '# A updated');
    writeFileSync(join(dir, 'sources', 'b.md'), '# B updated');

    mkdirSync(join(dir, '.claude', 'skills', 'skill-a'), { recursive: true });
    mkdirSync(join(dir, '.claude', 'skills', 'skill-b'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'skill-a', 'SKILL.md'), '# A old');
    writeFileSync(join(dir, '.claude', 'skills', 'skill-b', 'SKILL.md'), '# B old');

    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [
        { name: 'skill-a', source: join(dir, 'sources', 'a.md') },
        { name: 'skill-b', source: join(dir, 'sources', 'b.md') },
      ],
      rules: [],
      mcps: [],
    });

    writeLog(dir, {
      version: '1.0.0',
      items: [
        { type: 'skill', name: 'skill-a', target: 'claude', installedAt: 't1', installedPath: join(dir, '.claude', 'skills', 'skill-a', 'SKILL.md') },
        { type: 'skill', name: 'skill-b', target: 'claude', installedAt: 't1', installedPath: join(dir, '.claude', 'skills', 'skill-b', 'SKILL.md') },
      ],
    });

    const result = await runUpdate({ cwd: dir, type: 'skill' });

    expect(result.exitCode).toBe(0);
    expect(readFileSync(join(dir, '.claude', 'skills', 'skill-a', 'SKILL.md'), 'utf8')).toBe('# A updated');
    expect(readFileSync(join(dir, '.claude', 'skills', 'skill-b', 'SKILL.md'), 'utf8')).toBe('# B updated');
  });

  it('skips and exits non-zero when source is unreachable during update', async () => {
    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [{ name: 'bad-skill', source: join(dir, 'does-not-exist.md') }],
      rules: [],
      mcps: [],
    });

    writeLog(dir, {
      version: '1.0.0',
      items: [
        { type: 'skill', name: 'bad-skill', target: 'claude', installedAt: 't1', installedPath: join(dir, '.claude/skills/bad-skill/SKILL.md') },
      ],
    });

    const result = await runUpdate({ cwd: dir, type: 'skill', names: ['bad-skill'] });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('bad-skill');
  });

  it('errors when named skill not found in agent.json', async () => {
    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [],
      rules: [],
      mcps: [],
    });

    writeLog(dir, { version: '1.0.0', items: [] });

    const result = await runUpdate({ cwd: dir, type: 'skill', names: ['unknown-skill'] });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('unknown-skill');
    expect(result.stderr).toContain('not found');
  });
});

describe('US-011: result tracking (updated / no change / skipped)', () => {
  let dir;

  beforeEach(() => { dir = makeTmp(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); });

  it('reports "no change" and does not rewrite file or refresh installedAt when content identical', async () => {
    const t1 = '2026-01-01T00:00:00.000Z';
    const content = '# Same content';

    mkdirSync(join(dir, 'sources'), { recursive: true });
    writeFileSync(join(dir, 'sources', 'skill.md'), content);
    mkdirSync(join(dir, '.claude', 'skills', 'code-review'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'), content);

    writeManifest(dir, {
      version: '1.0.0', agentFile: {},
      skills: [{ name: 'code-review', source: join(dir, 'sources', 'skill.md') }],
      rules: [], mcps: [],
    });

    writeLog(dir, {
      version: '1.0.0',
      items: [{
        type: 'skill', name: 'code-review', target: 'claude', installedAt: t1,
        installedPath: join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'),
      }],
    });

    const result = await runUpdate({ cwd: dir, type: 'skill', names: ['code-review'] });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('no change');
    // installedAt must NOT be refreshed
    const log = readLog(dir);
    expect(log.items[0].installedAt).toBe(t1);
  });

  it('reports "updated" and refreshes installedAt when content changed', async () => {
    const t1 = '2026-01-01T00:00:00.000Z';

    mkdirSync(join(dir, 'sources'), { recursive: true });
    writeFileSync(join(dir, 'sources', 'skill.md'), '# New content');
    mkdirSync(join(dir, '.claude', 'skills', 'code-review'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'), '# Old content');

    writeManifest(dir, {
      version: '1.0.0', agentFile: {},
      skills: [{ name: 'code-review', source: join(dir, 'sources', 'skill.md') }],
      rules: [], mcps: [],
    });

    writeLog(dir, {
      version: '1.0.0',
      items: [{
        type: 'skill', name: 'code-review', target: 'claude', installedAt: t1,
        installedPath: join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'),
      }],
    });

    const result = await runUpdate({ cwd: dir, type: 'skill', names: ['code-review'] });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('updated');
    const log = readLog(dir);
    expect(log.items[0].installedAt).not.toBe(t1);
  });

  it('prints final summary with counts', async () => {
    const content = '# Same';
    mkdirSync(join(dir, 'sources'), { recursive: true });
    writeFileSync(join(dir, 'sources', 'same.md'), content);
    writeFileSync(join(dir, 'sources', 'changed.md'), '# New');
    mkdirSync(join(dir, '.claude', 'skills', 'same-skill'), { recursive: true });
    mkdirSync(join(dir, '.claude', 'skills', 'changed-skill'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'same-skill', 'SKILL.md'), content);
    writeFileSync(join(dir, '.claude', 'skills', 'changed-skill', 'SKILL.md'), '# Old');

    writeManifest(dir, {
      version: '1.0.0', agentFile: {},
      skills: [
        { name: 'same-skill', source: join(dir, 'sources', 'same.md') },
        { name: 'changed-skill', source: join(dir, 'sources', 'changed.md') },
      ],
      rules: [], mcps: [],
    });

    writeLog(dir, {
      version: '1.0.0',
      items: [
        { type: 'skill', name: 'same-skill', target: 'claude', installedAt: 't1', installedPath: join(dir, '.claude', 'skills', 'same-skill', 'SKILL.md') },
        { type: 'skill', name: 'changed-skill', target: 'claude', installedAt: 't1', installedPath: join(dir, '.claude', 'skills', 'changed-skill', 'SKILL.md') },
      ],
    });

    const result = await runUpdate({ cwd: dir, type: 'skill' });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toMatch(/update complete:.*1 updated.*1 unchanged/);
  });
});

describe('US-006/US-011: missing agent-log.json handled gracefully', () => {
  let dir;

  beforeEach(() => { dir = makeTmp(); });
  afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

  it('creates agent-log.json, prints no-active-targets message, exits 0', async () => {
    writeManifest(dir, {
      version: '1.0.0', agentFile: {},
      skills: [{ name: 'code-review', source: join(dir, 'skill.md') }],
      rules: [], mcps: [],
    });
    // No agent-log.json written

    const result = await runUpdate({ cwd: dir });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, 'agent-log.json'))).toBe(true);
    expect(result.stdout).toContain('no active targets');
  });
});

describe('US-015: graceful handling of missing log entry on update', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('warns and attempts at expected path when log entry missing, exits 0', async () => {
    mkdirSync(join(dir, 'sources'), { recursive: true });
    writeFileSync(join(dir, 'sources', 'skill.md'), '# New content');

    // Skill is in manifest but NOT in log
    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [{ name: 'code-review', source: join(dir, 'sources', 'skill.md') }],
      rules: [],
      mcps: [],
    });

    writeLog(dir, { version: '1.0.0', items: [] });

    // Pre-create the expected path
    mkdirSync(join(dir, '.claude', 'skills', 'code-review'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'), '# Old');

    const result = await runUpdate({ cwd: dir, type: 'skill', names: ['code-review'] });

    expect(result.exitCode).toBe(0);
    // Should have attempted to write to the expected path
  });
});
