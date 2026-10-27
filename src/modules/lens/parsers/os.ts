import type { ErrorContext, ErrorParser, LensDiagnostic } from '../types.js';
import { findProcessHoldingPort } from '../port-inspector.js';

export const osParser: ErrorParser = {
  name: 'os-system',
  priority: 10,

  canParse(ctx: ErrorContext): boolean {
    const text = `${ctx.rawStderr}\n${ctx.rawStdout}`;
    return (
      text.includes('EADDRINUSE') ||
      text.includes('WSAEADDRINUSE') ||
      text.includes('address already in use') ||
      text.includes('heap out of memory') ||
      ctx.exitCode === 137 ||
      text.includes('EACCES') ||
      text.includes('EPERM') ||
      text.includes('Access is denied') ||
      text.includes('not recognized as an internal or external command') ||
      text.includes('command not found') ||
      ctx.exitCode === 127
    );
  },

  async parse(ctx: ErrorContext): Promise<LensDiagnostic | null> {
    const text = `${ctx.rawStderr}\n${ctx.rawStdout}`;

    // 1. Port Collision
    if (
      text.includes('EADDRINUSE') ||
      text.includes('WSAEADDRINUSE') ||
      text.includes('address already in use')
    ) {
      const portMatch = text.match(/(?:port|:::?)\s*(\d{2,5})/i) || text.match(/:(\d{2,5})\b/);
      const port = portMatch ? parseInt(portMatch[1] ?? '', 10) : undefined;

      let portProcess = null;
      if (port) {
        portProcess = await findProcessHoldingPort(port);
      }

      const portStr = port ? `${port}` : 'unknown';
      const pidStr = portProcess ? `PID ${portProcess.pid}` : 'another background process';
      const killCmd = portProcess
        ? portProcess.killCommand
        : process.platform === 'win32'
          ? `netstat -ano | findstr :${portStr}`
          : `lsof -i :${portStr}`;

      return {
        id: 'os:eaddrinuse',
        category: 'os',
        title: `Port ${portStr} is already in use`,
        summary: `Network socket bind failed because port ${portStr} is currently occupied by ${pidStr}.`,
        rootCause: `Address already in use (EADDRINUSE / WSAEADDRINUSE) on port ${portStr}`,
        remedy: {
          action: `Terminate the process holding port ${portStr} or choose a different port.`,
          command: killCmd
        },
        collapsedFramesCount: 0,
        userFrames: [],
        rawError: text.trim(),
        isRecognized: true
      };
    }

    // 2. Out of Memory (OOM)
    if (
      text.includes('heap out of memory') ||
      ctx.exitCode === 137 ||
      text.includes('MemoryError')
    ) {
      return {
        id: 'os:oom',
        category: 'os',
        title: 'Process Ran Out of Memory (OOM)',
        summary:
          'The execution was terminated because the application exhausted available RAM or heap quota.',
        rootCause: 'Heap memory allocation failure (Exit 137 / Out of Memory)',
        remedy: {
          action: 'Increase Node.js memory ceiling or optimize heavy memory usage.',
          command: 'export NODE_OPTIONS="--max-old-space-size=4096"'
        },
        collapsedFramesCount: 0,
        userFrames: [],
        rawError: text.trim(),
        isRecognized: true
      };
    }

    // 3. Command Not Found
    if (
      ctx.exitCode === 127 ||
      text.includes('not recognized as an internal or external command') ||
      text.includes('command not found')
    ) {
      const cmdMatch =
        text.match(/'([^']+)' is not recognized/i) ||
        text.match(/([a-zA-Z0-9_-]+): command not found/i);
      const missingCmd = cmdMatch ? cmdMatch[1] : (ctx.command?.split(' ')[0] ?? 'command');

      return {
        id: 'os:command-not-found',
        category: 'os',
        title: `Command Not Found: '${missingCmd}'`,
        summary: `The system cannot locate executable '${missingCmd}'. It is either not installed or missing from PATH.`,
        rootCause: `Binary '${missingCmd}' not found in system PATH (Exit 127 / ENOENT)`,
        remedy: {
          action: `Verify that '${missingCmd}' is installed and its directory is added to your PATH environment variable.`
        },
        collapsedFramesCount: 0,
        userFrames: [],
        rawError: text.trim(),
        isRecognized: true
      };
    }

    // 4. Permission Denied
    if (text.includes('EACCES') || text.includes('EPERM') || text.includes('Access is denied')) {
      return {
        id: 'os:eacces',
        category: 'os',
        title: 'Permission Denied',
        summary:
          'The operating system blocked file or directory access due to insufficient permissions.',
        rootCause: 'Insufficient user privileges or file access protection (EACCES / EPERM)',
        remedy: {
          action:
            'Verify file ownership and permissions, or run the terminal with elevated administrative rights.'
        },
        collapsedFramesCount: 0,
        userFrames: [],
        rawError: text.trim(),
        isRecognized: true
      };
    }

    return null;
  }
};
