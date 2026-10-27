import type { DiscoveredEnvVar, EnvScanner } from '../types.js';

/**
 * Python Scanner for environment variable accesses.
 * Supports:
 *   - os.environ['VAR_NAME'] / environ['VAR_NAME']
 *   - os.environ.get('VAR_NAME', default) / environ.get('VAR_NAME', default)
 *   - os.getenv('VAR_NAME', default) / getenv('VAR_NAME', default)
 */
export const pythonScanner: EnvScanner = {
  name: 'python',
  supportedExtensions: ['.py'],

  scan(filePath: string, content: string): DiscoveredEnvVar[] {
    const results: DiscoveredEnvVar[] = [];
    const lines = content.split(/\r?\n/);

    // 1. os.environ['VAR'] or environ['VAR']
    const bracketPattern = /\b(?:os\.)?environ\[['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\]/g;
    // 2. os.environ.get('VAR', ...) or environ.get('VAR', ...) or os.getenv('VAR', ...) or getenv('VAR', ...)
    const getPattern =
      /\b(?:(?:os\.)?environ\.get|(?:os\.)?getenv)\(\s*['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\s*(?:,\s*([^)]+))?\)/g;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      let line = lines[i] ?? '';

      // Strip comments
      const commentIndex = line.indexOf('#');
      if (commentIndex !== -1) {
        line = line.slice(0, commentIndex);
      }

      if (!line.includes('environ') && !line.includes('getenv')) {
        continue;
      }

      // Check bracket notation
      let match: RegExpExecArray | null;
      bracketPattern.lastIndex = 0;
      while ((match = bracketPattern.exec(line)) !== null) {
        const varName = match[1];
        if (varName) {
          const rest = line.slice(match.index + match[0].length).trim();
          const hasFallback = rest.startsWith('or ') || rest.startsWith('if ');
          results.push({
            name: varName,
            filePath,
            line: lineNum,
            rawExpression: match[0],
            scanner: 'python',
            hasFallback
          });
        }
      }

      // Check get pattern
      getPattern.lastIndex = 0;
      while ((match = getPattern.exec(line)) !== null) {
        const varName = match[1];
        const defaultValue = match[2];
        if (varName) {
          const hasFallback = Boolean(defaultValue && defaultValue.trim().length > 0);
          results.push({
            name: varName,
            filePath,
            line: lineNum,
            rawExpression: match[0],
            scanner: 'python',
            hasFallback
          });
        }
      }
    }

    return results;
  }
};
