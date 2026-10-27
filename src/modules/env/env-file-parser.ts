import * as path from 'node:path';
import { ok, err, type Result } from '../../core/result.js';
import type { EnvFileEntry, ParsedEnvFile } from './types.js';

/**
 * Robust .env parser handling CRLF/LF, comments, export prefixes, and quoting.
 */
export function parseEnvContent(content: string, filePath: string): Result<ParsedEnvFile, Error> {
  try {
    const lines = content.split(/\r?\n/);
    const variables = new Map<string, EnvFileEntry>();

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      const rawLine = lines[i]?.trim();

      if (!rawLine || rawLine.startsWith('#')) {
        continue;
      }

      // Strip optional 'export ' prefix
      let cleanLine = rawLine;
      if (cleanLine.startsWith('export ')) {
        cleanLine = cleanLine.slice(7).trim();
      }

      const equalIndex = cleanLine.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }

      const key = cleanLine.slice(0, equalIndex).trim();
      if (!isValidEnvKey(key)) {
        continue;
      }

      let rawValue = cleanLine.slice(equalIndex + 1).trim();
      const parsedValue = parseEnvValue(rawValue);

      variables.set(key, {
        key,
        value: parsedValue,
        line: lineNum,
        hasValue: parsedValue.length > 0
      });
    }

    return ok({
      filePath,
      fileName: path.basename(filePath),
      variables
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return err(error);
  }
}

function isValidEnvKey(key: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key);
}

function parseEnvValue(val: string): string {
  if (val.length === 0) {
    return '';
  }

  // Quoted with double quotes
  if (val.startsWith('"')) {
    const closingIndex = val.indexOf('"', 1);
    if (closingIndex !== -1) {
      return val.slice(1, closingIndex).replace(/\\n/g, '\n').replace(/\\r/g, '\r');
    }
  }

  // Quoted with single quotes
  if (val.startsWith("'")) {
    const closingIndex = val.indexOf("'", 1);
    if (closingIndex !== -1) {
      return val.slice(1, closingIndex);
    }
  }

  // Unquoted: strip trailing comments like `# comment`
  const commentIndex = val.indexOf('#');
  if (commentIndex !== -1) {
    return val.slice(0, commentIndex).trim();
  }

  return val;
}
