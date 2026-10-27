import type { SecretFinding, SecretRule } from './types.js';

export const defaultSecretRules: readonly SecretRule[] = [
  {
    id: 'aws-access-key',
    name: 'AWS Access Key ID',
    severity: 'critical',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    description: 'Hardcoded AWS Access Key'
  },
  {
    id: 'stripe-secret-key',
    name: 'Stripe Secret Key',
    severity: 'critical',
    pattern: /\b((?:sk|rk)_live_[0-9a-zA-Z]{24,99})\b/g,
    description: 'Live Stripe Secret or Restricted API Key'
  },
  {
    id: 'github-pat',
    name: 'GitHub Personal Access Token',
    severity: 'critical',
    pattern: /\b(ghp_[0-9a-zA-Z]{36}|github_pat_[0-9a-zA-Z_]{82})\b/g,
    description: 'Personal Access Token for GitHub'
  },
  {
    id: 'slack-token',
    name: 'Slack Token',
    severity: 'high',
    pattern: /\b(xox[baprs]-[0-9a-zA-Z]{10,48})\b/g,
    description: 'Slack Bot or User OAuth Token'
  },
  {
    id: 'openai-key',
    name: 'OpenAI Secret Key',
    severity: 'critical',
    pattern: /\b(sk-[a-zA-Z0-9]{20,}|sk-proj-[a-zA-Z0-9_-]{40,})\b/g,
    description: 'OpenAI API Secret Key'
  },
  {
    id: 'private-key',
    name: 'Private Key Block',
    severity: 'critical',
    pattern: /(-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g,
    description: 'Unencrypted cryptographic private key'
  }
];

export function redactSecret(secret: string): string {
  if (secret.length <= 8) {
    return '***';
  }
  const prefix = secret.slice(0, 4);
  const suffix = secret.slice(-4);
  return `${prefix}...${suffix}`;
}

export function scanContentForSecrets(
  filePath: string,
  content: string,
  rules: readonly SecretRule[] = defaultSecretRules
): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const line = lines[i] ?? '';

    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(line)) !== null) {
        const fullMatch = match[1] ?? match[0];
        findings.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          filePath,
          line: lineNum,
          snippet: line.trim(),
          redactedMatch: redactSecret(fullMatch)
        });
      }
    }
  }

  return findings;
}
