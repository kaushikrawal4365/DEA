import type { PurgePlugin } from '../types.js';
import { nodePlugin } from './node.js';
import { pythonPlugin } from './python.js';
import { rustPlugin } from './rust.js';

export const defaultPurgePlugins: readonly PurgePlugin[] = [nodePlugin, pythonPlugin, rustPlugin];
