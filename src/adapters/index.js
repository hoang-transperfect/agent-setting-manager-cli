import { claudeCodeAdapter } from './claude-code.js';
import { claudeDesktopAdapter } from './claude-desktop.js';
import { cursorAdapter } from './cursor.js';

export const ADAPTERS = {
  claude: claudeCodeAdapter,
  cursor: cursorAdapter,
};

export const SUPPORTED_TARGETS = Object.keys(ADAPTERS);

export function validateTargets(targets) {
  const unknown = targets.filter((t) => !ADAPTERS[t]);
  if (unknown.length > 0) {
    return `${unknown.join(', ')} is not a supported target. Supported: ${SUPPORTED_TARGETS.join(', ')}`;
  }
  return null;
}

export function getAdapter(target) {
  return ADAPTERS[target];
}
