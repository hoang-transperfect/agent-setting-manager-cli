import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runRemove } from '../../src/commands/remove.js';

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'asm-remove-test-'));
}

function writeManifest(dir, data) {
  writeFileSync(join(dir, 'agent.json'), JSON.stringify(data, null, 2));
}

function writeLog(dir, data) {
  writeFileSync(join(dir, 'agent-log.json'), JSON.stringify(data, null, 2));
}

function readManifestFile(dir) {
  return JSON.parse(readFileSync(join(dir, 'agent.json'), 'utf8'));
}

function readLogFile(dir) {
  return JSON.parse(readFileSync(join(dir, 'agent-log.json'), 'utf8'));
}

describe('US-012: asm remove', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('removes skill files, agent.json entry, and log records', async () => {
    mkdirSync(join(dir, '.claude', 'skills', 'code-review'), { recursive: true });
    mkdirSync(join(dir, '.cursor', 'skills', 'code-review'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'), '# Skill');
    writeFileSync(join(dir, '.cursor', 'skills', 'code-review', 'SKILL.md'), '# Skill');

    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [{ name: 'code-review', source: 'skill.md' }],
      rules: [],
      mcps: [],
    });

    writeLog(dir, {
      version: '1.0.0',
      items: [
        { type: 'skill', name: 'code-review', target: 'claude', installedAt: 't1', installedPath: join(dir, '.claude', 'skills', 'code-review', 'SKILL.md') },
        { type: 'skill', name: 'code-review', target: 'cursor', installedAt: 't1', installedPath: join(dir, '.cursor', 'skills', 'code-review', 'SKILL.md') },
      ],
    });

    const result = await runRemove({ cwd: dir, type: 'skill', names: ['code-review'] });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, '.claude', 'skills', 'code-review', 'SKILL.md'))).toBe(false);
    expect(existsSync(join(dir, '.cursor', 'skills', 'code-review', 'SKILL.md'))).toBe(false);

    const manifest = readManifestFile(dir);
    expect(manifest.skills).toHaveLength(0);

    const log = readLogFile(dir);
    expect(log.items.filter((i) => i.name === 'code-review')).toHaveLength(0);
  });

  it('removes multiple skills in a single command', async () => {
    mkdirSync(join(dir, '.claude', 'skills', 'skill-a'), { recursive: true });
    mkdirSync(join(dir, '.claude', 'skills', 'skill-b'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'skills', 'skill-a', 'SKILL.md'), '# A');
    writeFileSync(join(dir, '.claude', 'skills', 'skill-b', 'SKILL.md'), '# B');

    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [
        { name: 'skill-a', source: 'a.md' },
        { name: 'skill-b', source: 'b.md' },
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

    const result = await runRemove({ cwd: dir, type: 'skill', names: ['skill-a', 'skill-b'] });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, '.claude', 'skills', 'skill-a', 'SKILL.md'))).toBe(false);
    expect(existsSync(join(dir, '.claude', 'skills', 'skill-b', 'SKILL.md'))).toBe(false);
    expect(readManifestFile(dir).skills).toHaveLength(0);
  });

  it('warns when file missing on platform but still removes manifest + log entries; exits 0', async () => {
    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [{ name: 'code-review', source: 'skill.md' }],
      rules: [],
      mcps: [],
    });

    writeLog(dir, {
      version: '1.0.0',
      items: [
        { type: 'skill', name: 'code-review', target: 'claude', installedAt: 't1', installedPath: join(dir, '.claude', 'skills', 'code-review', 'SKILL.md') },
      ],
    });

    // File does NOT exist at the logged path — should warn but not fail

    const result = await runRemove({ cwd: dir, type: 'skill', names: ['code-review'] });

    expect(result.exitCode).toBe(0);
    expect(readManifestFile(dir).skills).toHaveLength(0);
    expect(readLogFile(dir).items.filter((i) => i.name === 'code-review')).toHaveLength(0);
  });

  it('errors when skill not found in agent.json', async () => {
    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [],
      rules: [],
      mcps: [],
    });

    writeLog(dir, { version: '1.0.0', items: [] });

    const result = await runRemove({ cwd: dir, type: 'skill', names: ['unknown-skill'] });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('unknown-skill');
    expect(result.stderr).toContain('not found');
  });
});

describe('US-015: graceful handling of missing log entry on remove', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('still removes from manifest when log entry is missing; exits 0', async () => {
    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [{ name: 'code-review', source: 'skill.md' }],
      rules: [],
      mcps: [],
    });

    writeLog(dir, { version: '1.0.0', items: [] }); // NOT in log

    const result = await runRemove({ cwd: dir, type: 'skill', names: ['code-review'] });

    expect(result.exitCode).toBe(0);
    expect(readManifestFile(dir).skills).toHaveLength(0);
  });
});
