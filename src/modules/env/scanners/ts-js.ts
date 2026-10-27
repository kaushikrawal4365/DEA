import type { DiscoveredEnvVar, EnvScanner } from '../types.js';

/**
 * TypeScript / JavaScript AST & Regex Scanner for environment variable accesses.
 * Supports:
 *   - process.env.VAR_NAME
 *   - process.env['VAR_NAME'] / process.env["VAR_NAME"]
 *   - import.meta.env.VAR_NAME
 *   - Fallback detection (||, ??, ternary)
 */
export const tsJsScanner: EnvScanner = {
  name: 'typescript-javascript',
  supportedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],

  scan(filePath: string, content: string): DiscoveredEnvVar[] {
    const results: DiscoveredEnvVar[] = [];
    const lines = content.split(/\r?\n/);

    // Regular expressions for env accesses
    // 1. process.env.IDENTIFIER or import.meta.env.IDENTIFIER
    const dotPattern = /(?:process\.env|import\.meta\.env)\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
    // 2. process.env['IDENTIFIER'] or process.env["IDENTIFIER"]
    const bracketPattern =
      /(?:process\.env|import\.meta\.env)\[['"]([a-zA-Z_][a-zA-Z0-9_]*)['"]\]/g;

    let inBlockComment = false;

    for (let i = 0; i < lines.length; i++) {
      const lineNum = i + 1;
      let line = lines[i] ?? '';

      // Handle multiline comments
      if (inBlockComment) {
        const endComment = line.indexOf('*/');
        if (endComment !== -1) {
          inBlockComment = false;
          line = line.slice(endComment + 2);
        } else {
          continue;
        }
      }

      const startComment = line.indexOf('/*');
      if (startComment !== -1) {
        const endComment = line.indexOf('*/', startComment + 2);
        if (endComment !== -1) {
          // Inline block comment
          line = line.slice(0, startComment) + line.slice(endComment + 2);
        } else {
          inBlockComment = true;
          line = line.slice(0, startComment);
        }
      }

      // Strip single line comments
      const singleLineComment = line.indexOf('//');
      if (singleLineComment !== -1) {
        line = line.slice(0, singleLineComment);
      }

      if (!line.includes('process.env') && !line.includes('import.meta.env')) {
        continue;
      }

      // Check dot notation
      let match: RegExpExecArray | null;
      dotPattern.lastIndex = 0;
      while ((match = dotPattern.exec(line)) !== null) {
        const varName = match[1];
        if (varName && !isStandardIgnoredVar(varName)) {
          const hasFallback = checkHasFallback(line, match.index + match[0].length);
          results.push({
            name: varName,
            filePath,
            line: lineNum,
            rawExpression: match[0],
            scanner: 'typescript-javascript',
            hasFallback
          });
        }
      }

      // Check bracket notation
      bracketPattern.lastIndex = 0;
      while ((match = bracketPattern.exec(line)) !== null) {
        const varName = match[1];
        if (varName && !isStandardIgnoredVar(varName)) {
          const hasFallback = checkHasFallback(line, match.index + match[0].length);
          results.push({
            name: varName,
            filePath,
            line: lineNum,
            rawExpression: match[0],
            scanner: 'typescript-javascript',
            hasFallback
          });
        }
      }
    }

    return results;
  }
};

function checkHasFallback(line: string, endIndex: number): boolean {
  const rest = line.slice(endIndex).trim();
  return (
    rest.startsWith('||') ||
    rest.startsWith('??') ||
    rest.startsWith('?:') ||
    rest.startsWith('?') ||
    rest.startsWith('||=') ||
    rest.startsWith('??=')
  );
}

function isStandardIgnoredVar(name: string): boolean {
  // Built-in node / bundler variables that do not need to be in .env
  return (
    name === 'NODE_ENV' ||
    name === 'MODE' ||
    name === 'BASE_URL' ||
    name === 'DEV' ||
    name === 'PROD'
  );
}
