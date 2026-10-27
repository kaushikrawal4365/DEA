import { Command } from 'commander';
import pc from 'picocolors';

export function registerHookCommand(parent: Command): void {
  parent
    .command('hook')
    .description('Generate shell integration hooks for zero-effort crash guidance')
    .argument('[shell]', 'Target shell (powershell, bash, zsh)', detectShell())
    .option('--install', 'Automatically append the hook to your user shell profile', false)
    .action(async (shell: string, _options: { install: boolean }) => {
      const targetShell = shell.toLowerCase();

      console.log(pc.cyan(`\n⚡ DEA Shell Integration for ${pc.bold(targetShell)}:\n`));

      if (targetShell === 'powershell' || targetShell === 'pwsh') {
        renderPowerShellHook();
      } else if (targetShell === 'zsh') {
        renderZshHook();
      } else {
        renderBashHook();
      }
    });
}

function detectShell(): string {
  if (process.platform === 'win32') {
    return 'powershell';
  }
  const shellEnv = process.env.SHELL || '';
  if (shellEnv.includes('zsh')) return 'zsh';
  return 'bash';
}

function renderPowerShellHook(): void {
  console.log(pc.dim('# Add this snippet to your PowerShell profile ($PROFILE):'));
  console.log(
    pc.yellow(`
function prompt {
    $lastCode = $global:LASTEXITCODE
    if ($lastCode -ne 0 -and $lastCode -ne $null) {
        Write-Host "💡 DEA: Run 'dea fix' to diagnose and auto-resolve this failure." -ForegroundColor Cyan
    }
    "PS $($executionContext.SessionState.Path.CurrentLocation)> "
}
`)
  );
  console.log(pc.dim('To edit your profile, run: notepad $PROFILE\n'));
}

function renderZshHook(): void {
  console.log(pc.dim('# Add this snippet to ~/.zshrc:'));
  console.log(
    pc.yellow(`
precmd() {
    local exit_code=$?
    if [ $exit_code -ne 0 ]; then
        echo -e "\\033[36m💡 DEA: Run 'dea fix' to diagnose and auto-resolve this failure.\\033[0m"
    fi
}
`)
  );
}

function renderBashHook(): void {
  console.log(pc.dim('# Add this snippet to ~/.bashrc:'));
  console.log(
    pc.yellow(`
PROMPT_COMMAND='exit_code=$?; if [ $exit_code -ne 0 ]; then echo -e "\\033[36m💡 DEA: Run \\"dea fix\\" to diagnose and auto-resolve this failure.\\033[0m"; fi;'
`)
  );
}
