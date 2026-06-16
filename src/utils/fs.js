import { mkdirSync, writeFileSync, symlinkSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

export function ensureDir(dirPath) {
  mkdirSync(dirPath, { recursive: true });
}

export function writeFileAtomic(filePath, content) {
  ensureDir(dirname(filePath));
  const tmp = filePath + '.tmp';
  writeFileSync(tmp, content, 'utf8');
  renameSync(tmp, filePath);
}

export function symlinkOrFallback(target, linkPath) {
  if (existsSync(linkPath)) {
    unlinkSync(linkPath);
  }
  try {
    symlinkSync(target, linkPath);
  } catch {
    writeFileSync(linkPath, 'read AGENT.md', 'utf8');
  }
}
