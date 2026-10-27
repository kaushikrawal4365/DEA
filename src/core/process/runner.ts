import { spawn, type SpawnOptions } from 'node:child_process';
import { ok, err, type Result } from '../result.js';
import { killProcessTree } from './killer.js';

export interface CommandExecutionResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

export interface RunCommandOptions extends SpawnOptions {
  readonly timeoutMs?: number;
  readonly maxBufferSize?: number;
  readonly abortSignal?: AbortSignal;
}

/**
 * Executes a command with process tree supervision, strict timeout, and bounded buffers.
 */
export async function runCommand(
  command: string,
  args: string[] = [],
  options: RunCommandOptions = {}
): Promise<Result<CommandExecutionResult, Error>> {
  return new Promise(resolve => {
    const startTime = Date.now();
    const timeoutMs = options.timeoutMs ?? 30000;
    const maxBufferSize = options.maxBufferSize ?? 10 * 1024 * 1024; // 10MB limit

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let completed = false;

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(command, args, {
        ...options,
        shell: options.shell ?? true
      });
    } catch (e: unknown) {
      const error = e instanceof Error ? e : new Error(String(e));
      return resolve(err(error));
    }

    const timer = setTimeout(async () => {
      if (!completed && child.pid) {
        timedOut = true;
        await killProcessTree(child.pid);
      }
    }, timeoutMs);

    if (options.abortSignal) {
      options.abortSignal.addEventListener('abort', async () => {
        if (!completed && child.pid) {
          await killProcessTree(child.pid);
        }
      });
    }

    child.stdout?.on('data', chunk => {
      if (stdout.length < maxBufferSize) {
        stdout += chunk.toString();
      }
    });

    child.stderr?.on('data', chunk => {
      if (stderr.length < maxBufferSize) {
        stderr += chunk.toString();
      }
    });

    child.on('error', error => {
      if (!completed) {
        completed = true;
        clearTimeout(timer);
        resolve(err(error));
      }
    });

    child.on('close', code => {
      if (!completed) {
        completed = true;
        clearTimeout(timer);
        resolve(
          ok({
            exitCode: code ?? (timedOut ? 124 : 1),
            stdout,
            stderr,
            durationMs: Date.now() - startTime,
            timedOut
          })
        );
      }
    });
  });
}
