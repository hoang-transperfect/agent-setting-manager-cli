import { join } from 'node:path';
import { readManifest } from '../core/manifest.js';
import { addLogEntry } from '../core/log.js';
import { fetchSource } from '../core/fetch-source.js';
import { validateTargets, getAdapter } from '../adapters/index.js';
import { ExitCollector } from '../core/exit.js';

export async function runInstall({ cwd, targets, cliVersion, print = () => {} }) {
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
  let installed = 0;
  let skipped = 0;

  for (const target of targets) {
    const adapter = getAdapter(target);

    for (const skill of (manifest.skills || [])) {
      print(`  → installing ${skill.name} to ${target}…`);
      try {
        const content = await fetchSource(skill.source);
        const installedPath = await adapter.installSkill(skill, cwd, content);
        addLogEntry(logPath, { type: 'skill', name: skill.name, target, installedAt: new Date().toISOString(), installedPath });
        print(`  ✓ installed: ${skill.name} → ${target}`);
        installed++;
      } catch {
        print(`  ✗ skipped: source not found for ${skill.name}`);
        collector.addFailure(`skipped: source not found for ${skill.name}`);
        skipped++;
      }
    }

    for (const rule of (manifest.rules || [])) {
      print(`  → installing ${rule.name} to ${target}…`);
      try {
        const content = await fetchSource(rule.source);
        const installedPath = await adapter.installRule(rule, cwd, content);
        addLogEntry(logPath, { type: 'rule', name: rule.name, target, installedAt: new Date().toISOString(), installedPath });
        print(`  ✓ installed: ${rule.name} → ${target}`);
        installed++;
      } catch {
        print(`  ✗ skipped: source not found for ${rule.name}`);
        collector.addFailure(`skipped: source not found for ${rule.name}`);
        skipped++;
      }
    }

    if (manifest.agentFile && manifest.agentFile.source) {
      print(`  → installing agentFile to ${target}…`);
      try {
        const content = await fetchSource(manifest.agentFile.source);
        const installedPath = await adapter.installAgentFile(manifest.agentFile, cwd, content);
        addLogEntry(logPath, { type: 'agentFile', name: 'agentFile', target, installedAt: new Date().toISOString(), installedPath });
        print(`  ✓ installed: agentFile → ${target}`);
        installed++;
      } catch {
        print(`  ✗ skipped: source not found for agentFile`);
        collector.addFailure(`skipped: source not found for agentFile`);
        skipped++;
      }
    }

    for (const mcp of (manifest.mcps || [])) {
      print(`  → installing ${mcp.name} to ${target}…`);
      try {
        await adapter.installMcp(mcp, cwd);
        addLogEntry(logPath, { type: 'mcp', name: mcp.name, target, installedAt: new Date().toISOString() });
        print(`  ✓ installed: ${mcp.name} → ${target}`);
        installed++;
      } catch {
        print(`  ✗ skipped: failed to install MCP ${mcp.name}`);
        collector.addFailure(`skipped: failed to install MCP ${mcp.name}`);
        skipped++;
      }
    }
  }

  print('');
  print(`install complete: ${installed} installed, ${skipped} skipped`);

  if (collector.hasFailures()) {
    return { exitCode: 1, stderr: collector.getFailures().join('\n') };
  }
  return { exitCode: 0 };
}
