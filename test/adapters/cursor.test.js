import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cursorAdapter } from '../../src/adapters/cursor.js';

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'asm-cursor-test-'));
}

describe('US-005: cursor adapter', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('installs skill to .cursor/skills/<name>/SKILL.md', async () => {
    await cursorAdapter.installSkill({ name: 'code-review' }, dir, '# Code Review');
    const path = join(dir, '.cursor/skills/code-review/SKILL.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('# Code Review');
  });

  it('installs rule to .cursor/rules/<name>.md', async () => {
    await cursorAdapter.installRule({ name: 'no-console' }, dir, '# No Console');
    const path = join(dir, '.cursor/rules/no-console.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('# No Console');
  });

  it('installs agentFile to AGENTS.md', async () => {
    await cursorAdapter.installAgentFile({}, dir, '# My Agent');
    const path = join(dir, 'AGENTS.md');
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, 'utf8')).toBe('# My Agent');
  });

  it('calls npx add-mcp with --transport http when transport is http', async () => {
    const runModule = await import('../../src/utils/run.js');
    const runMock = vi.spyOn(runModule, 'runCommand').mockReturnValue({ success: true });

    await cursorAdapter.installMcp(
      { name: 'my-mcp', source: 'https://example.com/mcp', targets: ['cursor'], transport: 'http' },
      dir
    );

    expect(runMock).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['add-mcp', 'https://example.com/mcp', '-a', 'cursor', '-n', 'my-mcp', '-y', '--transport', 'http'])
    );
  });

  it('does not call npx add-mcp when targets does not include cursor', async () => {
    const runModule = await import('../../src/utils/run.js');
    const runMock = vi.spyOn(runModule, 'runCommand').mockReturnValue({ success: true });

    await cursorAdapter.installMcp({ name: 'my-mcp', source: 'pkg', targets: ['claude'] }, dir);
    expect(runMock).not.toHaveBeenCalled();
  });
});
