import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeCodeAdapter } from '../../src/adapters/claude-code.js';

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'asm-claude-test-'));
}

describe('US-004: claude-code adapter', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('installs skill to .claude/skills/<name>/SKILL.md', async () => {
    await claudeCodeAdapter.installSkill({ name: 'code-review' }, dir, '# Code Review Skill');
    const path = join(dir, '.claude/skills/code-review/SKILL.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('# Code Review Skill');
  });

  it('installs rule to .claude/rules/<name>.md', async () => {
    await claudeCodeAdapter.installRule({ name: 'no-console' }, dir, '# No Console Rule');
    const path = join(dir, '.claude/rules/no-console.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('# No Console Rule');
  });

  it('installs agentFile: writes AGENTS.md and creates CLAUDE.md (symlink or fallback)', async () => {
    await claudeCodeAdapter.installAgentFile({}, dir, '# My Agent');

    const agentPath = join(dir, 'AGENTS.md');
    const claudePath = join(dir, 'CLAUDE.md');

    expect(existsSync(agentPath)).toBe(true);
    expect(readFileSync(agentPath, 'utf8')).toBe('# My Agent');

    // CLAUDE.md must exist — either as a symlink or as a fallback file
    const stat = lstatSync(claudePath); // lstatSync does NOT follow symlinks
    if (stat.isSymbolicLink()) {
      const { readlinkSync } = await import('node:fs');
      expect(readlinkSync(claudePath)).toBe('AGENTS.md');
    } else {
      expect(readFileSync(claudePath, 'utf8')).toBe('read AGENTS.md');
    }
  });

  it('calls npx add-mcp unconditionally (no targets filter on item)', async () => {
    const runMock = vi.spyOn(
      await import('../../src/utils/run.js'),
      'runCommand'
    ).mockReturnValue({ success: true });

    await claudeCodeAdapter.installMcp(
      { name: 'figma', source: 'figma-pkg' },
      dir
    );
    expect(runMock).toHaveBeenCalledWith('npx', expect.arrayContaining(['-a', 'claude', '-n', 'figma']));
  });
});
