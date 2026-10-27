/**
 * Pure domain contracts for the DEA Safe Dev Disk Purge module.
 */

export interface PurgeTarget {
  readonly id: string;
  readonly name: string; // e.g. "node_modules", "target", ".venv"
  readonly path: string; // absolute path to the directory to delete
  readonly projectPath: string; // root folder of the owning project
  readonly projectName: string;
  readonly sizeBytes: number;
  readonly formattedSize: string;
  readonly latestActivityMs: number;
  readonly dormancyDays: number;
  readonly isDormant: boolean; // default threshold: >= 60 days
  readonly isGitRepo: boolean;
  readonly gitClean: boolean;
  readonly hasUnpushedCommits: boolean;
  readonly canRegenerate: boolean;
  readonly manifestFile?: string | undefined; // e.g. "package.json", "Cargo.toml"
  readonly pluginName: string;
}

export interface PurgePlugin {
  readonly name: string;
  readonly targetDirNames: readonly string[];
  detect(projectDir: string, targetName: string): Promise<PurgeTarget | null>;
}

export interface LockedItem {
  readonly path: string;
  readonly reason: string;
}

export interface PurgeExecutionReport {
  readonly target: PurgeTarget;
  readonly success: boolean;
  readonly bytesReclaimed: number;
  readonly lockedItems: readonly LockedItem[];
  readonly error?: string;
}

export interface PurgeScanReport {
  readonly targetDir: string;
  readonly targets: readonly PurgeTarget[];
  readonly totalReclaimableBytes: number;
  readonly formattedTotalSize: string;
  readonly dormantCount: number;
}

export interface PurgeFinalReport {
  readonly scanReport: PurgeScanReport;
  readonly executed: readonly PurgeExecutionReport[];
  readonly totalReclaimedBytes: number;
  readonly formattedReclaimedSize: string;
  readonly isDryRun: boolean;
}
