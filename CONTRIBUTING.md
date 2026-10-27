# Contributing to DEA

Welcome! We are excited that you want to contribute to DEA (Developer's Everyday Assistant).

DEA is built to be modular, welcoming, and easy to extend. Whether you want to add support for a new language in `dea env`, a new cleanup target in `dea purge`, or an error parser in `dea lens`, this guide will get you set up in minutes.

---

## Code of Conduct

We are committed to providing a friendly, safe, and welcoming environment for everyone, regardless of background or experience level. Be respectful, supportive, and open to feedback.

---

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) >= 20.0.0
- npm >= 10.0.0 (or pnpm / yarn)
- Git

### Steps

1. **Fork and clone the repository:**

   ```bash
   git clone https://github.com/<your-username>/DEA.git
   cd DEA
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Verify the environment:**
   ```bash
   npm run check:fast
   npm test
   ```

---

## Writing a Plugin

DEA's architecture makes contributing new capabilities very straightforward. You only need to implement a single TypeScript interface.

### Example 1: Adding a new Purge Target (e.g. Unity or Go cache)

1. Navigate to `src/modules/purge/plugins/`.
2. Create a new file implementing `PurgePlugin`:
   ```typescript
   import type { PurgePlugin, PurgeTarget, PurgeContext } from '../types.js';
   import { ok, err } from '../../../core/result.js';

   export const goCachePlugin: PurgePlugin = {
     name: 'go-cache',
     description: 'Cleans Go build and module cache',
     async detect(context: PurgeContext): Promise<PurgeTarget[]> {
       // Check if project has go.mod and build artifacts
       // Return discovered targets with path and estimated size
       return [];
     },
     async purge(target: PurgeTarget) {
       // Safe deletion logic
       return ok(undefined);
     }
   };
   ```
3. Register your plugin in `src/modules/purge/plugins/index.ts`.
4. Add a unit test in `tests/modules/purge.test.ts`.

### Example 2: Adding a new Env Scanner (e.g. Ruby or PHP)

1. Navigate to `src/modules/env/scanners/`.
2. Implement `EnvScanner`:
   ```typescript
   import type { EnvScanner, DiscoveredEnvVar } from '../types.js';

   export const rubyScanner: EnvScanner = {
     name: 'ruby',
     supportedExtensions: ['.rb', '.rake'],
     scan(filePath: string, content: string): DiscoveredEnvVar[] {
       // Match ENV['VAR_NAME'] or ENV.fetch('VAR_NAME')
       return [];
     }
   };
   ```
3. Register your scanner in `src/modules/env/scanners/index.ts`.
4. Add a fixture file under `tests/fixtures/env/` and verify with `npm test`.

---

## Pull Request Guidelines

Before submitting your PR, please verify:

1. **Pass all local quality checks:**
   ```bash
   npm run check:pr
   ```
   This runs the linter, strict TypeScript typechecking, and the full test suite.
2. **Commit message format:**
   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat: add poetry .venv detection to purge module`
   - `fix: handle windows EBUSY gracefully during directory deletion`
   - `docs: update quickstart instructions`
   - `test: add fixture for python env scanner`
3. **Keep changes focused:**
   Keep PRs focused on a single feature, bug fix, or documentation improvement.
4. **Cross-platform compatibility:**
   DEA runs on Windows, macOS, and Linux. Avoid Unix-only assumptions (e.g., use `node:path` instead of literal `/`).

Thank you for helping make developers' everyday workflows smoother!
