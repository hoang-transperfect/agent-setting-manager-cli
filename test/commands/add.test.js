import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runAdd } from '../../src/commands/add.js';

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'asm-add-test-'));
}

function writeManifest(dir, data) {
  writeFileSync(join(dir, 'agent.json'), JSON.stringify(data, null, 2));
}

function writeLog(dir, data) {
  writeFileSync(join(dir, 'agent-log.json'), JSON.stringify(data, null, 2));
}

function readManifest(dir) {
  return JSON.parse(readFileSync(join(dir, 'agent.json'), 'utf8'));
}

function readLog(dir) {
  return JSON.parse(readFileSync(join(dir, 'agent-log.json'), 'utf8'));
}

const BASE_MANIFEST = {
  version: '1.0.0',
  agentFile: {},
  skills: [],
  rules: [],
  mcps: [],
};

// Helper: simulate "no active targets" (empty log)
const EMPTY_LOG = { version: '1.0.0', items: [] };

// Helper: simulate "active targets = [claude, cursor]"
function logWithTargets(dir, targets) {
  const items = targets.map((target) => ({
    type: 'skill',
    name: '__sentinel__',
    target,
    installedAt: new Date().toISOString(),
    installedPath: join(dir, `.${target}/skills/__sentinel__/SKILL.md`),
  }));
  return { version: '1.0.0', items };
}

describe('US-007: add skill', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
    writeManifest(dir, BASE_MANIFEST);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('registers skill in agent.json when no active targets exist', async () => {
    writeLog(dir, EMPTY_LOG);
    writeFileSync(join(dir, 'skill.md'), '# My Skill');

    const result = await runAdd({
      cwd: dir,
      type: 'skill',
      items: [{ name: 'my-skill', source: join(dir, 'skill.md') }],
    });

    expect(result.exitCode).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.skills).toHaveLength(1);
    expect(manifest.skills[0].name).toBe('my-skill');
  });

  it('registers skill and installs to both targets when active', async () => {
    writeLog(dir, logWithTargets(dir, ['claude', 'cursor']));
    writeFileSync(join(dir, 'skill.md'), '# My Skill Content');

    const result = await runAdd({
      cwd: dir,
      type: 'skill',
      items: [{ name: 'my-skill', source: join(dir, 'skill.md') }],
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, '.claude/skills/my-skill/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.cursor/skills/my-skill/SKILL.md'))).toBe(true);

    const log = readLog(dir);
    const mySkillEntries = log.items.filter((i) => i.name === 'my-skill');
    expect(mySkillEntries).toHaveLength(2);
  });

  it('errors on mismatched --name/--source count', async () => {
    writeLog(dir, EMPTY_LOG);

    const result = await runAdd({
      cwd: dir,
      type: 'skill',
      items: [{ name: 'skill-a', source: undefined }],
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/source.*required|missing.*source/i);
  });

  it('prompts on duplicate; stop makes no changes', async () => {
    writeLog(dir, EMPTY_LOG);
    writeFileSync(join(dir, 'skill.md'), '# Skill');
    writeManifest(dir, {
      ...BASE_MANIFEST,
      skills: [{ name: 'code-review', source: 'old-source.md' }],
    });

    const result = await runAdd({
      cwd: dir,
      type: 'skill',
      items: [{ name: 'code-review', source: join(dir, 'skill.md') }],
      promptFn: async () => 'stop',
    });

    expect(result.exitCode).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.skills[0].source).toBe('old-source.md'); // unchanged
  });

  it('prompts on duplicate; overwrite replaces entry', async () => {
    writeLog(dir, EMPTY_LOG);
    writeFileSync(join(dir, 'new-skill.md'), '# New Content');
    writeManifest(dir, {
      ...BASE_MANIFEST,
      skills: [{ name: 'code-review', source: 'old-source.md' }],
    });

    const result = await runAdd({
      cwd: dir,
      type: 'skill',
      items: [{ name: 'code-review', source: join(dir, 'new-skill.md') }],
      promptFn: async () => 'overwrite',
    });

    expect(result.exitCode).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.skills[0].source).toBe(join(dir, 'new-skill.md'));
  });
});

describe('US-008: add rule', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
    writeManifest(dir, BASE_MANIFEST);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('registers rule and installs to both active targets', async () => {
    writeLog(dir, logWithTargets(dir, ['claude', 'cursor']));
    writeFileSync(join(dir, 'no-console.md'), '# No Console');

    const result = await runAdd({
      cwd: dir,
      type: 'rule',
      items: [{ name: 'no-console', source: join(dir, 'no-console.md') }],
    });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, '.claude/rules/no-console.md'))).toBe(true);
    expect(existsSync(join(dir, '.cursor/rules/no-console.md'))).toBe(true);

    const log = readLog(dir);
    const ruleEntries = log.items.filter((i) => i.type === 'rule' && i.name === 'no-console');
    expect(ruleEntries).toHaveLength(2);
  });

  it('registers rule only in agent.json when no active targets', async () => {
    writeLog(dir, EMPTY_LOG);
    writeFileSync(join(dir, 'no-console.md'), '# No Console');

    const result = await runAdd({
      cwd: dir,
      type: 'rule',
      items: [{ name: 'no-console', source: join(dir, 'no-console.md') }],
    });

    expect(result.exitCode).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.rules).toHaveLength(1);
    expect(manifest.rules[0].name).toBe('no-console');
    expect(existsSync(join(dir, '.claude/rules/no-console.md'))).toBe(false);
  });
});

