import { ok, type Result } from '../../core/result.js';
import { runCommand } from '../../core/process/runner.js';
import { defaultParsers } from './parsers/index.js';
import type { ErrorContext, ErrorParser, LensDiagnostic } from './types.js';

export interface LensEngineOptions {
  readonly parsers?: readonly ErrorParser[];
}

export async function diagnoseError(
  context: ErrorContext,
  options: LensEngineOptions = {}
): Promise<Result<LensDiagnostic, Error>> {
  const parsers = options.parsers ?? defaultParsers;

  // 1. Try active parsers by priority
  for (const parser of parsers) {
    if (parser.canParse(context)) {
      try {
        const diag = await parser.parse(context);
        if (diag) {
          return ok(diag);
        }
      } catch {
        // Continue to next parser
      }
    }
  }

  // 2. Layer 3: REA Fallback Rule (Epistemic Unknown - Never Guess)
  const allOutput = `${context.rawStderr}\n${context.rawStdout}`.trim();
  const lines = allOutput.split(/\r?\n/).filter(l => l.trim().length > 0);
  const tailLines = lines.slice(-8);

  const fallbackDiagnostic: LensDiagnostic = {
    id: 'unknown:unrecognized',
    category: 'unknown',
    title: 'Unrecognized Error Pattern',
    summary: 'The process exited with an error that does not match known OS or runtime patterns.',
    rootCause: tailLines[tailLines.length - 1] ?? 'Process failure',
    remedy: {
      action:
        'Help DEA learn this error format! Open a quick issue or PR with this log snippet:\n' +
        'https://github.com/kaushikrawal4365/DEA/issues/new?template=new_plugin.md'
    },
    collapsedFramesCount: 0,
    userFrames: tailLines,
    rawError: allOutput,
    isRecognized: false
  };

  return ok(fallbackDiagnostic);
}

export interface RunWithLensResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly diagnostic?: LensDiagnostic | undefined;
}

export async function runWithLens(
  command: string,
  cwd: string = process.cwd()
): Promise<Result<RunWithLensResult, Error>> {
  const execRes = await runCommand(command, [], {
    cwd,
    shell: true
  });

  if (execRes._tag === 'Err') {
    return ok({
      exitCode: 1,
      stdout: '',
      stderr: execRes.error.message,
      diagnostic: {
        id: 'os:spawn-failure',
        category: 'os',
        title: `Failed to execute: '${command}'`,
        summary: execRes.error.message,
        rootCause: execRes.error.message,
        remedy: {
          action: 'Verify that the command syntax and binary name are correct.'
        },
        collapsedFramesCount: 0,
        userFrames: [],
        rawError: execRes.error.message,
        isRecognized: true
      }
    });
  }

  const { exitCode, stdout, stderr } = execRes.value;

  if (exitCode !== 0) {
    const diagRes = await diagnoseError({
      rawStderr: stderr,
      rawStdout: stdout,
      exitCode,
      command,
      cwd
    });

    return ok({
      exitCode,
      stdout,
      stderr,
      diagnostic: diagRes._tag === 'Ok' ? diagRes.value : undefined
    });
  }

  return ok({
    exitCode: 0,
    stdout,
    stderr
  });
}
