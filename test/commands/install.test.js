import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInstall } from '../../src/commands/install.js';

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'asm-install-test-'));
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

const CLI_VERSION = '1.0.0';

describe('US-003: asm install', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
    writeLog(dir, { version: '1.0.0', items: [] });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('installs all artifacts to both targets and writes log records', async () => {
    const skillContent = '# My Skill';
    const ruleContent = '# No Console';
    const agentContent = '# Agent';

    // Create local source files
    writeFileSync(join(dir, 'skill.md'), skillContent);
    writeFileSync(join(dir, 'rule.md'), ruleContent);
    writeFileSync(join(dir, 'agent.md'), agentContent);
    writeFileSync(join(dir, 'skill2.md'), '# Skill Two');

    writeManifest(dir, {
      version: '1.0.0',
      agentFile: { source: join(dir, 'agent.md') },
      skills: [
        { name: 'skill-one', source: join(dir, 'skill.md') },
        { name: 'skill-two', source: join(dir, 'skill2.md') },
      ],
      rules: [{ name: 'no-console', source: join(dir, 'rule.md') }],
      mcps: [],
    });

    const result = await runInstall({ cwd: dir, targets: ['claude', 'cursor'], cliVersion: CLI_VERSION });

    expect(result.exitCode).toBe(0);

    // Claude paths
    expect(existsSync(join(dir, '.claude/skills/skill-one/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/skills/skill-two/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/rules/no-console.md'))).toBe(true);
    // agentFile: AGENTS.md (content) + CLAUDE.md (symlink or stub)
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);

    // Cursor paths
    expect(existsSync(join(dir, '.cursor/skills/skill-one/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.cursor/skills/skill-two/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.cursor/rules/no-console.md'))).toBe(true);

    // Log records: 2 skills × 2 targets + 1 rule × 2 targets + 1 agentFile × 2 targets = 8
    const log = readLog(dir);
    expect(log.items).toHaveLength(8);
  });

  it('errors when --target is not provided', async () => {
    writeManifest(dir, { version: '1.0.0', agentFile: {}, skills: [], rules: [], mcps: [] });

    const result = await runInstall({ cwd: dir, targets: [], cliVersion: CLI_VERSION });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/target.*required|no target/i);
  });

  it('errors when an unknown target is given', async () => {
    writeManifest(dir, { version: '1.0.0', agentFile: {}, skills: [], rules: [], mcps: [] });

    const result = await runInstall({ cwd: dir, targets: ['unknown'], cliVersion: CLI_VERSION });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('unknown');
    expect(result.stderr).toMatch(/supported.*claude.*cursor|claude.*cursor.*supported/i);
  });

  it('skips artifact when source is not found and exits non-zero', async () => {
    writeFileSync(join(dir, 'good.md'), '# Good Skill');

    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [
        { name: 'good-skill', source: join(dir, 'good.md') },
        { name: 'bad-skill', source: join(dir, 'does-not-exist.md') },
      ],
      rules: [],
      mcps: [],
    });

    const result = await runInstall({ cwd: dir, targets: ['claude'], cliVersion: CLI_VERSION });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('bad-skill');
    expect(result.stderr).toContain('skipped');

    // Good skill still installed
    expect(existsSync(join(dir, '.claude/skills/good-skill/SKILL.md'))).toBe(true);
    // Bad skill not installed
    expect(existsSync(join(dir, '.claude/skills/bad-skill/SKILL.md'))).toBe(false);
  });
});

describe('NFR-05: asm install real-time output', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
    writeLog(dir, { version: '1.0.0', items: [] });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('prints in-progress line before result line for each artifact', async () => {
    writeFileSync(join(dir, 'a.md'), '# A');
    writeFileSync(join(dir, 'b.md'), '# B');

    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [
        { name: 'skill-a', source: join(dir, 'a.md') },
        { name: 'skill-b', source: join(dir, 'b.md') },
      ],
      rules: [],
      mcps: [],
    });

    const lines = [];
    await runInstall({ cwd: dir, targets: ['claude'], cliVersion: CLI_VERSION, print: (l) => lines.push(l) });

    const progressA = lines.findIndex((l) => l.includes('→') && l.includes('skill-a'));
    const resultA = lines.findIndex((l) => l.includes('✓') && l.includes('skill-a'));
    const progressB = lines.findIndex((l) => l.includes('→') && l.includes('skill-b'));
    const resultB = lines.findIndex((l) => l.includes('✓') && l.includes('skill-b'));

    expect(progressA).toBeGreaterThanOrEqual(0);
    expect(resultA).toBeGreaterThan(progressA);
    expect(progressB).toBeGreaterThan(resultA);
    expect(resultB).toBeGreaterThan(progressB);
  });

  it('prints summary line at end', async () => {
    writeFileSync(join(dir, 'skill.md'), '# S');
    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [{ name: 'my-skill', source: join(dir, 'skill.md') }],
      rules: [],
      mcps: [],
    });

    const lines = [];
    await runInstall({ cwd: dir, targets: ['claude'], cliVersion: CLI_VERSION, print: (l) => lines.push(l) });

    expect(lines.some((l) => l.includes('install complete'))).toBe(true);
    expect(lines.some((l) => l.includes('1 installed'))).toBe(true);
  });

  it('prints ✗ skipped line for missing source', async () => {
    writeManifest(dir, {
      version: '1.0.0',
      agentFile: {},
      skills: [{ name: 'missing', source: join(dir, 'no-such-file.md') }],
      rules: [],
      mcps: [],
    });

    const lines = [];
    await runInstall({ cwd: dir, targets: ['claude'], cliVersion: CLI_VERSION, print: (l) => lines.push(l) });

    expect(lines.some((l) => l.includes('✗') && l.includes('missing'))).toBe(true);
    expect(lines.some((l) => l.includes('1 skipped'))).toBe(true);
  });
});
