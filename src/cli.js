#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'node:module';
import { runInit } from './commands/init.js';
import { runInstall } from './commands/install.js';
import { runAdd } from './commands/add.js';
import { runUpdate } from './commands/update.js';
import { runRemove } from './commands/remove.js';
import { checkVersionCompatibility } from './core/version-guard.js';

const require = createRequire(import.meta.url);
const { version: CLI_VERSION } = require('../package.json');

function cwd() {
  return process.cwd();
}

function versionGuard(cmd) {
  const err = checkVersionCompatibility(cwd(), CLI_VERSION);
  if (err) {
    process.stderr.write(err.stderr + '\n');
    process.exit(err.exitCode);
  }
}

program
  .name('asm')
  .description('Agent Setting Manager — manage AI agent configs across Claude and Cursor')
  .version(CLI_VERSION);

// asm init
program
  .command('init')
  .description('Create agent.json manifest in the current project')
  .option('--path <path>', 'custom path for agent.json')
  .option('--force', 'overwrite existing agent.json')
  .action(async (opts) => {
    const result = await runInit({ cwd: cwd(), path: opts.path, force: opts.force, cliVersion: CLI_VERSION });
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    process.exit(result.exitCode);
  });

// asm install
program
  .command('install')
  .description('Install all artifacts to specified targets')
  .requiredOption('--target <targets...>', 'target platforms (claude, cursor)')
  .action(async (opts) => {
    versionGuard();
    const result = await runInstall({ cwd: cwd(), targets: opts.target, cliVersion: CLI_VERSION });
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    process.exit(result.exitCode);
  });

// asm add
program
  .command('add')
  .description('Add and install an artifact')
  .option('--skill', 'add a skill')
  .option('--rule', 'add a rule')
  .option('--agentFile', 'add an agent file')
  .option('--mcp', 'add an MCP server')
  .option('--name <names...>', 'artifact name(s)')
  .option('--source <sources...>', 'source path(s) or URL(s)')
  .option('--package <pkg>', 'npm package name (skills only)')
  .option('--targets <targets...>', 'targets for MCP (claude, cursor)')
  .option('--transport <transport>', 'MCP transport (http, stdio)')
  .action(async (opts) => {
    versionGuard();

    const type = opts.skill ? 'skill' : opts.rule ? 'rule' : opts.agentFile ? 'agentFile' : opts.mcp ? 'mcp' : null;
    if (!type) {
      process.stderr.write('specify one of --skill, --rule, --agentFile, --mcp\n');
      process.exit(1);
    }

    let items;
    if (type === 'agentFile') {
      items = [{ source: opts.source?.[0] }];
    } else if (type === 'mcp') {
      items = [{ name: opts.name?.[0], source: opts.source?.[0], targets: opts.targets, transport: opts.transport }];
    } else {
      const names = opts.name || [];
      const sources = opts.source || [];
      items = names.map((name, i) => ({ name, source: sources[i] }));
    }

    const result = await runAdd({ cwd: cwd(), type, items });
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    process.exit(result.exitCode);
  });

// asm update
program
  .command('update')
  .description('Re-fetch and overwrite installed artifacts')
  .option('--skill', 'update skills')
  .option('--rule', 'update rules')
  .option('--name <names...>', 'specific artifact name(s) to update')
  .action(async (opts) => {
    versionGuard();
    const type = opts.skill ? 'skill' : opts.rule ? 'rule' : null;
    const result = await runUpdate({ cwd: cwd(), type, names: opts.name });
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    process.exit(result.exitCode);
  });

// asm remove
program
  .command('remove')
  .description('Remove artifacts from platforms and manifest')
  .option('--skill', 'remove a skill')
  .option('--rule', 'remove a rule')
  .option('--agentFile', 'remove the agent file')
  .option('--mcp', 'remove an MCP server')
  .option('--name <names...>', 'artifact name(s) to remove')
  .action(async (opts) => {
    versionGuard();
    const type = opts.skill ? 'skill' : opts.rule ? 'rule' : opts.agentFile ? 'agentFile' : opts.mcp ? 'mcp' : null;
    if (!type) {
      process.stderr.write('specify one of --skill, --rule, --agentFile, --mcp\n');
      process.exit(1);
    }
    const names = opts.agentFile ? ['agentFile'] : (opts.name || []);
    const result = await runRemove({ cwd: cwd(), type, names });
    if (result.stderr) process.stderr.write(result.stderr + '\n');
    process.exit(result.exitCode);
  });

program.parseAsync(process.argv);
