import { describe, it, expect } from 'vitest';
import { diagnoseError } from '../../src/modules/lens/engine.js';
import { matchFingerprint } from '../../src/modules/lens/fingerprints.js';
import { getLastShellCommand } from '../../src/modules/lens/history.js';
import { isOk, unwrap } from '../../src/core/result.js';

describe('Terminal Crash Lens Engine', () => {
  it('diagnoses EADDRINUSE port collisions', async () => {
    const rawError = `
      Error: listen EADDRINUSE: address already in use :::3000
          at Server.setupListenHandle [as _listen2] (node:net:1904:16)
          at listenInCluster (node:net:1961:12)
    `;

    const res = await diagnoseError({ rawStderr: rawError, rawStdout: '' });
    expect(isOk(res)).toBe(true);

    const diag = unwrap(res);
    expect(diag.category).toBe('os');
    expect(diag.title).toContain('Port 3000');
    expect(diag.isRecognized).toBe(true);
    expect(diag.remedy.command).toBeDefined();
  });

  it('diagnoses Out Of Memory crashes', async () => {
    const rawError = `
      <--- Last few GCs --->
      [1234:0x1234] FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory
    `;

    const res = await diagnoseError({ rawStderr: rawError, rawStdout: '', exitCode: 137 });
    expect(isOk(res)).toBe(true);

    const diag = unwrap(res);
    expect(diag.category).toBe('os');
    expect(diag.title).toContain('Out of Memory');
    expect(diag.remedy.command).toContain('max-old-space-size');
  });

  it('diagnoses missing npm packages', async () => {
    const rawError = `
      node:internal/modules/cjs/loader:1228
        throw err;
        ^
      Error: Cannot find module 'express'
      Require stack:
      - /app/src/server.ts
          at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)
    `;

    const res = await diagnoseError({ rawStderr: rawError, rawStdout: '' });
    expect(isOk(res)).toBe(true);

    const diag = unwrap(res);
    expect(diag.category).toBe('language');
    expect(diag.title).toContain("'express'");
    expect(diag.remedy.command).toBe('npm install express');
  });

  it('de-noises V8 stack traces and isolates user code line', async () => {
    const rawError = `
      TypeError: Cannot read properties of undefined (reading 'token')
          at authenticateUser (/app/src/auth.ts:42:18)
          at Layer.handle [as handle_request] (/app/node_modules/express/lib/router/layer.js:95:5)
          at trim_prefix (/app/node_modules/express/lib/router/index.js:328:13)
          at /app/node_modules/express/lib/router/index.js:286:9
          at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
    `;

    const res = await diagnoseError({ rawStderr: rawError, rawStdout: '' });
    expect(isOk(res)).toBe(true);

    const diag = unwrap(res);
    expect(diag.category).toBe('language');
    expect(diag.location?.file).toBe('/app/src/auth.ts');
    expect(diag.location?.line).toBe(42);
    expect(diag.collapsedFramesCount).toBeGreaterThanOrEqual(4);
    expect(diag.userFrames.some(f => f.includes('authenticateUser'))).toBe(true);
  });

  it('diagnoses missing Python packages and de-noises tracebacks', async () => {
    const rawError = `
      Traceback (most recent call last):
        File "/env/lib/python3.11/site-packages/pkg_resources/__init__.py", line 123, in <module>
          import something
        File "/app/src/main.py", line 15, in <module>
          import requests
      ModuleNotFoundError: No module named 'requests'
    `;

    const res = await diagnoseError({ rawStderr: rawError, rawStdout: '' });
    expect(isOk(res)).toBe(true);

    const diag = unwrap(res);
    expect(diag.category).toBe('language');
    expect(diag.title).toContain("'requests'");
    expect(diag.remedy.command).toBe('pip install requests');
  });

  it('falls back safely to Epistemic Unknown when error is unrecognized', async () => {
    const rawError = `
      [custom-tool] Strange internal error code 99824
      something completely unexpected happened
    `;

    const res = await diagnoseError({ rawStderr: rawError, rawStdout: '' });
    expect(isOk(res)).toBe(true);

    const diag = unwrap(res);
    expect(diag.isRecognized).toBe(false);
    expect(diag.category).toBe('unknown');
    expect(diag.remedy.action).toContain('github.com');
  });
});

describe('Multi-Anchor Error Fingerprints', () => {
  it('matches Docker port collision', () => {
    const raw =
      'docker: Error response from daemon: failed to bind port 0.0.0.0:8080: address already in use';
    const diag = matchFingerprint(raw);
    expect(diag).not.toBeNull();
    expect(diag?.title).toContain('Docker Port');
    expect(diag?.summary).toContain('8080');
  });

  it('matches Git push rejected non-fast-forward', () => {
    const raw =
      '! [rejected] main -> main (non-fast-forward) error: failed to push some refs to git';
    const diag = matchFingerprint(raw);
    expect(diag).not.toBeNull();
    expect(diag?.title).toContain('Git Push Rejected');
    expect(diag?.remedy.command).toContain('git pull --rebase');
  });

  it('matches Vite unresolved import', () => {
    const raw =
      '[vite] Failed to resolve import "lodash" from "src/index.ts". Does the file exist?';
    const diag = matchFingerprint(raw);
    expect(diag).not.toBeNull();
    expect(diag?.title).toContain('Vite/Rollup Failed to Resolve Import');
    expect(diag?.remedy.command).toBe('npm install lodash');
  });
});

describe('Shell History Reader', () => {
  it('safely attempts to read shell history without throwing', async () => {
    const lastCmd = await getLastShellCommand();
    // Either returns null or a valid command
    if (lastCmd) {
      expect(typeof lastCmd.command).toBe('string');
      expect(typeof lastCmd.historySource).toBe('string');
    }
  });
});
