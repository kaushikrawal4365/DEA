import { runCommand } from '../../core/process/runner.js';

export interface PortProcessInfo {
  readonly port: number;
  readonly pid: number;
  readonly killCommand: string;
}

/**
 * Cross-platform TCP port ownership resolver.
 * Windows: netstat -ano -p tcp
 * POSIX: lsof -nP -iTCP:<port> -sTCP:LISTEN
 */
export async function findProcessHoldingPort(port: number): Promise<PortProcessInfo | null> {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    try {
      const res = await runCommand(`netstat -ano -p tcp`, [], { timeoutMs: 3000 });
      if (res._tag !== 'Ok' || res.value.exitCode !== 0) {
        return null;
      }

      const lines = res.value.stdout.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        // Look for lines containing LISTENING and :<port>
        if (trimmed.includes('LISTENING') && trimmed.includes(`:${port}`)) {
          const parts = trimmed.split(/\s+/);
          const pidStr = parts[parts.length - 1];
          const pid = parseInt(pidStr ?? '', 10);
          if (!isNaN(pid) && pid > 0) {
            return {
              port,
              pid,
              killCommand: `taskkill /PID ${pid} /F`
            };
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  // POSIX (macOS / Linux)
  try {
    const res = await runCommand(`lsof -nP -iTCP:${port} -sTCP:LISTEN`, [], { timeoutMs: 3000 });
    if (res._tag === 'Ok' && res.value.exitCode === 0) {
      const lines = res.value.stdout.trim().split(/\r?\n/);
      if (lines.length >= 2) {
        const parts = lines[1]?.split(/\s+/) ?? [];
        const pid = parseInt(parts[1] ?? '', 10);
        if (!isNaN(pid) && pid > 0) {
          return {
            port,
            pid,
            killCommand: `kill -9 ${pid}`
          };
        }
      }
    }
  } catch {
    return null;
  }

  return null;
}
