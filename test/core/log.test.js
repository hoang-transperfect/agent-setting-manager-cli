import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readLog, writeLog, addLogEntry, removeLogEntries, initLog } from '../../src/core/log.js';

function makeTmp() {
  return mkdtempSync(join(tmpdir(), 'asm-log-test-'));
}

describe('US-006: agent-log.json maintenance', () => {
  let dir;
  let logPath;

  beforeEach(() => {
    dir = makeTmp();
    logPath = join(dir, 'agent-log.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates agent-log.json with empty items when first install runs', () => {
    initLog(logPath);
    expect(existsSync(logPath)).toBe(true);
    const log = readLog(logPath);
    expect(log.version).toBe('1.0.0');
    expect(log.items).toEqual([]);
  });

  it('adds two records when skill is installed to claude and cursor', () => {
    initLog(logPath);
    const now = new Date().toISOString();

    addLogEntry(logPath, { type: 'skill', name: 'code-review', target: 'claude', installedAt: now });
    addLogEntry(logPath, { type: 'skill', name: 'code-review', target: 'cursor', installedAt: now });

    const log = readLog(logPath);
    expect(log.items).toHaveLength(2);
    expect(log.items[0]).toMatchObject({ type: 'skill', name: 'code-review', target: 'claude' });
    expect(log.items[1]).toMatchObject({ type: 'skill', name: 'code-review', target: 'cursor' });
  });

  it('upserts: updates installedAt when same skill+target reinstalled, no duplicate', () => {
    initLog(logPath);
    const t1 = '2026-01-01T00:00:00.000Z';
    const t2 = '2026-06-16T00:00:00.000Z';

    addLogEntry(logPath, { type: 'skill', name: 'code-review', target: 'claude', installedAt: t1 });
    addLogEntry(logPath, { type: 'skill', name: 'code-review', target: 'claude', installedAt: t2 });

    const log = readLog(logPath);
    expect(log.items).toHaveLength(1);
    expect(log.items[0].installedAt).toBe(t2);
  });

  it('removes all records for a given type+name', () => {
    initLog(logPath);
    const now = new Date().toISOString();
    addLogEntry(logPath, { type: 'skill', name: 'code-review', target: 'claude', installedAt: now });
    addLogEntry(logPath, { type: 'skill', name: 'code-review', target: 'cursor', installedAt: now });
    addLogEntry(logPath, { type: 'rule', name: 'no-console', target: 'claude', installedAt: now });

    removeLogEntries(logPath, 'skill', 'code-review');

    const log = readLog(logPath);
    expect(log.items).toHaveLength(1);
    expect(log.items[0]).toMatchObject({ type: 'rule', name: 'no-console' });
  });

  it('returns empty items when agent-log.json does not exist', () => {
    const log = readLog(logPath);
    expect(log.items).toEqual([]);
  });

  it('does not overwrite existing log when initLog called on existing file', () => {
    initLog(logPath);
    const now = new Date().toISOString();
    addLogEntry(logPath, { type: 'skill', name: 'my-skill', target: 'claude', installedAt: now });

    initLog(logPath); // should not overwrite

    const log = readLog(logPath);
    expect(log.items).toHaveLength(1);
  });
});
