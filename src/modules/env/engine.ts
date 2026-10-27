import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { ok, err, type Result } from '../../core/result.js';
import { parseEnvContent } from './env-file-parser.js';
import { defaultScanners, getScannerForFile } from './scanners/index.js';
import { defaultSecretRules, scanContentForSecrets } from './secret-scanner.js';
import type {
  DiscoveredEnvVar,
  EnvCheckReport,
  EnvScanner,
  EnvSyncReport,
  ParsedEnvFile,
  SecretFinding,
  SecretRule,
  SecretScanReport,
  UnreadableFile
} from './types.js';

const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.turbo',
  'coverage',
  '.venv',
  '__pycache__',
  '.idea',
  '.vscode'
]);

export interface EnvEngineOptions {
  readonly scanners?: readonly EnvScanner[];
  readonly secretRules?: readonly SecretRule[];
  readonly ignoreDirs?: ReadonlySet<string>;
}

export async function checkEnvironment(
  targetDir: string,
  options: EnvEngineOptions = {}
): Promise<Result<EnvCheckReport, Error>> {
  try {
    const scanners = options.scanners ?? defaultScanners;
    const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORED_DIRS;

    // 1. Discover all candidate files
    const allFiles = await walkDirectory(targetDir, ignoreDirs);
    const unreadableFiles: UnreadableFile[] = [];

    // 2. Discover and parse .env and .env.example files
    const envFiles: ParsedEnvFile[] = [];
    let exampleFile: ParsedEnvFile | undefined;

    for (const file of allFiles) {
      const baseName = path.basename(file);
      if (
        baseName === '.env.example' ||
        baseName === '.env.template' ||
        baseName === '.env.sample'
      ) {
        const readRes = await tryReadFile(file);
        if (readRes.success) {
          const parsed = parseEnvContent(readRes.content, file);
          if (parsed._tag === 'Ok') {
            exampleFile = parsed.value;
          }
        } else {
          unreadableFiles.push(readRes.unreadable);
        }
      } else if (baseName === '.env' || baseName.startsWith('.env.')) {
        const readRes = await tryReadFile(file);
        if (readRes.success) {
          const parsed = parseEnvContent(readRes.content, file);
          if (parsed._tag === 'Ok') {
            envFiles.push(parsed.value);
          }
        } else {
          unreadableFiles.push(readRes.unreadable);
        }
      }
    }

    // 3. Scan code files for env accesses
    const usedVariables: DiscoveredEnvVar[] = [];

    for (const file of allFiles) {
      const scanner = getScannerForFile(file, scanners);
      if (scanner) {
        const readRes = await tryReadFile(file);
        if (readRes.success) {
          const discovered = scanner.scan(file, readRes.content);
          usedVariables.push(...discovered);
        } else {
          unreadableFiles.push(readRes.unreadable);
        }
      }
    }

    // 4. Combine all defined variables across all .env files found
    const definedInEnv = new Set<string>();
    for (const envFile of envFiles) {
      for (const key of envFile.variables.keys()) {
        definedInEnv.add(key);
      }
    }

    const definedInExample = new Set<string>();
    if (exampleFile) {
      for (const key of exampleFile.variables.keys()) {
        definedInExample.add(key);
      }
    }

    // 5. Group used variables by name
    const usagesByName = new Map<string, DiscoveredEnvVar[]>();
    for (const usage of usedVariables) {
      const list = usagesByName.get(usage.name) ?? [];
      list.push(usage);
      usagesByName.set(usage.name, list);
    }

    // 6. Calculate missing from .env
    const missingFromEnv: Array<{
      name: string;
      usages: DiscoveredEnvVar[];
      hasFallback: boolean;
    }> = [];

    if (envFiles.length > 0) {
      for (const [name, usages] of usagesByName.entries()) {
        if (!definedInEnv.has(name)) {
          const allHaveFallback = usages.every(u => u.hasFallback);
          missingFromEnv.push({
            name,
            usages,
            hasFallback: allHaveFallback
          });
        }
      }
    }

    // 7. Calculate missing from .env.example
    const missingFromExample: string[] = [];
    if (exampleFile) {
      for (const name of usagesByName.keys()) {
        if (!definedInExample.has(name)) {
          missingFromExample.push(name);
        }
      }
    }

    // 8. Calculate unused variables in .env
    const unusedInEnv: string[] = [];
    for (const definedKey of definedInEnv) {
      if (!usagesByName.has(definedKey)) {
        unusedInEnv.push(definedKey);
      }
    }

    const isClean = missingFromEnv.filter(m => !m.hasFallback).length === 0;

    return ok({
      targetDir,
      usedVariables,
      missingFromEnv,
      missingFromExample,
      unusedInEnv,
      envFilesFound: envFiles.map(f => f.filePath),
      unreadableFiles,
      isClean
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return err(error);
  }
}

export async function scanSecrets(
  targetDir: string,
  options: EnvEngineOptions = {}
): Promise<Result<SecretScanReport, Error>> {
  try {
    const rules = options.secretRules ?? defaultSecretRules;
    const ignoreDirs = options.ignoreDirs ?? DEFAULT_IGNORED_DIRS;

    const allFiles = await walkDirectory(targetDir, ignoreDirs);
    const findings: SecretFinding[] = [];
    const unreadableFiles: UnreadableFile[] = [];
    let filesScanned = 0;

    for (const file of allFiles) {
      // Skip binary, lock, and minified files
      if (isIgnoredFile(file)) {
        continue;
      }

      const readRes = await tryReadFile(file);
      if (readRes.success) {
        filesScanned++;
        const fileFindings = scanContentForSecrets(file, readRes.content, rules);
        findings.push(...fileFindings);
      } else {
        unreadableFiles.push(readRes.unreadable);
      }
    }

    return ok({
      targetDir,
      filesScanned,
      findings,
      unreadableFiles,
      isClean: findings.length === 0
    });
  } catch (e: unknown) {
    const error = e instanceof Error ? e : new Error(String(e));
    return err(error);
  }
}

type SafeReadResult =
  { success: true; content: string } | { success: false; unreadable: UnreadableFile };

async function tryReadFile(filePath: string): Promise<SafeReadResult> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (e: unknown) {
    const errObj = e as { code?: string; message?: string };
    const msg = errObj.message ?? String(e);
    const code = errObj.code ?? '';

    const isCloudOffline =
      code === 'UNKNOWN' ||
      msg.includes('unknown error') ||
      msg.includes('cloud file') ||
      msg.includes('0x8007016A');

    const reason = isCloudOffline
      ? 'File is offline (OneDrive cloud file not downloaded locally)'
      : code === 'EACCES' || code === 'EPERM'
        ? 'Permission denied'
        : code === 'EBUSY'
          ? 'File is locked by another process'
          : msg;

    return {
      success: false,
      unreadable: {
        path: filePath,
        reason,
        isCloudOffline
      }
    };
  }
}

async function walkDirectory(dir: string, ignoreDirs: ReadonlySet<string>): Promise<string[]> {
  const results: string[] = [];

  async function walk(current: string) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          await walk(fullPath);
        }
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  await walk(dir);
  return results;
}

