import * as readline from 'node:readline/promises';
import { Command } from 'commander';
import pc from 'picocolors';
import { runWithLens } from '../../modules/lens/engine.js';
import { getLastShellCommand } from '../../modules/lens/history.js';
import { runCommand } from '../../core/process/runner.js';
import type { LensDiagnostic } from '../../modules/lens/types.js';

export function registerFixCommand(parent: Command): void {
  parent
    .command('fix')
    .description('Automatically diagnose and offer to fix your last failed terminal command')
    .argument('[command...]', 'Optional specific command to diagnose and fix')
    .action(async (commandParts: string[]) => {
      let targetCommand = commandParts.join(' ').trim();

      // If no command provided, inspect shell history
      if (!targetCommand) {
        const lastCmdInfo = await getLastShellCommand();
        if (lastCmdInfo) {
          targetCommand = lastCmdInfo.command;
          console.log(
            pc.cyan(`\n🔍 Found previous ${pc.bold(lastCmdInfo.historySource)} command: `) +
              pc.bold(targetCommand)
          );
        } else {
          console.log(
            pc.yellow(
              '\n⚠️  No previous command detected in history. Run with a command directly: dea fix "npm run dev"\n'
            )
          );
          return;
        }
      } else {
        console.log(pc.cyan(`\n🔍 Diagnosing: ${pc.bold(targetCommand)}`));
      }

      console.log(pc.dim('⚡ Reproducing failure under DEA Lens supervision...\n'));

      const runRes = await runWithLens(targetCommand);
      if (runRes._tag !== 'Ok') {
        console.error(pc.red(`❌ Failed to run command: ${runRes.error.message}`));
        return;
      }

      const { exitCode, diagnostic } = runRes.value;

      if (exitCode === 0) {
        console.log(
          pc.green('\n✨ The command ran and completed with exit code 0 (no error occurred).\n')
        );
        return;
      }

      if (!diagnostic) {
        console.log(
          pc.red(`\n❌ Command exited with code ${exitCode}, but no output was captured.\n`)
        );
        return;
      }

      console.log(pc.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
      renderFixDiagnostic(diagnostic);

      // Interactive Auto-Execution: If remedy has an actionable command, offer to run it!
      if (diagnostic.remedy.command) {
        const fixCmd = diagnostic.remedy.command;
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await rl.question(
          pc.bold(
            pc.cyan(`\n👉 Would you like DEA to run this fix now? `) +
              pc.yellow(`[${fixCmd}]`) +
              ` (Y/n): `
          )
        );
        rl.close();

        if (answer.trim().toLowerCase() === 'n') {
          console.log(pc.dim('\nFix skipped.\n'));
          return;
        }

        console.log(pc.cyan(`\n🚀 Executing fix: ${pc.bold(fixCmd)}...\n`));
        const fixRes = await runCommand(fixCmd, [], { stdio: 'inherit' });

        if (fixRes._tag === 'Ok' && fixRes.value.exitCode === 0) {
          console.log(
            pc.bold(pc.green('\n✨ Fix applied successfully! You can now rerun your command.\n'))
          );
        } else {
          console.log(pc.yellow('\n⚠️  Fix completed with warnings or non-zero exit code.\n'));
        }
      }
    });
}

function renderFixDiagnostic(diag: LensDiagnostic): void {
  const badge = diag.isRecognized
    ? pc.bgCyan(pc.black(' DEA FIX '))
    : pc.bgYellow(pc.black(' UNRECOGNIZED ERROR '));

  console.log(`\n${badge} ${pc.bold(diag.title)}`);
  console.log(pc.dim(`Category: ${diag.category.toUpperCase()} | Root Cause: ${diag.rootCause}\n`));

  console.log(pc.bold('📝 What happened:'));
  console.log(`   ${diag.summary}\n`);

  if (diag.location) {
    console.log(pc.bold('📍 Location:'));
    console.log(pc.cyan(`   ${diag.location.file}:${diag.location.line}\n`));
  }

  if (diag.collapsedFramesCount > 0) {
    console.log(
      pc.dim(`   [... ${diag.collapsedFramesCount} internal runtime frames collapsed ...]\n`)
    );
  }

  console.log(pc.bold(pc.green('💡 Recommended Solution:')));
  console.log(`   ${diag.remedy.action}`);
  if (diag.remedy.command) {
    console.log(`   ${pc.bold(pc.yellow(`$ ${diag.remedy.command}`))}`);
  }
}
