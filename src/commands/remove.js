import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { readManifest, writeManifest } from '../core/manifest.js';
import { readLog, writeLog } from '../core/log.js';
import { ExitCollector } from '../core/exit.js';

export async function runRemove({ cwd, type, names }) {
  const manifestPath = join(cwd, 'agent.json');
  const logPath = join(cwd, 'agent-log.json');

  const manifest = readManifest(manifestPath);
  const log = readLog(logPath);
  const collector = new ExitCollector();

  for (const name of names) {
    // Check manifest
    const inManifest = isInManifest(manifest, type, name);
    if (!inManifest) {
      collector.addFailure(`${name} not found in agent.json`);
      continue;
    }

    // Find log entries
    const logEntries = log.items.filter((i) => i.type === type && i.name === name);

    if (logEntries.length === 0) {
      // US-015: not in log — warn, attempt at expected paths
      process.stderr.write(`${name} not found in agent-log — attempting at expected path\n`);
      for (const target of ['claude', 'cursor']) {
        const path = conventionPath(type, name, target, cwd);
        if (path && existsSync(path)) {
          unlinkSync(path);
        }
      }
    } else {
      for (const entry of logEntries) {
        if (entry.installedPath && existsSync(entry.installedPath)) {
          unlinkSync(entry.installedPath);
        } else if (entry.installedPath) {
          process.stderr.write(
            `file not found at ${entry.installedPath} — skipping platform removal\n`
          );
        }
      }
    }

    // Remove from manifest
    removeFromManifest(manifest, type, name);
    // Remove from log
    log.items = log.items.filter((i) => !(i.type === type && i.name === name));
  }

  writeManifest(manifestPath, manifest);
  writeLog(logPath, log);

  if (collector.hasFailures()) {
    return { exitCode: 1, stderr: collector.getFailures().join('\n') };
  }
  return { exitCode: 0 };
}

function isInManifest(manifest, type, name) {
  if (type === 'skill') return manifest.skills.some((s) => s.name === name);
  if (type === 'rule') return manifest.rules.some((r) => r.name === name);
  if (type === 'agentFile') return !!manifest.agentFile?.source;
  if (type === 'mcp') return manifest.mcps.some((m) => m.name === name);
  return false;
}

function removeFromManifest(manifest, type, name) {
  if (type === 'skill') manifest.skills = manifest.skills.filter((s) => s.name !== name);
  if (type === 'rule') manifest.rules = manifest.rules.filter((r) => r.name !== name);
  if (type === 'agentFile') manifest.agentFile = {};
  if (type === 'mcp') manifest.mcps = manifest.mcps.filter((m) => m.name !== name);
}

function conventionPath(type, name, target, cwd) {
  const prefix = target === 'cursor' ? '.cursor' : '.claude';
  if (type === 'skill') return join(cwd, prefix, 'skills', name, 'SKILL.md');
  if (type === 'rule') return join(cwd, prefix, 'rules', `${name}.md`);
  if (type === 'agentFile') return target === 'cursor' ? join(cwd, 'AGENTS.md') : join(cwd, 'AGENT.md');
  return null;
}
