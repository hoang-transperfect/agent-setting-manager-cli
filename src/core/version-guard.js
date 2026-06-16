import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function majorOf(semver) {
  return parseInt(semver.split('.')[0], 10);
}

export function checkVersionCompatibility(cwd, cliVersion) {
  const manifestPath = join(cwd, 'agent.json');

  if (!existsSync(manifestPath)) {
    return {
      exitCode: 1,
      stderr: "agent.json not found — run 'asm init' to create one",
    };
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return { exitCode: 1, stderr: 'agent.json is malformed JSON — cannot parse' };
  }

  if (!manifest.version) {
    return { exitCode: 1, stderr: 'agent.json schema invalid: version field is missing' };
  }

  const manifestMajor = majorOf(manifest.version);
  const cliMajor = majorOf(cliVersion);

  if (manifestMajor !== cliMajor) {
    return {
      exitCode: 1,
      stderr: `version mismatch: agent.json is v${manifestMajor}, CLI is v${cliMajor}`,
    };
  }

  return null;
}
