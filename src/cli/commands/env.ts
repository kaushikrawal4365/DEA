import * as path from 'node:path';
import { Command } from 'commander';
import pc from 'picocolors';
import { checkEnvironment, scanSecrets } from '../../modules/env/engine.js';
import { relativeDisplay } from '../../core/path.js';

export function registerEnvCommands(parent: Command): void {
  const envCmd = parent
    .command('env')
    .description('Inspect, validate, and secure environment variables and secrets');

  envCmd
    .command('check')
    .description('Check for missing, dead, and unsynced environment variables')
    .argument('[dir]', 'Directory to check', '.')
    .option('--strict', 'Fail even if missing variables have fallback values', false)
    .action(async (targetDir: string, options: { strict: boolean }) => {
      const resolvedDir = path.resolve(targetDir);
      console.log(pc.cyan(`\n🔍 Checking environment variables in ${pc.bold(resolvedDir)}...\n`));

      const result = await checkEnvironment(resolvedDir);
      if (result._tag === 'Err') {
        console.error(pc.red(`❌ Error checking environment: ${result.error.message}`));
        process.exit(1);
      }

      const report = result.value;

      // 1. Env files found
      if (report.envFilesFound.length === 0) {
        console.log(pc.yellow('⚠️  No .env files found in the project.'));
      } else {
        console.log(
          pc.dim('📁 Env files found: ') +
            report.envFilesFound.map(f => pc.green(relativeDisplay(resolvedDir, f))).join(', ')
        );
      }

      console.log(
        pc.dim('📊 Used in code: ') + pc.bold(`${report.usedVariables.length} variable accesses`)
      );

      // 2. Critical Missing variables
      const criticalMissing = report.missingFromEnv.filter(m => !m.hasFallback);
      const fallbackMissing = report.missingFromEnv.filter(m => m.hasFallback);

      let hasFailures = false;

      if (criticalMissing.length > 0) {
        hasFailures = true;
        console.log(pc.red(`\n🚨 Missing Required Variables (${criticalMissing.length}):`));
        console.log(
          pc.dim('These variables are used in code without fallbacks and missing from .env:')
        );
        for (const item of criticalMissing) {
          console.log(`  ${pc.bold(pc.red('• ' + item.name))}`);
          for (const usage of item.usages) {
            const relPath = relativeDisplay(resolvedDir, usage.filePath);
            console.log(pc.dim(`     at ${relPath}:${usage.line} (${usage.rawExpression})`));
          }
        }
      }

      // 3. Optional Missing (has fallback)
      if (fallbackMissing.length > 0) {
        if (options.strict) {
          hasFailures = true;
        }
        console.log(
          pc.yellow(`\n⚠️  Missing from .env (has code fallback) (${fallbackMissing.length}):`)
        );
        for (const item of fallbackMissing) {
          console.log(`  ${pc.bold(pc.yellow('• ' + item.name))}`);
          for (const usage of item.usages) {
            const relPath = relativeDisplay(resolvedDir, usage.filePath);
            console.log(pc.dim(`     at ${relPath}:${usage.line}`));
          }
        }
      }

      // 4. Missing from .env.example
      if (report.missingFromExample.length > 0) {
        console.log(
          pc.yellow(`\n📝 Missing from .env.example (${report.missingFromExample.length}):`)
        );
        console.log(pc.dim('Teammates pulling this repo will not know they need these:'));
        for (const name of report.missingFromExample) {
          console.log(pc.yellow(`  • ${name}`));
        }
      }

      // 5. Unused variables in .env
      if (report.unusedInEnv.length > 0) {
        console.log(
          pc.dim(`\n💡 Defined in .env but unused in code (${report.unusedInEnv.length}):`)
        );
        for (const name of report.unusedInEnv) {
          console.log(pc.dim(`  • ${name}`));
        }
      }

      console.log('');
      if (hasFailures) {
        console.log(pc.red('❌ Environment check failed with errors.'));
        process.exit(1);
      } else {
        console.log(pc.green('✨ Environment is clean! All required variables are configured.\n'));
      }
    });

  envCmd
    .command('scan')
    .description('Scan project files for hardcoded secrets and tokens')
    .argument('[dir]', 'Directory to scan', '.')
    .action(async (targetDir: string) => {
      const resolvedDir = path.resolve(targetDir);
      console.log(pc.cyan(`\n🔒 Scanning for hardcoded secrets in ${pc.bold(resolvedDir)}...\n`));

      const result = await scanSecrets(resolvedDir);
      if (result._tag === 'Err') {
        console.error(pc.red(`❌ Error scanning secrets: ${result.error.message}`));
        process.exit(1);
      }

      const report = result.value;
      console.log(pc.dim(`Scanned ${report.filesScanned} files.`));

      if (report.findings.length === 0) {
        console.log(pc.green('✨ No exposed secrets found! Clean.\n'));
        return;
      }

      console.log(pc.red(`\n🚨 Potential Secrets Detected (${report.findings.length}):\n`));

      for (const finding of report.findings) {
        const badge =
          finding.severity === 'critical'
            ? pc.bgRed(pc.white(' CRITICAL '))
            : pc.bgYellow(pc.black(' HIGH '));

        const relPath = relativeDisplay(resolvedDir, finding.filePath);
        console.log(
          `${badge} ${pc.bold(finding.ruleName)} in ${pc.cyan(`${relPath}:${finding.line}`)}`
        );
        console.log(pc.dim(`  Secret: ${finding.redactedMatch}`));
        console.log(pc.dim(`  Snippet: ${finding.snippet}\n`));
      }

      console.log(
        pc.red('❌ Commit blocked: remove hardcoded secrets and use environment variables.\n')
      );
      process.exit(1);
    });
}
