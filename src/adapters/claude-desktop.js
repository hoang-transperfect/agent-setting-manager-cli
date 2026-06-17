import * as runUtils from '../utils/run.js';

export const claudeDesktopAdapter = {
  name: 'claude-desktop',

  async installSkill() {},
  async installRule() {},
  async installAgentFile() {},

  async installMcp(item, _targetDir) {
    const args = ['add-mcp', item.source, '-a', 'claude', '-n', item.name, '-y'];
    if (item.transport) args.push('--transport', item.transport);
    if (item.args) args.push('--args', item.args);
    if (item.env) args.push('--env', JSON.stringify(item.env));
    runUtils.runCommand('npx', args);
  },

  async removeSkill() {},
  async removeRule() {},
  async removeAgentFile() {},
  async removeMcp() {},
};
