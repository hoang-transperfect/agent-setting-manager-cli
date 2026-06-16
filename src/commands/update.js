import { join } from 'node:path';
import { readManifest } from '../core/manifest.js';
import { readLog, addLogEntry } from '../core/log.js';
import { fetchSource } from '../core/fetch-source.js';
import { getAdapter } from '../adapters/index.js';
import { ExitCollector } from '../core/exit.js';

function conventionPath(type, name, target, cwd) {
  if (type === 'skill') return join(cwd, `.${target}`, 'skills', name, 'SKILL.md');
  if (type === 'rule') return join(cwd, `.${target}`, 'rules', `${name}.md`);
  if (type === 'agentFile') return target === 'cursor' ? join(cwd, 'AGENTS.md') : join(cwd, 'AGENT.md');
  return null;
}

export async function runUpdate({ cwd, type, names }) {
  const manifestPath = join(cwd, 'agent.json');
  const logPath = join(cwd, 'agent-log.json');

  const manifest = readManifest(manifestPath);
  const log = readLog(logPath);
  const collector = new ExitCollector();

  // Determine which artifact types and names to update
  const typesToUpdate = type ? [type] : ['skill', 'rule', 'agentFile'];

  for (const artifactType of typesToUpdate) {
    const entries = getManifestEntries(manifest, artifactType);

    const selectedEntries = names && names.length > 0
      ? entries.filter((e) => names.includes(e.name ?? 'agentFile'))
      : entries;

    // Check for names not found in manifest
    if (names) {
      for (const name of names) {
        const found = entries.some((e) => (e.name ?? 'agentFile') === name);
        if (!found) {
          collector.addFailure(`${name} not found in agent.json`);
        }
      }
    }

    for (const entry of selectedEntries) {
      const entryName = entry.name ?? 'agentFile';

      let content;
      try {
        content = await fetchSource(entry.source);
      } catch {
        collector.addFailure(`skipped: source not found for ${entryName}`);
        continue;
      }

      // Find all log entries for this artifact
      const logEntries = log.items.filter(
        (i) => i.type === artifactType && i.name === entryName
      );

      if (logEntries.length === 0) {
        // US-015: missing log entry — warn, attempt at convention paths for known targets
        process.stderr.write(
          `${entryName} not found in agent-log — attempting at expected path\n`
        );
        // Try conventional paths for common targets
        for (const target of ['claude', 'cursor']) {
          const path = conventionPath(artifactType, entryName, target, cwd);
          if (path) {
            const adapter = getAdapter(target);
            if (adapter) {
              try {
                await installByType(adapter, artifactType, entry, cwd, content);
              } catch {
                // ignore
              }
            }
          }
        }
        continue;
      }

      for (const logEntry of logEntries) {
        const adapter = getAdapter(logEntry.target);
        if (!adapter) continue;

        try {
          const installedPath = await installByType(adapter, artifactType, entry, cwd, content);
          addLogEntry(logPath, {
            ...logEntry,
            installedAt: new Date().toISOString(),
            ...(installedPath ? { installedPath } : {}),
          });
        } catch (err) {
          collector.addFailure(`failed to update ${entryName} on ${logEntry.target}: ${err.message}`);
        }
      }
    }
  }

  if (collector.hasFailures()) {
    return { exitCode: 1, stderr: collector.getFailures().join('\n') };
  }
  return { exitCode: 0 };
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
