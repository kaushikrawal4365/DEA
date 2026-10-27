# DEA Repository Guidelines

## Product Mission & Core Invariants

DEA (Developer's Everyday Assistant) is a local-only developer companion with shared CLI and MCP workflows. It eliminates daily development friction across three pillars:

1. **Environment & Secret Sentinel** (`dea env`)
2. **Safe Dev Bloat & Disk Space Purging** (`dea purge`)
3. **Terminal Crash & Stacktrace Demystifier** (`dea lens`)

### Non-Negotiable Invariants:

1. **Local-Only & Zero-Cloud**: DEA never transmits local code, file paths, project names, or `.env` secrets over the network. No telemetry, no cloud analytics.
2. **Fail-Closed & Non-Destructive**:
   - `dea purge` must NEVER delete files without explicit confirmation unless `--force` is passed.
   - Non-interactive invocations of `dea purge` must default to `--dry-run`.
   - Never mutate or delete tracked Git files.
3. **Epistemic Discipline**:
   - Clearly distinguish **Observations** (file mtime, port number, raw stderr line), **Derivations** (computed dormancy score, collapsed frames), **Inferences** (recommended fix, likely dormant status), and **Unknowns** (unrecognized error patterns).
   - Never guess or hallucinate an explanation when an error pattern is unrecognized; label it explicitly as `Unknown` and guide the user to submit a fixture.
4. **Cross-Platform Parity**:
   - Must operate identically and reliably on Windows (`win32`), macOS (`darwin`), and Linux.
   - Handle Windows file locks (`EBUSY`), process tree termination (`taskkill`), and CRLF/LF line endings gracefully.

---

## Architecture & Dependency Flow

Dependencies flow strictly inward:

```
CLI / TUI / MCP Adapters
          │
          ▼
Application Workflows (Orchestration, Sessions, Caching)
          │
          ▼
Module Engines (src/modules/env, src/modules/purge, src/modules/lens)
          │
          ▼
Domain Contracts, Types & Core Primitives (src/core/)
```

### Composition Rules:

- Core primitives (`src/core/`) must never import from `modules/` or `cli/`.
- Module engines must define clean interfaces (`EnvScanner`, `PurgePlugin`, `ErrorParser`) that plugins implement.
- CLI/TUI formatting code must remain isolated in `src/cli/` and never leak into domain modules.
- All fallible operations must return typed `Result<T, E>`. Never throw uncaught exceptions across module boundaries.

---

## Cross-Platform Engineering Rules

1. **Path Handling**:
   - Always use `node:path` (`path.normalize`, `path.resolve`, `path.join`).
   - Never perform string operations using literal `/` or `\` path separators.
   - Always preserve casing on case-insensitive filesystems (Windows NTFS, macOS APFS default).
2. **File Locking & Deletion**:
   - On Windows, open files or binaries in use cannot be unlinked and throw `EBUSY` or `EPERM`.
   - The deletion engine in `src/modules/purge/` must catch `EBUSY` gracefully, record a failed item with the locked status, and continue cleaning remaining unlocked files without aborting the entire run.
3. **Process Supervision (`src/core/process/`)**:
   - Killing processes on Windows requires terminating the process tree (`taskkill /PID <PID> /T /F`). On POSIX, use `SIGTERM` followed by `SIGKILL` escalation.
   - Never leave orphan or zombie processes.
4. **Line Endings**:
   - All text scanners (`.env`, log parsers) must normalize CRLF (`\r\n`) and LF (`\n`) via `/\r?\n/`.

---

## Performance & Resource Bounds

1. **Memory & I/O Bounds**:
   - File tree traversal for disk purging must stream directory entries (`fs.promises.opendir`) rather than loading millions of files into an in-memory array.
   - Respect `.gitignore` and common ignore patterns (`.git`, `node_modules` during deep traversal) to avoid runaway recursion.
2. **Token & Agent Context Efficiency**:
   - MCP tool responses and CLI summaries must return compact, structured findings rather than dumping thousands of file paths or hundreds of lines of stack traces.
   - Provide pagination or summaries when output exceeds 50 items.

---

## Development & Quality Gates

Pinned toolchain: Node.js LTS (>= 20.0.0), npm >= 10.0.0.

- `npm install`: Install locked dependencies.
- `npm run check:fast`: Typecheck (`tsc --noEmit`) and linting check.
- `npm test`: Run full test suite with Vitest.
- `npm run check:pr`: The full local quality gate (must pass before opening or merging PRs).

### Test Strategy:

- Unit tests for pure logic (`Result<T, E>`, parsers, heuristics).
- Fixture-driven integration tests for `.env` scanning and stacktrace noise reduction under `tests/fixtures/`.
- Lifecycle regression tests for process timeouts, abort signals, and Windows `EBUSY` file locking handling.
