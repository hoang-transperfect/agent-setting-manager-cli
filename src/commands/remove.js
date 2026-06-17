import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { readManifest, writeManifest } from '../core/manifest.js';
import { readLog, writeLog } from '../core/log.js';
import { ExitCollector } from '../core/exit.js';

function getActiveTargets(log) {
  return [...new Set(log.items.map((i) => i.target))];
}

function conventionPath(type, name, target, cwd) {
  const prefix = target === 'cursor' ? '.cursor' : '.claude';
  if (type === 'skill') return join(cwd, prefix, 'skills', name, 'SKILL.md');
  if (type === 'rule') return join(cwd, prefix, 'rules', `${name}.md`);
  if (type === 'agentFile') return join(cwd, 'AGENTS.md');
  return null;
}

export async function runRemove({ cwd, type, names, print = () => {} }) {
  const manifestPath = join(cwd, 'agent.json');
  const logPath = join(cwd, 'agent-log.json');

  const manifest = readManifest(manifestPath);
  const collector = new ExitCollector();

  if (!existsSync(logPath)) {
    const log = { version: '1.0.0', items: [] };
    for (const name of names) {
      if (!isInManifest(manifest, type, name)) {
        collector.addFailure(`${name} not found in agent.json`);
        continue;
      }
      removeFromManifest(manifest, type, name);
    }
    writeManifest(manifestPath, manifest);
    writeLog(logPath, log);
    if (collector.hasFailures()) {
      return { exitCode: 1, stderr: collector.getFailures().join('\n') };
    }
    const msg = 'no active targets — run asm install --target <target> to set up platforms';
    print(msg);
    return { exitCode: 0, stdout: msg };
  }

  const log = readLog(logPath);
  const activeTargets = getActiveTargets(log);

  for (const name of names) {
    if (!isInManifest(manifest, type, name)) {
      collector.addFailure(`${name} not found in agent.json`);
      continue;
    }

    for (const target of activeTargets) {
      print(`  → removing ${name} from ${target}…`);
      const path = conventionPath(type, name, target, cwd);
      if (path && existsSync(path)) {
        unlinkSync(path);
        print(`  ✓ removed: ${name} from ${target}`);
      } else if (path) {
        print(`  ⚠ warning: file not found at ${path} — skipping platform removal`);
      }
      if (type === 'agentFile' && target === 'claude') {
        const claudeMd = join(cwd, 'CLAUDE.md');
        if (existsSync(claudeMd)) unlinkSync(claudeMd);
      }
    }

    removeFromManifest(manifest, type, name);
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