describe('US-009: add agentFile', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
    writeManifest(dir, BASE_MANIFEST);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('registers and installs agentFile to both active targets', async () => {
    writeLog(dir, logWithTargets(dir, ['claude', 'cursor']));
    writeFileSync(join(dir, 'AGENT.md'), '# Agent Instructions');

    const result = await runAdd({
      cwd: dir,
      type: 'agentFile',
      items: [{ source: join(dir, 'AGENT.md') }],
    });

    expect(result.exitCode).toBe(0);
    // Claude: AGENT.md + CLAUDE.md
    expect(existsSync(join(dir, 'AGENT.md'))).toBe(true);
    expect(existsSync(join(dir, 'CLAUDE.md'))).toBe(true);
    // Cursor: AGENTS.md
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(true);

    const manifest = readManifest(dir);
    expect(manifest.agentFile.source).toBeTruthy();
  });

  it('registers agentFile only in manifest when no active targets', async () => {
    writeLog(dir, EMPTY_LOG);
    writeFileSync(join(dir, 'AGENT.md'), '# Agent');

    const result = await runAdd({
      cwd: dir,
      type: 'agentFile',
      items: [{ source: join(dir, 'AGENT.md') }],
    });

    expect(result.exitCode).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.agentFile.source).toBeTruthy();
    expect(existsSync(join(dir, 'AGENTS.md'))).toBe(false);
  });
});

describe('US-010: add MCP server', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
    writeManifest(dir, BASE_MANIFEST);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('registers MCP and calls npx add-mcp for specified targets only', async () => {
    writeLog(dir, logWithTargets(dir, ['claude', 'cursor']));

    const runModule = await import('../../src/utils/run.js');
    const runMock = vi.spyOn(runModule, 'runCommand').mockReturnValue({ success: true });

    const result = await runAdd({
      cwd: dir,
      type: 'mcp',
      items: [{ name: 'my-server', source: 'my-pkg', targets: ['claude'] }],
    });

    expect(result.exitCode).toBe(0);
    const manifest = readManifest(dir);
    expect(manifest.mcps).toHaveLength(1);
    expect(manifest.mcps[0].name).toBe('my-server');

    // npx called only for claude target
    const claudeCalls = runMock.mock.calls.filter((c) => c[1].includes('-a') && c[1][c[1].indexOf('-a') + 1] === 'claude');
    expect(claudeCalls.length).toBeGreaterThan(0);
  });
});

describe('US-016: partial failure in multi-artifact add', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
    writeManifest(dir, BASE_MANIFEST);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('installs valid artifacts and skips missing source, exits non-zero', async () => {
    writeLog(dir, logWithTargets(dir, ['claude']));
    writeFileSync(join(dir, 'a.md'), '# Skill A');
    writeFileSync(join(dir, 'c.md'), '# Skill C');

    const result = await runAdd({
      cwd: dir,
      type: 'skill',
      items: [
        { name: 'skill-a', source: join(dir, 'a.md') },
        { name: 'skill-b', source: join(dir, 'does-not-exist.md') },
        { name: 'skill-c', source: join(dir, 'c.md') },
      ],
    });

    expect(result.exitCode).not.toBe(0);
    expect(existsSync(join(dir, '.claude/skills/skill-a/SKILL.md'))).toBe(true);
    expect(existsSync(join(dir, '.claude/skills/skill-b/SKILL.md'))).toBe(false);
    expect(existsSync(join(dir, '.claude/skills/skill-c/SKILL.md'))).toBe(true);

    const manifest = readManifest(dir);
    expect(manifest.skills.map((s) => s.name)).toContain('skill-a');
    expect(manifest.skills.map((s) => s.name)).not.toContain('skill-b');
    expect(manifest.skills.map((s) => s.name)).toContain('skill-c');
  });

  it('exits 0 when all artifacts succeed', async () => {
    writeLog(dir, EMPTY_LOG);
    writeFileSync(join(dir, 'a.md'), '# A');
    writeFileSync(join(dir, 'b.md'), '# B');

    const result = await runAdd({
      cwd: dir,
      type: 'skill',
      items: [
        { name: 'skill-a', source: join(dir, 'a.md') },
        { name: 'skill-b', source: join(dir, 'b.md') },
      ],
    });

    expect(result.exitCode).toBe(0);
  });
});
