#!/usr/bin/env node

import { Command } from 'commander';
import pc from 'picocolors';
import { registerEnvCommands } from './commands/env.js';

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

// Register Module Commands
registerEnvCommands(program);

// Stubs for upcoming Milestone 2 and 3
program
  .command('purge')
  .description('Safely reclaim disk space from dormant build caches and dependencies')
  .option('-d, --dry-run', 'Preview deletions without modifying files', true)
  .option('-f, --force', 'Proceed without interactive confirmation', false)
  .action(options => {
    console.log(
      pc.yellow(`DEA Purge module initializing (dryRun: ${options.dryRun})... (Milestone 2)`)
    );
  });

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
