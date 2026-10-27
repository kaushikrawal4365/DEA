import type { ErrorParser } from '../types.js';
import { osParser } from './os.js';
import { nodeParser } from './node.js';
import { pythonParser } from './python.js';

export const defaultParsers: readonly ErrorParser[] = [osParser, nodeParser, pythonParser].sort(
  (a, b) => a.priority - b.priority
);
