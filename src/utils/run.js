import { spawnSync } from 'node:child_process';

export function runCommand(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    stdio: 'pipe',
    ...options,
  });
  const success = result.status === 0 && !result.error;
  return {
    success,
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
    error: result.error,
  };
}
