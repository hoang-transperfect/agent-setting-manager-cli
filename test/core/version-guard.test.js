import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkVersionCompatibility } from '../../src/core/version-guard.js';

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'asm-vguard-test-'));
}

describe('US-002: version compatibility guard', () => {
  let dir;

  beforeEach(() => {
    dir = makeTmp();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('passes silently when agent.json major version matches CLI major version', () => {
    writeFileSync(join(dir, 'agent.json'), JSON.stringify({ version: '2.3.0' }));
    const result = checkVersionCompatibility(dir, '2.0.0');
    expect(result).toBeNull();
  });

  it('errors when agent.json is v1 and CLI is v2', () => {
    writeFileSync(join(dir, 'agent.json'), JSON.stringify({ version: '1.0.0' }));
    const result = checkVersionCompatibility(dir, '2.0.0');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('version mismatch');
    expect(result.stderr).toContain('v1');
    expect(result.stderr).toContain('v2');
  });

  it('errors when agent.json is v3 and CLI is v2', () => {
    writeFileSync(join(dir, 'agent.json'), JSON.stringify({ version: '3.0.0' }));
    const result = checkVersionCompatibility(dir, '2.0.0');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('version mismatch');
    expect(result.stderr).toContain('v3');
    expect(result.stderr).toContain('v2');
  });

  it('errors when agent.json does not exist', () => {
    const result = checkVersionCompatibility(dir, '1.0.0');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('agent.json not found');
    expect(result.stderr).toContain("asm init");
  });

  it('errors when agent.json is missing version field', () => {
    writeFileSync(join(dir, 'agent.json'), JSON.stringify({ skills: [] }));
    const result = checkVersionCompatibility(dir, '1.0.0');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/version.*missing|schema.*invalid|invalid.*schema/i);
  });

  it('errors when agent.json is malformed JSON', () => {
    writeFileSync(join(dir, 'agent.json'), '{ not valid json }');
    const result = checkVersionCompatibility(dir, '1.0.0');
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBeTruthy();
  });
});
