import type { LensCategory, LensDiagnostic } from './types.js';

export interface ErrorFingerprint {
  readonly id: string;
  readonly title: string | ((vars: Record<string, string>) => string);
  readonly category: LensCategory;
  readonly matchAll?: readonly string[];
  readonly matchAny?: readonly string[];
  readonly extract?: Record<string, RegExp>;
  readonly rootCause: string | ((vars: Record<string, string>) => string);
  readonly summary: string | ((vars: Record<string, string>) => string);
  readonly remedyAction: string | ((vars: Record<string, string>) => string);
  readonly remedyCommand?:
    string | ((vars: Record<string, string>) => string | undefined) | undefined;
}

export const defaultFingerprints: readonly ErrorFingerprint[] = [
  // 1. npm Missing Script
  {
    id: 'npm-missing-script',
    title: vars => (vars.script ? `Missing npm script: "${vars.script}"` : 'Missing npm script'),
    category: 'build',
    matchAll: ['Missing script:'],
    extract: {
      script: /Missing script:\s*["']?([^"'\r\n]+?)["']?(?:\r?\n|$)/
    },
    rootCause: vars => `Script "${vars.script ?? 'unknown'}" is not defined in package.json`,
    summary: vars =>
      `npm cannot find "${vars.script ?? 'the specified script'}" in the "scripts" section of package.json.`,
    remedyAction: vars =>
      `Add "${vars.script ?? 'your script'}" to the "scripts" object in package.json, or run "npm run" to see available scripts.`,
    remedyCommand: 'npm run'
  },

  // 2. Docker Port Collision
  {
    id: 'docker-port-allocated',
    title: vars =>
      vars.port ? `Docker Port Collision on :${vars.port}` : 'Docker Port Already Allocated',
    category: 'os',
    matchAll: ['failed to bind port', 'address already in use'],
    extract: {
      port: /:(\d{2,5})\b/
    },
    rootCause: vars => `Docker container cannot bind to port ${vars.port ?? 'specified'}`,
    summary: vars =>
      `A local service or existing Docker container is already using port ${vars.port ?? 'specified'}.`,
    remedyAction: _vars =>
      `Stop the conflicting container or change the host port mapping in docker-compose.yml.`,
    remedyCommand: vars =>
      process.platform === 'win32'
        ? `netstat -ano | findstr :${vars.port ?? '3000'}`
        : `docker ps --filter "publish=${vars.port ?? '3000'}"`
  },

  // 3. Git Merge Conflict / Push Rejected
  {
    id: 'git-push-rejected',
    title: 'Git Push Rejected (Non-Fast-Forward)',
    category: 'build',
    matchAll: ['[rejected]', 'failed to push some refs'],
    rootCause: 'Remote repository contains commits that you do not have locally',
    summary:
      'Updates were rejected because the remote branch has newer commits than your local branch.',
    remedyAction: 'Pull and integrate the remote changes before pushing again.',
    remedyCommand: 'git pull --rebase origin main'
  },

  // 4. Prisma Unique Constraint
  {
    id: 'prisma-p2002',
    title: 'Database Unique Constraint Violation (P2002)',
    category: 'database',
    matchAll: ['Unique constraint failed', 'P2002'],
    rootCause: 'Attempted to insert a duplicate record into a unique column/index',
    summary: 'A database query failed because a unique constraint was violated.',
    remedyAction:
      'Ensure unique fields (like email or username) are unique before executing the mutation.'
  },

  // 5. Vite / Rollup Unresolved Import
  {
    id: 'vite-unresolved-import',
    title: 'Vite/Rollup Failed to Resolve Import',
    category: 'build',
    matchAll: ['Failed to resolve import', 'Does the file exist?'],
    extract: {
      importTarget: /Failed to resolve import "([^"]+)"/
    },
    rootCause: vars => `Cannot find module or file '${vars.importTarget ?? 'unknown'}'`,
    summary: vars => `Vite bundler cannot resolve import '${vars.importTarget ?? 'unknown'}'.`,
    remedyAction: vars =>
      `Verify that '${vars.importTarget}' exists on disk or install it via npm.`,
    remedyCommand: vars =>
      vars.importTarget && !vars.importTarget.startsWith('.')
        ? `npm install ${vars.importTarget}`
        : undefined
  },

  // 6. Python Virtualenv Not Activated
  {
    id: 'python-no-module-venv',
    title: vars =>
      vars.module
        ? `Python Missing Module: '${vars.module}'`
        : 'Python Package Missing / Virtualenv Not Activated',
    category: 'language',
    matchAll: ['ModuleNotFoundError'],
    extract: {
      module: /No module named ['"]([^'"]+)['"]/
    },
    rootCause: vars =>
      `Module '${vars.module ?? 'unknown'}' is not installed in the active Python environment`,
    summary: vars =>
      `Python cannot find '${vars.module}'. If you installed it, your virtualenv may not be active.`,
    remedyAction: _vars => `Activate your virtual environment (.venv) or install the package.`,
    remedyCommand: _vars =>
      _vars.module ? `pip install ${_vars.module}` : 'pip install -r requirements.txt'
  }
];

export function matchFingerprint(
  rawText: string,
  fingerprints: readonly ErrorFingerprint[] = defaultFingerprints
): LensDiagnostic | null {
  for (const fp of fingerprints) {
    // Check matchAll
    if (fp.matchAll) {
      const allMatch = fp.matchAll.every(kw => rawText.includes(kw));
      if (!allMatch) continue;
    }

    // Check matchAny
    if (fp.matchAny) {
      const anyMatch = fp.matchAny.some(kw => rawText.includes(kw));
      if (!anyMatch) continue;
    }

    // Extract variables
    const vars: Record<string, string> = {};
    if (fp.extract) {
      for (const [key, regex] of Object.entries(fp.extract)) {
        const match = rawText.match(regex);
        if (match && match[1]) {
          vars[key] = match[1];
        }
      }
    }

    const title = typeof fp.title === 'function' ? fp.title(vars) : fp.title;
    const rootCause = typeof fp.rootCause === 'function' ? fp.rootCause(vars) : fp.rootCause;
    const summary = typeof fp.summary === 'function' ? fp.summary(vars) : fp.summary;
    const action = typeof fp.remedyAction === 'function' ? fp.remedyAction(vars) : fp.remedyAction;
    const command =
      typeof fp.remedyCommand === 'function' ? fp.remedyCommand(vars) : fp.remedyCommand;

    return {
      id: `fp:${fp.id}`,
      category: fp.category,
      title,
      summary,
      rootCause,
      remedy: {
        action,
        ...(command ? { command } : {})
      },
      collapsedFramesCount: 0,
      userFrames: [],
      rawError: rawText.trim(),
      isRecognized: true
    };
  }

  return null;
}
