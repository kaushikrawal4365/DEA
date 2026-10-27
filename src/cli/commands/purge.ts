import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { Command } from 'commander';
import pc from 'picocolors';
import { executePurge, scanForPurgeTargets } from '../../modules/purge/engine.js';
import { relativeDisplay } from '../../core/path.js';

export function registerPurgeCommands(parent: Command): void {
  parent
    .command('purge')
    .description('Safely reclaim disk space from dormant build caches and dependencies')
    .argument('[dir]', 'Root directory to scan for projects', '.')
    .option('-d, --dry-run', 'Preview reclaimable space without deleting anything', false)
    .option('-f, --force', 'Purge immediately without interactive confirmation', false)
    .option('--dormant-only', 'Only target projects untouched for 60+ days', false)
    .option('--max-depth <depth>', 'Maximum directory search depth', '5')
    .action(
      async (
        targetDir: string,
        options: {
          dryRun: boolean;
          force: boolean;
          dormantOnly: boolean;
          maxDepth: string;
        }
      ) => {
        const resolvedDir = path.resolve(targetDir);
        console.log(
          pc.cyan(`\n🧹 Scanning for reclaimable build targets in ${pc.bold(resolvedDir)}...\n`)
        );

        const maxDepthNum = parseInt(options.maxDepth, 10) || 5;
        const scanRes = await scanForPurgeTargets(resolvedDir, {
          maxDepth: maxDepthNum,
          dormantOnly: options.dormantOnly
        });

        if (scanRes._tag === 'Err') {
          console.error(pc.red(`❌ Error scanning directories: ${scanRes.error.message}`));
          process.exit(1);
        }

        const report = scanRes.value;

        if (report.targets.length === 0) {
          console.log(
            pc.green('✨ No cleanable build targets found! Your disk is already clean.\n')
          );
          return;
        }

        console.log(pc.bold(`Found ${report.targets.length} target(s) across projects:\n`));

        for (const target of report.targets) {
          const relTarget = relativeDisplay(resolvedDir, target.path);
          const sizeBadge = pc.bold(pc.yellow(`[${target.formattedSize}]`));

          let dormancyBadge = '';
          if (target.isDormant) {
            dormancyBadge = pc.dim(`(${target.dormancyDays}d dormant)`);
          } else if (target.dormancyDays === 0) {
            dormancyBadge = pc.green('(active today)');
          } else {
            dormancyBadge = pc.cyan(`(${target.dormancyDays}d ago)`);
          }

          let gitBadge = '';
          if (!target.isGitRepo) {
            gitBadge = pc.yellow(' [no git]');
          } else if (!target.gitClean) {
            gitBadge = pc.red(' [⚠️ uncommitted]');
          } else if (target.hasUnpushedCommits) {
            gitBadge = pc.yellow(' [⚠️ unpushed]');
          } else {
            gitBadge = pc.dim(' [git: clean]');
          }

          const regenBadge = target.canRegenerate
            ? pc.dim(` [✓ ${target.manifestFile ?? 'regenerable'}]`)
            : pc.red(' [⚠️ no manifest]');

          console.log(
            `  • ${pc.cyan(relTarget)} ${sizeBadge} ${dormancyBadge}${gitBadge}${regenBadge}`
          );
        }

        console.log(
          pc.bold(pc.cyan(`\n💾 Total Reclaimable Space: `) + pc.green(report.formattedTotalSize))
        );

        if (report.dormantCount > 0) {
          console.log(
            pc.dim(`   ${report.dormantCount} target(s) belong to dormant projects (60+ days old).`)
          );
        }

        // Dry-run mode
        if (options.dryRun) {
          console.log(pc.yellow('\nℹ️  Dry-run mode active. No files were modified or deleted.\n'));
          return;
        }

        // Confirmation guard
        if (!options.force) {
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const answer = await rl.question(
            pc.bold(
              pc.yellow(
                `\n⚠️  Are you sure you want to delete these ${report.targets.length} build targets? (y/N): `
              )
            )
          );
          rl.close();

          if (answer.trim().toLowerCase() !== 'y') {
            console.log(pc.dim('\nOperation cancelled. No files were deleted.\n'));
            return;
          }
        }

        // Execute live purge
        console.log(pc.cyan('\n🚀 Purging targets...'));
        const purgeRes = await executePurge(report.targets, { dryRun: false });

        if (purgeRes._tag === 'Err') {
          console.error(pc.red(`❌ Purge execution failed: ${purgeRes.error.message}`));
          process.exit(1);
        }

        const finalReport = purgeRes.value;
        console.log(
          pc.bold(
            pc.green(
              `\n✨ Successfully reclaimed ${finalReport.formattedReclaimedSize} of disk space!\n`
            )
          )
        );

        // Check if any items were locked
        const allLocked = finalReport.executed.flatMap(e => e.lockedItems);
        if (allLocked.length > 0) {
          console.log(
            pc.yellow(
              `⚠️  Notice: ${allLocked.length} file(s) were locked by other processes and skipped.`
            )
          );
          for (const item of allLocked.slice(0, 3)) {
            console.log(pc.dim(`   • ${relativeDisplay(resolvedDir, item.path)}: ${item.reason}`));
          }
          console.log('');
        }
      }
    );
}
