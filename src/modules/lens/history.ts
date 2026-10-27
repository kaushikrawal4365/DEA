import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export interface LastCommandInfo {
  readonly command: string;
  readonly historySource: string;
}

/**
 * Cross-platform shell history reader to retrieve the user's most recent command.
 */
export async function getLastShellCommand(): Promise<LastCommandInfo | null> {
  const isWindows = process.platform === 'win32';

  if (isWindows) {
    // PowerShell PSReadLine history location
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const psHistoryPath = path.join(
      appData,
      'Microsoft',
      'Windows',
      'PowerShell',
      'PSReadLine',
      'ConsoleHost_history.txt'
    );

    const cmd = await readLastLine(psHistoryPath);
    if (cmd && !cmd.startsWith('dea')) {
      return { command: cmd, historySource: 'PowerShell' };
    }
  }

  // Check Bash / Zsh history
  const zshHistory = path.join(os.homedir(), '.zsh_history');
  const zshCmd = await readLastLine(zshHistory);
  if (zshCmd && !zshCmd.startsWith('dea')) {
    // Strip zsh timestamps if present (: 1234567890:0;command)
    const cleanCmd = zshCmd.replace(/^:\s*\d+:\d+;/, '');
    return { command: cleanCmd, historySource: 'Zsh' };
  }

  const bashHistory = path.join(os.homedir(), '.bash_history');
  const bashCmd = await readLastLine(bashHistory);
  if (bashCmd && !bashCmd.startsWith('dea')) {
    return { command: bashCmd, historySource: 'Bash' };
  }

  return null;
}

async function readLastLine(filePath: string): Promise<string | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length === 0) return null;

    // Filter out previous 'dea' invocations
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i]?.trim();
      if (line && !line.startsWith('dea ') && line !== 'dea') {
        return line;
      }
    }
    return null;
  } catch {
    return null;
  }
}
