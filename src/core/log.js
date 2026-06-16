import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const DEFAULT_LOG = { version: '1.0.0', items: [] };

export function readLog(logPath) {
  if (!existsSync(logPath)) return { ...DEFAULT_LOG, items: [] };
  const raw = readFileSync(logPath, 'utf8');
  return JSON.parse(raw);
}

export function writeLog(logPath, data) {
  writeFileSync(logPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function initLog(logPath) {
  if (!existsSync(logPath)) {
    writeLog(logPath, DEFAULT_LOG);
  }
}

export function addLogEntry(logPath, entry) {
  const log = readLog(logPath);
  const idx = log.items.findIndex(
    (i) => i.type === entry.type && i.name === entry.name && i.target === entry.target
  );
  if (idx >= 0) {
    log.items[idx] = entry;
  } else {
    log.items.push(entry);
  }
  writeLog(logPath, log);
}

export function removeLogEntries(logPath, type, name) {
  const log = readLog(logPath);
  log.items = log.items.filter((i) => !(i.type === type && i.name === name));
  writeLog(logPath, log);
}

export function getLogEntries(logPath, type, name) {
  const log = readLog(logPath);
  return log.items.filter((i) => i.type === type && (name == null || i.name === name));
}
