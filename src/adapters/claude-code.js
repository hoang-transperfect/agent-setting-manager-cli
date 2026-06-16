import { join } from 'node:path';
import { writeFileAtomic, ensureDir, symlinkOrFallback } from '../utils/fs.js';
import * as runUtils from '../utils/run.js';
import { unlinkSync, existsSync, rmSync } from 'node:fs';

export const claudeCodeAdapter = {
  name: 'claude',

  async installSkill(item, targetDir, content) {
    const dest = join(targetDir, '.claude', 'skills', item.name, 'SKILL.md');
    writeFileAtomic(dest, content);
    return dest;
  },

  async installRule(item, targetDir, content) {
    const dest = join(targetDir, '.claude', 'rules', `${item.name}.md`);
    writeFileAtomic(dest, content);
    return dest;
  },

  async installAgentFile(_item, targetDir, content) {
    const agentMd = join(targetDir, 'AGENT.md');
    const claudeMd = join(targetDir, 'CLAUDE.md');
    writeFileAtomic(agentMd, content);
    symlinkOrFallback('AGENT.md', claudeMd);
    return agentMd;
  },

  async installMcp(item, _targetDir) {
    if (!item.targets || !item.targets.includes('claude')) return;
    const args = ['add-mcp', item.source, '-a', 'claude', '-n', item.name, '-y'];
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
    const agentMd = join(targetDir, 'AGENT.md');
    const claudeMd = join(targetDir, 'CLAUDE.md');
    if (existsSync(agentMd)) unlinkSync(agentMd);
    if (existsSync(claudeMd)) unlinkSync(claudeMd);
  },

  async removeMcp(_item) {
    // Removal of MCP from claude desktop not supported via npx add-mcp CLI
  },
};
