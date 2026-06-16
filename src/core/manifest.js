import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DEFAULT_MANIFEST = (version) => ({
  version,
  agentFile: {},
  skills: [],
  rules: [],
  mcps: [],
});

export function resolveManifestPath(cwd, customPath) {
  if (customPath) return customPath;
  return join(cwd, 'agent.json');
}

export function readManifest(manifestPath) {
  if (!existsSync(manifestPath)) return null;
  const raw = readFileSync(manifestPath, 'utf8');
  return JSON.parse(raw);
}

export function writeManifest(manifestPath, data) {
  writeFileSync(manifestPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function createDefaultManifest(version) {
  return DEFAULT_MANIFEST(version);
}
