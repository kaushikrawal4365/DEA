import type { CodeLocation, ErrorContext, ErrorParser, LensDiagnostic } from '../types.js';

export const nodeParser: ErrorParser = {
  name: 'node-v8',
  priority: 20,

  canParse(ctx: ErrorContext): boolean {
    const text = `${ctx.rawStderr}\n${ctx.rawStdout}`;
    return (
      text.includes('MODULE_NOT_FOUND') ||
      text.includes('Cannot find module') ||
      text.includes('TypeError:') ||
      text.includes('ReferenceError:') ||
      text.includes('SyntaxError:') ||
      /at\s+.*\(.*:\d+:\d+\)/.test(text)
    );
  },

  async parse(ctx: ErrorContext): Promise<LensDiagnostic | null> {
    const text = `${ctx.rawStderr}\n${ctx.rawStdout}`;

    // 1. Missing Module
    if (text.includes('MODULE_NOT_FOUND') || text.includes('Cannot find module')) {
      const match = text.match(/Cannot find module ['"]([^'"]+)['"]/);
      const moduleName = match ? match[1] : 'unknown-package';

      const isLocalPath = moduleName?.startsWith('.') || moduleName?.startsWith('/');
      const remedyCmd = isLocalPath ? undefined : `npm install ${moduleName}`;

      return {
        id: 'node:module-not-found',
        category: 'language',
        title: `Missing Module: '${moduleName}'`,
        summary: `Node.js failed to load dependency '${moduleName}'.`,
        rootCause: `MODULE_NOT_FOUND: Package or file '${moduleName}' is not installed or path is incorrect.`,
        remedy: {
          action: isLocalPath
            ? `Check that the relative import path '${moduleName}' points to an existing file.`
            : `Install the missing npm package.`,
          command: remedyCmd
        },
        collapsedFramesCount: 0,
        userFrames: [],
        rawError: text.trim(),
        isRecognized: true
      };
    }

    // 2. V8 Stack Trace De-noising & Root-Cause Extraction
    const lines = text.split(/\r?\n/);
    const userFrames: string[] = [];
    let collapsedCount = 0;
    let location: CodeLocation | undefined;
    let errorHeadline = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Capture error headline
      if (!errorHeadline && (trimmed.includes('Error:') || trimmed.startsWith('Error'))) {
        errorHeadline = trimmed;
        continue;
      }

      // Check if line is a stack frame (at ...)
      if (trimmed.startsWith('at ')) {
        const isInternal =
          trimmed.includes('node:internal/') ||
          trimmed.includes('node_modules/') ||
          trimmed.includes('internal/modules/');

        if (isInternal) {
          collapsedCount++;
        } else {
          userFrames.push(trimmed);

          // Extract top user location if not yet found
          if (!location) {
            const locMatch =
              trimmed.match(/\((.+):(\d+):(\d+)\)/) || trimmed.match(/at (.+):(\d+):(\d+)/);
            if (locMatch) {
              location = {
                file: locMatch[1] ?? '',
                line: parseInt(locMatch[2] ?? '', 10),
                column: parseInt(locMatch[3] ?? '', 10)
              };
            }
          }
        }
      }
    }

    if (!errorHeadline && userFrames.length === 0) {
      return null;
    }

    const title = errorHeadline || 'Node.js Runtime Exception';
    const locStr = location ? ` at ${location.file}:${location.line}` : '';

    return {
      id: 'node:stacktrace',
      category: 'language',
      title: `${title}${locStr}`,
      summary: `A runtime error occurred in your Node.js application.`,
      rootCause: title,
      location,
      remedy: {
        action: location
          ? `Inspect line ${location.line} in ${location.file} to verify null/undefined checks or variable declarations.`
          : 'Inspect the highlighted stack trace frames to fix the uncaught exception.'
      },
      collapsedFramesCount: collapsedCount,
      userFrames,
      rawError: text.trim(),
      isRecognized: true
    };
  }
};
