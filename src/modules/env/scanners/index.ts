import type { EnvScanner } from '../types.js';
import { tsJsScanner } from './ts-js.js';
import { pythonScanner } from './python.js';

export const defaultScanners: readonly EnvScanner[] = [tsJsScanner, pythonScanner];

export function getScannerForFile(
  filePath: string,
  scanners: readonly EnvScanner[] = defaultScanners
): EnvScanner | undefined {
  const lower = filePath.toLowerCase();
  return scanners.find(scanner => scanner.supportedExtensions.some(ext => lower.endsWith(ext)));
}
