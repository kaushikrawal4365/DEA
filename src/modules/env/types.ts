/**
 * Pure domain contracts for the DEA Environment & Secret Sentinel module.
 */

export interface DiscoveredEnvVar {
  readonly name: string;
  readonly filePath: string;
  readonly line: number;
  readonly rawExpression: string;
  readonly scanner: string;
  readonly hasFallback: boolean;
}

export interface EnvFileEntry {
  readonly key: string;
  readonly value: string;
  readonly line: number;
  readonly hasValue: boolean;
}

export interface ParsedEnvFile {
  readonly filePath: string;
  readonly fileName: string;
  readonly variables: Map<string, EnvFileEntry>;
}

export interface EnvScanner {
  readonly name: string;
  readonly supportedExtensions: readonly string[];
  scan(filePath: string, content: string): DiscoveredEnvVar[];
}

export type SecretSeverity = 'critical' | 'high' | 'medium';

export interface SecretFinding {
  readonly ruleId: string;
  readonly ruleName: string;
  readonly severity: SecretSeverity;
  readonly filePath: string;
  readonly line: number;
  readonly snippet: string;
  readonly redactedMatch: string;
}

export interface SecretRule {
  readonly id: string;
  readonly name: string;
  readonly severity: SecretSeverity;
  readonly pattern: RegExp;
  readonly description: string;
}

export interface UnreadableFile {
  readonly path: string;
  readonly reason: string;
  readonly isCloudOffline: boolean;
}

export interface EnvCheckReport {
  readonly targetDir: string;
  readonly usedVariables: readonly DiscoveredEnvVar[];
  readonly missingFromEnv: ReadonlyArray<{
    readonly name: string;
    readonly usages: readonly DiscoveredEnvVar[];
    readonly hasFallback: boolean;
  }>;
  readonly missingFromExample: readonly string[];
  readonly unusedInEnv: readonly string[];
  readonly envFilesFound: readonly string[];
  readonly unreadableFiles: readonly UnreadableFile[];
  readonly isClean: boolean;
}

export interface SecretScanReport {
  readonly targetDir: string;
  readonly filesScanned: number;
  readonly findings: readonly SecretFinding[];
  readonly unreadableFiles: readonly UnreadableFile[];
  readonly isClean: boolean;
}
