import type { CodeLocation, ErrorContext, ErrorParser, LensDiagnostic } from '../types.js';

export const pythonParser: ErrorParser = {
  name: 'python-traceback',
  priority: 20,

  canParse(ctx: ErrorContext): boolean {
    const text = `${ctx.rawStderr}\n${ctx.rawStdout}`;
    return (
      text.includes('Traceback (most recent call last):') ||
      text.includes('ModuleNotFoundError:') ||
      text.includes('ImportError:') ||
      text.includes('SyntaxError:') ||
      text.includes('IndentationError:') ||
      text.includes('AttributeError:')
    );
  },

  async parse(ctx: ErrorContext): Promise<LensDiagnostic | null> {
    const text = `${ctx.rawStderr}\n${ctx.rawStdout}`;

    // 1. Missing Module
    if (text.includes('ModuleNotFoundError:') || text.includes('ImportError:')) {
      const match = text.match(/No module named ['"]([^'"]+)['"]/);
      const moduleName = match ? match[1] : 'package';

      return {
        id: 'python:module-not-found',
        category: 'language',
        title: `Python Missing Module: '${moduleName}'`,
        summary: `Python failed to import module '${moduleName}'.`,
        rootCause: `ModuleNotFoundError: No module named '${moduleName}'`,
        remedy: {
          action: `Install the missing package in your virtual environment.`,
          command: `pip install ${moduleName}`
        },
        collapsedFramesCount: 0,
        userFrames: [],
        rawError: text.trim(),
        isRecognized: true
      };
    }

    // 2. Python Traceback De-noiser
    const lines = text.split(/\r?\n/);
    const userFrames: string[] = [];
    let collapsedCount = 0;
    let location: CodeLocation | undefined;
    let errorHeadline = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.trim() ?? '';

      // Capture final error line (e.g. "AttributeError: 'NoneType' object has no attribute 'get'")
      if (line.endsWith('Error') || line.includes('Error:') || line.includes('Exception:')) {
        errorHeadline = line;
      }

      // Check for traceback frame: File "...", line X, in ...
      if (line.startsWith('File "')) {
        const isInternal =
          line.includes('site-packages/') ||
          line.includes('site-packages\\') ||
          line.includes('lib/python') ||
          line.includes('Lib\\');

        const codeSnippet = lines[i + 1]?.trim();
        const fullFrame = codeSnippet ? `${line}\n    ${codeSnippet}` : line;

        if (isInternal) {
          collapsedCount++;
        } else {
          userFrames.push(fullFrame);

          // Update latest user location (Python tracebacks put the crash at the bottom)
          const locMatch = line.match(/File "([^"]+)", line (\d+)/);
          if (locMatch) {
            location = {
              file: locMatch[1] ?? '',
              line: parseInt(locMatch[2] ?? '', 10)
            };
          }
        }
      }
    }

    const title = errorHeadline || 'Python Runtime Exception';
    const locStr = location ? ` at ${location.file}:${location.line}` : '';

    return {
      id: 'python:traceback',
      category: 'language',
      title: `${title}${locStr}`,
      summary: `A Python runtime exception occurred.`,
      rootCause: title,
      location,
      remedy: {
        action: location
          ? `Inspect line ${location.line} in ${location.file} to resolve the exception.`
          : 'Inspect the highlighted frames to fix the traceback.'
      },
      collapsedFramesCount: collapsedCount,
      userFrames,
      rawError: text.trim(),
      isRecognized: true
    };
  }
};
