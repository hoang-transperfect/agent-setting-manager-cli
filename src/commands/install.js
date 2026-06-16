import { join } from 'node:path';
import { readManifest } from '../core/manifest.js';
import { addLogEntry, readLog, writeLog } from '../core/log.js';
import { fetchSource } from '../core/fetch-source.js';
import { validateTargets, getAdapter } from '../adapters/index.js';
import { ExitCollector } from '../core/exit.js';

export async function runInstall({ cwd, targets, cliVersion }) {
  if (!targets || targets.length === 0) {
    return { exitCode: 1, stderr: '--target is required. Supported: claude, cursor' };
  }

  const targetError = validateTargets(targets);
  if (targetError) {
    return { exitCode: 1, stderr: targetError };
  }

  const manifestPath = join(cwd, 'agent.json');
  const manifest = readManifest(manifestPath);
  const logPath = join(cwd, 'agent-log.json');

  const collector = new ExitCollector();

  for (const target of targets) {
    const adapter = getAdapter(target);

    // Skills
    for (const skill of (manifest.skills || [])) {
      try {
        const content = await fetchSource(skill.source);
        const installedPath = await adapter.installSkill(skill, cwd, content);
        addLogEntry(logPath, {
          type: 'skill',
          name: skill.name,
          target,
          installedAt: new Date().toISOString(),
          installedPath,
        });
      } catch (err) {
        collector.addFailure(`skipped: source not found for ${skill.name}`);
      }
    }

    // Rules
    for (const rule of (manifest.rules || [])) {
      try {
        const content = await fetchSource(rule.source);
        const installedPath = await adapter.installRule(rule, cwd, content);
        addLogEntry(logPath, {
          type: 'rule',
          name: rule.name,
          target,
          installedAt: new Date().toISOString(),
          installedPath,
        });
      } catch (err) {
        collector.addFailure(`skipped: source not found for ${rule.name}`);
      }
    }

    // AgentFile
    if (manifest.agentFile && manifest.agentFile.source) {
      try {
        const content = await fetchSource(manifest.agentFile.source);
        const installedPath = await adapter.installAgentFile(manifest.agentFile, cwd, content);
        addLogEntry(logPath, {
          type: 'agentFile',
          name: 'agentFile',
          target,
          installedAt: new Date().toISOString(),
          installedPath,
        });
      } catch (err) {
        collector.addFailure(`skipped: source not found for agentFile`);
      }
    }

    // MCPs
    for (const mcp of (manifest.mcps || [])) {
      try {
        await adapter.installMcp(mcp, cwd);
        addLogEntry(logPath, {
          type: 'mcp',
          name: mcp.name,
          target,
          installedAt: new Date().toISOString(),
        });
      } catch (err) {
        collector.addFailure(`skipped: failed to install MCP ${mcp.name}`);
      }
    }
  }

  if (collector.hasFailures()) {
    return { exitCode: 1, stderr: collector.getFailures().join('\n') };
  }
  return { exitCode: 0 };
}
