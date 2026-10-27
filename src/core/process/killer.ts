import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { ok, err, type Result } from '../result.js';

const execAsync = promisify(exec);

export interface ProcessKillOptions {
  timeoutMs?: number;
  force?: boolean;
}

/**
 * Cross-platform process tree termination.
 * On Windows: Uses taskkill.exe /PID <pid> /T /F to guarantee child process trees are terminated.
 * On POSIX: Sends SIGTERM with automatic escalation to SIGKILL.
 */
export async function killProcessTree(
  pid: number,
  options: ProcessKillOptions = {}
): Promise<Result<void, Error>> {
  const timeoutMs = options.timeoutMs ?? 2000;
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    try {
      await execAsync(`taskkill /PID ${pid} /T /F`);
      return ok(undefined);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      // Exit code 128 / "not found" means process already exited
      if (msg.includes('not found') || msg.includes('None of the processes')) {
        return ok(undefined);
      }
      return err(new Error(`Failed to terminate process ${pid} on Windows: ${msg}`));
    }
  }

  // POSIX (macOS / Linux)
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      return ok(undefined); // Process already gone
    }
  }

  // Escalation check
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      process.kill(pid, 0); // Check if alive
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch {
      return ok(undefined); // Exited successfully
    }
  }

  // Force kill if still running
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // Ignored
    }
  }

  return ok(undefined);
}
