import * as path from 'node:path';
import * as readline from 'node:readline/promises';
import { Command } from 'commander';
import pc from 'picocolors';
import * as p from '@clack/prompts';
import { executePurge, scanForPurgeTargets } from '../../modules/purge/engine.js';
import { relativeDisplay } from '../../core/path.js';
import type { PurgeTarget } from '../../modules/purge/types.js';

function parseSizeToBytes(str?: string): number | null {
  if (!str) return null;
  const match = str.trim().match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?$/);
  if (!match || !match[1]) return null;
  const num = parseFloat(match[1]);
  const unit = (match[2] ?? 'B').toUpperCase();
  if (unit.startsWith('G')) return num * 1024 * 1024 * 1024;
  if (unit.startsWith('M')) return num * 1024 * 1024;
  if (unit.startsWith('K')) return num * 1024;
  return num;
}

export function registerPurgeCommands(parent: Command): void {
  parent
    .command('purge')
    .description('Safely reclaim disk space from dormant build caches and dependencies')
    .argument('[dir]', 'Root directory to scan for projects', '.')
    .option('-d, --dry-run', 'Preview reclaimable space without deleting anything', false)
    .option('-f, --force', 'Purge immediately without interactive confirmation', false)
    .option('-i, --interactive', 'Interactively pick which targets to purge', false)
    .option('--min-size <size>', 'Filter targets by minimum size (e.g. 50MB, 1GB)')
    .option('--dormant-only', 'Only target projects untouched for 60+ days', false)
    .option('--max-depth <depth>', 'Maximum directory search depth', '5')
    .action(
      async (
        targetDir: string,
        options: {
          dryRun: boolean;
          force: boolean;
          interactive: boolean;
          minSize?: string;
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

        let targets = scanRes.value.targets;

        // Apply min-size filter if specified
        if (options.minSize) {
          const minBytes = parseSizeToBytes(options.minSize);
          if (minBytes !== null) {
            targets = targets.filter(t => t.sizeBytes >= minBytes);
          }
        }

        if (targets.length === 0) {
          console.log(
            pc.green('✨ No cleanable build targets found! Your disk is already clean.\n')
          );
          return;
        }

        console.log(pc.bold(`Found ${targets.length} target(s) across projects:\n`));

        for (const target of targets) {
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

        const dormantCount = targets.filter(t => t.isDormant).length;
        console.log(
          pc.bold(
            pc.cyan(`\n💾 Total Reclaimable Space: `) + pc.green(scanRes.value.formattedTotalSize)
          )
        );

        if (dormantCount > 0) {
          console.log(
            pc.dim(`   ${dormantCount} target(s) belong to dormant projects (60+ days old).`)
          );
        }

        // Dry-run mode
        if (options.dryRun) {
          console.log(pc.yellow('\nℹ️  Dry-run mode active. No files were modified or deleted.\n'));
          return;
        }

        let targetsToPurge: readonly PurgeTarget[] = targets;

        // Interactive Selection or Confirmation Guard
        if (!options.force) {
          const isInteractiveTerminal = process.stdout.isTTY && !process.env.CI;

          if (isInteractiveTerminal && (options.interactive || targets.length > 1)) {
            const selectedPaths = await p.multiselect({
              message: 'Select targets to purge (Space to toggle, Enter to confirm):',
              options: targets.map(t => ({
                value: t.path,
                label: `${relativeDisplay(resolvedDir, t.path)} [${t.formattedSize}]`,
                ...(t.isDormant ? { hint: `${t.dormancyDays}d dormant` } : {})
              })),
              initialValues: targets.filter(t => t.isDormant).map(t => t.path),
              required: false
            });

            if (p.isCancel(selectedPaths)) {
              p.cancel('Operation cancelled. No files were deleted.');
              return;
            }

            const chosenSet = new Set(selectedPaths as string[]);
            targetsToPurge = targets.filter(t => chosenSet.has(t.path));

            if (targetsToPurge.length === 0) {
              console.log(pc.yellow('\nNo targets selected. Nothing was deleted.\n'));
              return;
            }
          } else {
            const rl = readline.createInterface({
              input: process.stdin,
              output: process.stdout
            });

            const answer = await rl.question(
              pc.bold(
                pc.yellow(
                  `\n⚠️  Are you sure you want to delete these ${targets.length} build target(s)? (y/N): `
                )
              )
            );
            rl.close();

            if (answer.trim().toLowerCase() !== 'y') {
              console.log(pc.dim('\nOperation cancelled. No files were deleted.\n'));
              return;
            }
          }
        }

        // Execute live purge
        console.log(pc.cyan('\n🚀 Purging targets...'));
        const purgeRes = await executePurge(targetsToPurge, { dryRun: false });

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