function isIgnoredFile(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith('.lock') ||
    lower.endsWith('-lock.json') ||
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.ico') ||
    lower.endsWith('.svg') ||
    lower.endsWith('.woff') ||
    lower.endsWith('.woff2') ||
    lower.endsWith('.ttf') ||
    lower.endsWith('.eot') ||
    lower.endsWith('.mp4') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.tar') ||
    lower.endsWith('.gz') ||
    lower.endsWith('.pdf') ||
    lower.endsWith('.map') ||
    lower.endsWith('.min.js') ||
    lower.endsWith('.min.css')
  );
}

export interface EnvSyncOptions extends EnvEngineOptions {
  readonly exampleFileName?: string | undefined;
  readonly dryRun?: boolean | undefined;
}

export async function syncEnvironment(
  targetDir: string,
  options: EnvSyncOptions = {}
): Promise<Result<EnvSyncReport, Error>> {
  try {
    const checkRes = await checkEnvironment(targetDir, options);
    if (checkRes._tag === 'Err') {
      return checkRes;
    }

    const checkReport = checkRes.value;

    // Collect all unique variables used in code and/or defined in .env
    const allKnownKeys = new Set<string>();
    for (const v of checkReport.usedVariables) {
      allKnownKeys.add(v.name);
    }
    for (const envFilePath of checkReport.envFilesFound) {
      const readRes = await tryReadFile(envFilePath);
      if (readRes.success) {
        const parsed = parseEnvContent(readRes.content, envFilePath);
        if (parsed._tag === 'Ok') {
          for (const key of parsed.value.variables.keys()) {
            allKnownKeys.add(key);
          }
        }
      }
    }

    // Determine target example file path
    const candidateFiles = ['.env.example', '.env.template', '.env.sample'];
    let examplePath: string | undefined;

    if (options.exampleFileName) {
      examplePath = path.join(targetDir, options.exampleFileName);
    } else {
      for (const candidate of candidateFiles) {
        const fullCandidate = path.join(targetDir, candidate);
        try {
          const stat = await fs.stat(fullCandidate);
          if (stat.isFile()) {
            examplePath = fullCandidate;
            break;
          }
        } catch {
          // Continue
        }
      }
    }

    let wasCreated = false;
    let existingContent = '';
    const existingKeys = new Set<string>();

    if (!examplePath) {
      examplePath = path.join(targetDir, '.env.example');
      wasCreated = true;
    } else {
      try {
        const readRes = await tryReadFile(examplePath);
        if (readRes.success) {
          existingContent = readRes.content;
          const parsed = parseEnvContent(existingContent, examplePath);
          if (parsed._tag === 'Ok') {
            for (const k of parsed.value.variables.keys()) {
              existingKeys.add(k);
            }
          }
        } else {
          wasCreated = true;
        }
      } catch {
        wasCreated = true;
      }
    }

    // Find keys to add (sorted alphabetically)
    const addedKeys: string[] = [];
    for (const key of Array.from(allKnownKeys).sort()) {
      if (!existingKeys.has(key)) {
        addedKeys.push(key);
      }
    }

    if (addedKeys.length > 0 && !options.dryRun) {
      let updatedContent = existingContent;
      if (updatedContent.length > 0 && !updatedContent.endsWith('\n')) {
        updatedContent += '\n';
      }

      if (existingContent.trim().length === 0) {
        updatedContent =
          "# Environment Variables Template\n# Auto-generated by DEA (Developer's Everyday Assistant)\n\n";
      } else {
        updatedContent += '\n# Added by DEA Env Sync\n';
      }

      for (const key of addedKeys) {
        updatedContent += `${key}=\n`;
      }

      await fs.writeFile(examplePath, updatedContent, 'utf-8');
    }

    return ok({
      targetDir,
      examplePath,
      wasCreated,
      addedKeys,
      totalKeys: existingKeys.size + addedKeys.length
    });
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}
