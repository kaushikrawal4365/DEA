/**
 * Pure domain contracts for the DEA Terminal Crash Lens module.
 */

export type LensCategory = 'os' | 'language' | 'build' | 'unknown';

export interface CodeLocation {
  readonly file: string;
  readonly line: number;
  readonly column?: number | undefined;
}

export interface LensRemedy {
  readonly action: string;
  readonly command?: string | undefined;
}

export interface LensDiagnostic {
  readonly id: string;
  readonly category: LensCategory;
  readonly title: string;
  readonly summary: string;
  readonly rootCause: string;
  readonly location?: CodeLocation | undefined;
  readonly remedy: LensRemedy;
  readonly collapsedFramesCount: number;
  readonly userFrames: readonly string[];
  readonly rawError: string;
  readonly isRecognized: boolean;
}

export interface ErrorContext {
  readonly rawStderr: string;
  readonly rawStdout: string;
  readonly exitCode?: number | undefined;
  readonly command?: string | undefined;
  readonly cwd?: string | undefined;
}

export interface ErrorParser {
  readonly name: string;
  readonly priority: number; // Lower numbers run first (e.g. 10 for OS, 20 for Language, 99 for Fallback)
  canParse(context: ErrorContext): boolean;
  parse(context: ErrorContext): Promise<LensDiagnostic | null>;
}
