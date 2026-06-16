import { readFileSync, existsSync } from 'node:fs';

export async function fetchSource(source) {
  if (source.startsWith('http://') || source.startsWith('https://')) {
    const res = await fetch(source);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${source}`);
    }
    return res.text();
  }

  if (!existsSync(source)) {
    throw new Error(`file not found: ${source}`);
  }
  return readFileSync(source, 'utf8');
}
