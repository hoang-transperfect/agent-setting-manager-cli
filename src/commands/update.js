import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { readManifest } from '../core/manifest.js';
import { readLog, writeLog, addLogEntry } from '../core/log.js';
import { fetchSource } from '../core/fetch-source.js';
import { getAdapter } from '../adapters/index.js';
import { ExitCollector } from '../core/exit.js';

function getActiveTargets(log) {
  return [...new Set(log.items.map((i) => i.target))];
}

function conventionPath(type, name, target, cwd) {
  if (type === 'skill') return join(cwd, `.${target}`, 'skills', name, 'SKILL.md');
  if (type === 'rule') return join(cwd, `.${target}`, 'rules', `${name}.md`);
  if (type === 'agentFile') return join(cwd, 'AGENTS.md');
  return null;
}

export async function runUpdate({ cwd, type, names }) {
  const manifestPath = join(cwd, 'agent.json');
  const logPath = join(cwd, 'agent-log.json');

  const manifest = readManifest(manifestPath);

  // Handle missing agent-log.json
  if (!existsSync(logPath)) {
    writeLog(logPath, { version: '1.0.0', items: [] });
    return {
      exitCode: 0,
      stdout: 'no active targets — run asm install --target <target> to set up platforms',
    };
  }

  const log = readLog(logPath);
  const activeTargets = getActiveTargets(log);

  const collector = new ExitCollector();

  // Validate named artifacts against manifest before checking targets
  if (names && names.length > 0) {
    const typesToCheck = type ? [type] : ['skill', 'rule', 'agentFile'];
    for (const artifactType of typesToCheck) {
      const entries = getManifestEntries(manifest, artifactType);
      for (const name of names) {
        const found = entries.some((e) => (e.name ?? 'agentFile') === name);
        if (!found) collector.addFailure(`${name} not found in agent.json`);
      }
    }
    if (collector.hasFailures()) {
      return { exitCode: 1, stderr: collector.getFailures().join('\n') };
    }
  }

  if (activeTargets.length === 0) {
    return {
      exitCode: 0,
      stdout: 'no active targets — run asm install --target <target> to set up platforms',
    };
  }
  const typesToUpdate = type ? [type] : ['skill', 'rule', 'agentFile'];

  let updated = 0;
  let unchanged = 0;
  let skipped = 0;
  const stdout = [];

  for (const artifactType of typesToUpdate) {
    const entries = getManifestEntries(manifest, artifactType);

    const selectedEntries = names && names.length > 0
      ? entries.filter((e) => names.includes(e.name ?? 'agentFile'))
      : entries;

    for (const entry of selectedEntries) {
      const entryName = entry.name ?? 'agentFile';

      let content;
      try {
        content = await fetchSource(entry.source);
      } catch {
        collector.addFailure(`skipped: source not found for ${entryName}`);
        skipped++;
        continue;
      }

      for (const target of activeTargets) {
        const adapter = getAdapter(target);
        if (!adapter) continue;

        try {
          const installedPath = conventionPath(artifactType, entryName, target, cwd);
          const currentContent = installedPath && existsSync(installedPath)
            ? readFileSync(installedPath, 'utf8')
            : null;

          if (currentContent === content) {
            stdout.push(`no change: ${entryName} (${target}) — already up to date`);
            unchanged++;
          } else {
            await installByType(adapter, artifactType, entry, cwd, content);
            addLogEntry(logPath, {
              type: artifactType,
              name: entryName,
              target,
              installedAt: new Date().toISOString(),
              ...(installedPath ? { installedPath } : {}),
            });
            stdout.push(`updated: ${entryName} (${target})`);
            updated++;
          }
        } catch (err) {
          collector.addFailure(`failed to update ${entryName} on ${target}: ${err.message}`);
          skipped++;
        }
      }
    }
  }

  stdout.push(`update complete: ${updated} updated, ${unchanged} unchanged, ${skipped} skipped`);

  if (collector.hasFailures()) {
    return { exitCode: 1, stdout: stdout.join('\n'), stderr: collector.getFailures().join('\n') };
  }
  return { exitCode: 0, stdout: stdout.join('\n') };
}

async function installByType(adapter, type, entry, cwd, content) {
  if (type === 'skill') return adapter.installSkill(entry, cwd, content);
  if (type === 'rule') return adapter.installRule(entry, cwd, content);
  if (type === 'agentFile') return adapter.installAgentFile(entry, cwd, content);
  return null;
}

function getManifestEntries(manifest, type) {
  if (type === 'skill') return manifest.skills || [];
  if (type === 'rule') return manifest.rules || [];
  if (type === 'agentFile') return manifest.agentFile?.source ? [manifest.agentFile] : [];
  return [];
}
