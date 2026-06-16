import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, chmodSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';
import { runInit } from '../../src/commands/init.js';

const CLI_VERSION = '1.0.0';

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'asm-init-test-'));
}

describe('US-001: asm init', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates agent.json with default structure when no file exists', async () => {
    const result = await runInit({ cwd: dir, cliVersion: CLI_VERSION });

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(dir, 'agent.json'))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(dir, 'agent.json'), 'utf8'));
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.agentFile).toEqual({});
    expect(manifest.skills).toEqual([]);
    expect(manifest.rules).toEqual([]);
    expect(manifest.mcps).toEqual([]);
  });

  it('creates agent-log.json alongside agent.json', async () => {
    await runInit({ cwd: dir, cliVersion: CLI_VERSION });

    expect(existsSync(join(dir, 'agent-log.json'))).toBe(true);
    const log = JSON.parse(readFileSync(join(dir, 'agent-log.json'), 'utf8'));
    expect(log.version).toBe('1.0.0');
    expect(log.items).toEqual([]);
  });

  it('creates agent.json at custom --path', async () => {
    const subdir = join(dir, 'config');
    mkdirSync(subdir);
    const targetPath = join(subdir, 'agent.json');

    const result = await runInit({ cwd: dir, path: targetPath, cliVersion: CLI_VERSION });

    expect(result.exitCode).toBe(0);
    expect(existsSync(targetPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(targetPath, 'utf8'));
    expect(manifest.version).toBe('1.0.0');
  });

  it('errors when agent.json already exists and --force not set', async () => {
    // Create existing file
    await runInit({ cwd: dir, cliVersion: CLI_VERSION });

    const result = await runInit({ cwd: dir, cliVersion: CLI_VERSION });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('agent.json already exists');
    expect(result.stderr).toContain('--force');

    // Original file unchanged
    const manifest = JSON.parse(readFileSync(join(dir, 'agent.json'), 'utf8'));
    expect(manifest.version).toBe('1.0.0');
  });

  it('overwrites existing agent.json with --force', async () => {
    // Create a "corrupted" file first
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'agent.json'), JSON.stringify({ version: '0.0.0', corrupted: true }));

    const result = await runInit({ cwd: dir, force: true, cliVersion: CLI_VERSION });

    expect(result.exitCode).toBe(0);
    const manifest = JSON.parse(readFileSync(join(dir, 'agent.json'), 'utf8'));
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.corrupted).toBeUndefined();
  });

  it('errors with clear message when target directory does not exist', async () => {
    const nonExistent = join(dir, 'does-not-exist', 'agent.json');

    const result = await runInit({ cwd: dir, path: nonExistent, cliVersion: CLI_VERSION });

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeTruthy();
  });
});
