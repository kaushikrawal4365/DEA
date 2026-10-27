import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { runCommand } from '../../core/process/runner.js';

export interface DormancyInfo {
  readonly latestActivityMs: number;
  readonly dormancyDays: number;
  readonly isDormant: boolean;
  readonly isGitRepo: boolean;
  readonly gitClean: boolean;
  readonly hasUnpushedCommits: boolean;
}

const DEFAULT_DORMANT_THRESHOLD_DAYS = 60;

export async function evaluateDormancy(
  projectDir: string,
  thresholdDays: number = DEFAULT_DORMANT_THRESHOLD_DAYS
): Promise<DormancyInfo> {
  const gitDir = path.join(projectDir, '.git');
  let isGitRepo = false;

  try {
    const stat = await fs.stat(gitDir);
    isGitRepo = stat.isDirectory();
  } catch {
    isGitRepo = false;
  }

  if (isGitRepo) {
    const gitInfo = await evaluateGitActivity(projectDir, thresholdDays);
    if (gitInfo) {
      return gitInfo;
    }
  }

  // Fallback: evaluate source file mtimes
  return evaluateFilesystemActivity(projectDir, thresholdDays, isGitRepo);
}

async function evaluateGitActivity(
  projectDir: string,
  thresholdDays: number
): Promise<DormancyInfo | null> {
  try {
    // 1. Get latest commit timestamp
    const logRes = await runCommand('git log -1 --format=%ct', [], {
      cwd: projectDir,
      timeoutMs: 5000
    });

    if (logRes._tag !== 'Ok' || logRes.value.exitCode !== 0) {
      return null;
    }

    const epochSec = parseInt(logRes.value.stdout.trim(), 10);
    if (isNaN(epochSec) || epochSec <= 0) {
      return null;
    }

    const latestActivityMs = epochSec * 1000;
    const now = Date.now();
    const dormancyDays = Math.max(0, Math.floor((now - latestActivityMs) / (1000 * 60 * 60 * 24)));

    // 2. Check for uncommitted changes
    const statusRes = await runCommand('git status --porcelain', [], {
      cwd: projectDir,
      timeoutMs: 5000
    });

    const gitClean = statusRes._tag === 'Ok' && statusRes.value.stdout.trim().length === 0;

    // 3. Check for unpushed commits
    let hasUnpushedCommits = false;
    const branchRes = await runCommand('git status -sb', [], {
      cwd: projectDir,
      timeoutMs: 5000
    });
    if (branchRes._tag === 'Ok') {
      const out = branchRes.value.stdout;
      hasUnpushedCommits = out.includes('[ahead ') || !out.includes('...');
    }

    return {
      latestActivityMs,
      dormancyDays,
      isDormant: dormancyDays >= thresholdDays,
      isGitRepo: true,
      gitClean,
      hasUnpushedCommits
    };
  } catch {
    return null;
  }
}

async function evaluateFilesystemActivity(
  projectDir: string,
  thresholdDays: number,
  isGitRepo: boolean
): Promise<DormancyInfo> {
  let newestMtime = 0;

  try {
    const entries = await fs.readdir(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      // Ignore huge build directories when checking source activity
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === 'target' ||
        entry.name === '.venv'
      ) {
        continue;
      }

      const fullPath = path.join(projectDir, entry.name);
      try {
        const stat = await fs.stat(fullPath);
        if (stat.mtimeMs > newestMtime) {
          newestMtime = stat.mtimeMs;
        }
      } catch {
        // Ignored
      }
    }
  } catch {
    // Ignored
  }

  // If no files were checked or mtime is 0, fall back to project directory mtime
  if (newestMtime === 0) {
    try {
      const stat = await fs.stat(projectDir);
      newestMtime = stat.mtimeMs;
    } catch {
      newestMtime = Date.now();
    }
  }

  const now = Date.now();
  const dormancyDays = Math.max(0, Math.floor((now - newestMtime) / (1000 * 60 * 60 * 24)));

  return {
    latestActivityMs: newestMtime,
    dormancyDays,
    isDormant: dormancyDays >= thresholdDays,
    isGitRepo,
    gitClean: true, // Non-git is treated as clean
    hasUnpushedCommits: !isGitRepo // Highlight non-git projects as unpushed/untracked
  };
}
