import { join } from 'node:path';
import { writeFileAtomic } from '../utils/fs.js';
import * as runUtils from '../utils/run.js';
import { unlinkSync, existsSync } from 'node:fs';

export const cursorAdapter = {
  name: 'cursor',

  async installSkill(item, targetDir, content) {
    const dest = join(targetDir, '.cursor', 'skills', item.name, 'SKILL.md');
    writeFileAtomic(dest, content);
    return dest;
  },

  async installRule(item, targetDir, content) {
    const dest = join(targetDir, '.cursor', 'rules', `${item.name}.md`);
    writeFileAtomic(dest, content);
    return dest;
  },

  async installAgentFile(_item, targetDir, content) {
    const dest = join(targetDir, 'AGENTS.md');
    writeFileAtomic(dest, content);
    return dest;
  },

  async installMcp(item, _targetDir) {
    const args = ['add-mcp', item.source, '-a', 'cursor', '-n', item.name, '-y'];
    if (item.transport) args.push('--transport', item.transport);
    if (item.args) args.push('--args', item.args);
    if (item.env) args.push('--env', JSON.stringify(item.env));
    runUtils.runCommand('npx', args);
  },

  async removeSkill(item, installedPath) {
    if (existsSync(installedPath)) unlinkSync(installedPath);
  },

  async removeRule(item, installedPath) {
    if (existsSync(installedPath)) unlinkSync(installedPath);
  },

  async removeAgentFile(_item, targetDir) {
    const dest = join(targetDir, 'AGENTS.md');
    if (existsSync(dest)) unlinkSync(dest);
  },

  async removeMcp() {},
};
