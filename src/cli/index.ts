#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { registerEnvCommands } from './commands/env.js';
import { registerPurgeCommands } from './commands/purge.js';

const program = new Command();

program
  .name('dea')
  .description(
    pc.bold(
      `${pc.cyan('DEA')} — ${pc.dim("Developer's Everyday Assistant")}\n` +
        `A local-only, zero-cloud companion for env drift, disk bloat, and crash debugging.`
    )
  )
  .version('0.1.0', '-v, --version', 'Output the current version of DEA');

// Support `dea version` as a command
program
  .command('version')
  .description('Output the current version of DEA')
  .action(() => {
    console.log('0.1.0');
  });

// Register Module Commands
registerEnvCommands(program);
registerPurgeCommands(program);

// Stub for upcoming Milestone 3
program
  .command('lens')
  .description('De-noise terminal errors and isolate root-cause diagnostics')
  .action(() => {
    console.log(pc.yellow('DEA Lens module initializing... (Milestone 3)'));
  });

program.parse(process.argv);

if (!process.argv.slice(2).length) {
  program.outputHelp();
}
