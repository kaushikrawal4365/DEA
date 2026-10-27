import * as fs from 'node:fs/promises';
import { Command } from 'commander';
import pc from 'picocolors';
import { diagnoseError, runWithLens } from '../../modules/lens/engine.js';
import type { LensDiagnostic } from '../../modules/lens/types.js';

export function registerLensCommands(parent: Command): void {
  parent
    .command('lens')
    .description('De-noise terminal errors and isolate root-cause diagnostics')
    .argument('[input]', 'Error log file path or raw error string (or pipe via stdin)')
    .action(async (input?: string) => {
      let rawText = '';

      if (input) {
        // Check if input is a file path
        try {
          const stat = await fs.stat(input);
          if (stat.isFile()) {
            rawText = await fs.readFile(input, 'utf-8');
          }
        } catch {
          // Input is raw text argument
          rawText = input;
        }
      } else {
        // Read from stdin (piped input)
        rawText = await readFromStdin();
      }

      if (!rawText || rawText.trim().length === 0) {
        console.log(
          pc.yellow(
            '⚠️  No error input provided. Pass a file path, error string, or pipe via stdin.'
          )
        );
        console.log(pc.dim('   Example: dea lens "Error: listen EADDRINUSE :::3000"'));
        console.log(pc.dim('   Example: npm test | dea lens\n'));
        return;
      }

      const diagRes = await diagnoseError({
        rawStderr: rawText,
        rawStdout: ''
      });

      if (diagRes._tag === 'Ok') {
        renderDiagnostic(diagRes.value);
      }
    });

  parent
    .command('run')
    .description('Run a command under DEA Lens supervision (diagnoses errors on failure)')
    .argument('<command...>', 'The command to execute (e.g. "npm run dev")')
    .action(async (commandParts: string[]) => {
      const fullCommand = commandParts.join(' ');
      console.log(pc.cyan(`\n⚡ DEA supervising: ${pc.bold(fullCommand)}\n`));

      const res = await runWithLens(fullCommand);
      if (res._tag === 'Ok') {
        if (res.value.diagnostic) {
          console.log(pc.red('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
          renderDiagnostic(res.value.diagnostic);
          process.exit(res.value.exitCode || 1);
        }
      }
    });
}

function renderDiagnostic(diag: LensDiagnostic): void {
  const badge = diag.isRecognized
    ? pc.bgCyan(pc.black(' DEA LENS '))
    : pc.bgYellow(pc.black(' UNRECOGNIZED ERROR '));

  console.log(`\n${badge} ${pc.bold(diag.title)}`);
  console.log(pc.dim(`Category: ${diag.category.toUpperCase()} | Root Cause: ${diag.rootCause}\n`));

  console.log(pc.bold('📝 Summary:'));
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

  if (diag.userFrames.length > 0) {
    console.log(pc.bold('🔍 Key Trace Frames:'));
    for (const frame of diag.userFrames.slice(0, 4)) {
      console.log(pc.dim(`   ${frame}`));
    }
    console.log('');
  }

  console.log(pc.bold(pc.green('💡 Remedy:')));
  console.log(`   ${diag.remedy.action}`);
  if (diag.remedy.command) {
    console.log(`   ${pc.bold(pc.yellow(`$ ${diag.remedy.command}`))}`);
  }
  console.log('');
}

async function readFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }

  return new Promise(resolve => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
    // Set 2s timeout in case stdin is open but empty
    setTimeout(() => {
      resolve(data);
    }, 2000);
  });
}
