# Cross-Platform Invariants & Architecture

DEA is designed from day one to operate with 100% parity across **Windows**, **macOS**, and **Linux**.

Writing cross-platform systems software in Node.js requires understanding where POSIX assumptions break down on Windows and vice versa. This document catalogs the core invariants enforced across the codebase.

---

## 1. File Deletion & Windows File Locking

### The POSIX vs. Windows Difference

- **POSIX (Linux / macOS)**: You can unlink a file even if another running process has an open file descriptor pointing to it. The directory entry is removed immediately, and disk blocks are freed once the process closes the descriptor.
- **Windows (NTFS)**: If any process (or antivirus, IDE indexer, or terminal) has an open handle to a file without `FILE_SHARE_DELETE`, attempting to delete it throws:
  - `EBUSY: resource busy or locked`
  - `EPERM: operation not permitted`

### DEA Invariant:

In `src/modules/purge/`:

1. When purging a directory (e.g. `node_modules` or `.venv`), wrap deletions with retry logic and handle `EBUSY`/`EPERM` gracefully.
2. If a specific file or folder cannot be unlocked after retry, record it in the purge summary as a locked resource rather than crashing the entire process:
   ```typescript
   export interface PurgeResult {
     reclaimedBytes: number;
     deletedCount: number;
     lockedItems: Array<{ path: string; reason: string }>;
   }
   ```
3. Never use blind shell `rm -rf` commands directly. Always use DEA's safe deletion engine (`src/core/fs/delete.ts`).

---

## 2. Process Tree Supervision & Termination

### The POSIX vs. Windows Difference

- **POSIX**: Signals (`SIGTERM`, `SIGKILL`) can be delivered to process groups via negative PIDs (`-PID`).
- **Windows**: Windows does not natively have POSIX signals. Sending `SIGTERM` in Node.js on Windows terminates the target process abruptly without notifying its child processes. If a parent tool spawns child compilers or watchers, killing the parent leaves orphaned child processes running indefinitely.

### DEA Invariant:

In `src/core/process/killer.ts`:

- On Windows: Use `taskkill.exe /PID <PID> /T /F` where:
  - `/T`: Terminates the specified process and any child processes started by it (entire process tree).
  - `/F`: Forcefully terminates the processes.
- On POSIX: Send `SIGTERM` to the process group, wait with a configurable timeout (e.g., 2000ms), and escalate to `SIGKILL` if the process family has not exited.

---

## 3. Path Normalization & Preservation

### The Invariants:

1. **Never use string splitting on `/` or `\`:**
   - Always use `node:path` methods: `path.resolve()`, `path.relative()`, `path.normalize()`, `path.join()`.
2. **Case Sensitivity Awareness:**
   - Windows (NTFS) and macOS (default APFS) are case-insensitive but case-preserving.
   - Linux is case-sensitive.
   - When comparing file paths (e.g. in `.env` scanners or purge targets), use normalized, resolved paths.

---

## 4. Socket & Port Conflict Inspection

When diagnosing `EADDRINUSE` / `WSAEADDRINUSE`:

- **Windows**: Query TCP connections via `netstat -ano -p tcp` to find the owning PID.
- **macOS / Linux**: Query via `lsof -nP -iTCP:<port> -sTCP:LISTEN` or `ss -tulpn`.
- All methods are abstracted behind `findProcessByPort(port: number): Promise<Result<ProcessInfo, ProcessLookupError>>`.

---

## 5. Line Endings (CRLF vs LF)

Files generated on Windows often contain CRLF (`\r\n`), while Linux/macOS files use LF (`\n`).

- All text parsers (`.env` parser, stack trace parser, configuration parser) must split on `/\r?\n/`.
