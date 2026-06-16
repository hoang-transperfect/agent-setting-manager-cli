import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { resolveManifestPath, writeManifest, createDefaultManifest } from '../core/manifest.js';
import { initLog } from '../core/log.js';

export async function runInit({ cwd, path: customPath, force = false, cliVersion }) {
  const manifestPath = resolveManifestPath(cwd, customPath);
  const logPath = join(dirname(manifestPath), 'agent-log.json');

  // Check for existing file
  if (existsSync(manifestPath) && !force) {
    return {
      exitCode: 1,
      stderr: `agent.json already exists at ${manifestPath} — use --force to overwrite`,
    };
  }

  // Ensure target directory exists
  const targetDir = dirname(manifestPath);
  if (!existsSync(targetDir)) {
    return {
      exitCode: 1,
      stderr: `directory does not exist: ${targetDir}`,
    };
  }

  try {
    writeManifest(manifestPath, createDefaultManifest(cliVersion));
    initLog(logPath);
    return { exitCode: 0 };
  } catch (err) {
    return { exitCode: 1, stderr: err.message };
  }
}
