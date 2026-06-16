import { join } from 'node:path';
import { readManifest, writeManifest } from '../core/manifest.js';
import { readLog, addLogEntry } from '../core/log.js';
import { fetchSource } from '../core/fetch-source.js';
import * as promptModule from '../core/prompt.js';
import { getAdapter, SUPPORTED_TARGETS } from '../adapters/index.js';
import { ExitCollector } from '../core/exit.js';

function getActiveTargets(log) {
  const seen = new Set();
  for (const item of log.items) {
    seen.add(item.target);
  }
  return [...seen].filter((t) => SUPPORTED_TARGETS.includes(t));
}

async function handleDuplicate(name) {
  if (!process.stdin.isTTY) {
    return 'stop';
  }
  return promptModule.askOverwrite(name);
}

export async function runAdd({ cwd, type, items, promptFn }) {
  const manifestPath = join(cwd, 'agent.json');
  const logPath = join(cwd, 'agent-log.json');

  const manifest = readManifest(manifestPath);
  const log = readLog(logPath);
  const activeTargets = getActiveTargets(log);

  const collector = new ExitCollector();

  for (const item of items) {
    // Validate: source required for non-MCP types that aren't package-based
    if (type !== 'mcp' && type !== 'agentFile' && !item.source && !item.package) {
      collector.addFailure(`source is required for ${type} "${item.name}"`);
      continue;
    }
    if (type === 'agentFile' && !item.source) {
      collector.addFailure('source is required for agentFile');
      continue;
    }

    // Check for duplicates
    const isDuplicate = checkDuplicate(manifest, type, item);
    if (isDuplicate) {
      const askFn = promptFn ?? (process.stdin.isTTY ? promptModule.askOverwrite : null);
      if (!askFn) continue; // non-TTY, no injected fn: treat as stop
      const choice = await askFn(item.name || 'agentFile');
      if (choice === 'stop') continue;
      // overwrite: remove existing entry
      removeDuplicate(manifest, type, item);
    }

    // Fetch source (validates reachability before touching manifest)
    let content;
    if (type !== 'mcp' && item.source) {
      try {
        content = await fetchSource(item.source);
      } catch {
        collector.addFailure(`skipped: source not found for ${item.name || 'agentFile'}`);
        continue;
      }
    }

    // Register in manifest
    registerInManifest(manifest, type, item);
    writeManifest(manifestPath, manifest);

    // Install to all active targets
    if (activeTargets.length === 0) continue;

    const effectiveTargets = item.targets
      ? activeTargets.filter((t) => item.targets.includes(t))
      : activeTargets;

    for (const target of effectiveTargets) {
      const adapter = getAdapter(target);
      try {
        let installedPath;
        if (type === 'skill') {
          installedPath = await adapter.installSkill(item, cwd, content);
        } else if (type === 'rule') {
          installedPath = await adapter.installRule(item, cwd, content);
        } else if (type === 'agentFile') {
          installedPath = await adapter.installAgentFile(item, cwd, content);
        } else if (type === 'mcp') {
          await adapter.installMcp(item, cwd);
        }
        addLogEntry(logPath, {
          type,
          name: item.name || 'agentFile',
          target,
          installedAt: new Date().toISOString(),
          ...(installedPath ? { installedPath } : {}),
        });
      } catch (err) {
        collector.addFailure(`failed to install ${type} "${item.name}" to ${target}: ${err.message}`);
      }
    }
  }

  if (collector.hasFailures()) {
    return { exitCode: 1, stderr: collector.getFailures().join('\n') };
  }
  return { exitCode: 0 };
}

function checkDuplicate(manifest, type, item) {
  if (type === 'skill') return manifest.skills.some((s) => s.name === item.name);
  if (type === 'rule') return manifest.rules.some((r) => r.name === item.name);
  if (type === 'agentFile') return !!manifest.agentFile?.source;
  if (type === 'mcp') return manifest.mcps.some((m) => m.name === item.name);
  return false;
}

function removeDuplicate(manifest, type, item) {
  if (type === 'skill') manifest.skills = manifest.skills.filter((s) => s.name !== item.name);
  if (type === 'rule') manifest.rules = manifest.rules.filter((r) => r.name !== item.name);
  if (type === 'agentFile') manifest.agentFile = {};
  if (type === 'mcp') manifest.mcps = manifest.mcps.filter((m) => m.name !== item.name);
}

function registerInManifest(manifest, type, item) {
  if (type === 'skill') {
    const entry = { name: item.name, source: item.source };
    if (item.package) entry.package = item.package;
    manifest.skills.push(entry);
  } else if (type === 'rule') {
    manifest.rules.push({ name: item.name, source: item.source });
  } else if (type === 'agentFile') {
    manifest.agentFile = { source: item.source };
  } else if (type === 'mcp') {
    const entry = { name: item.name, source: item.source };
    if (item.targets) entry.targets = item.targets;
    if (item.transport) entry.transport = item.transport;
    if (item.args) entry.args = item.args;
    if (item.env) entry.env = item.env;
    manifest.mcps.push(entry);
  }
}
