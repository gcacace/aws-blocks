// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Telemetry bin command e2e test.
 *
 * Verifies the `blocks-telemetry` CLI binary:
 * 1. Bare command shows help/usage
 * 2. --enable writes project config
 * 3. --disable writes project config
 * 4. --enable --global writes global config
 * 5. --disable --global writes global config
 * 6. --help shows usage information
 * 7. Config uses correct nested format { telemetry: { enabled: bool } }
 * 8. Existing keys in config files are preserved
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');
const MONO_ROOT = join(APP_ROOT, '../..');
const CLI_SCRIPT = join(MONO_ROOT, 'packages', 'core', 'dist', 'scripts', 'telemetry-cli.js');

function createTmpDir(): string {
  const dir = join(tmpdir(), `blocks-telemetry-e2e-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Creates a temp project dir with node_modules/.bin/blocks-telemetry symlinked (simulates npm install). */
function createTmpProject(): string {
  const dir = createTmpDir();
  const binDir = join(dir, 'node_modules', '.bin');
  mkdirSync(binDir, { recursive: true });
  symlinkSync(CLI_SCRIPT, join(binDir, 'blocks-telemetry'));
  return dir;
}

function runTelemetry(args: string, options?: { cwd?: string; env?: Record<string, string> }): { stdout: string; stderr: string; exitCode: number } {
  const cmd = args ? `npx blocks-telemetry ${args}` : `npx blocks-telemetry`;
  try {
    const stdout = execSync(cmd, {
      cwd: options?.cwd ?? APP_ROOT,
      encoding: 'utf-8',
      env: { ...process.env, ...options?.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || '',
      exitCode: error.status ?? 1,
    };
  }
}

describe('blocks-telemetry bin command e2e', () => {
  let tmpHome: string;
  let tmpProject: string;

  beforeEach(() => {
    tmpHome = createTmpDir();
    tmpProject = createTmpProject();
  });

  afterEach(() => {
    rmSync(tmpHome, { recursive: true, force: true });
    rmSync(tmpProject, { recursive: true, force: true });
  });

  test('bare command shows help/usage', () => {
    const result = runTelemetry('', { cwd: tmpProject, env: { HOME: tmpHome } });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('Usage:'), 'Should display usage/help text');
    assert.ok(result.stdout.includes('--status'), 'Should document --status flag');
  });

  test('--help shows usage information', () => {
    const result = runTelemetry('--help', { cwd: tmpProject, env: { HOME: tmpHome } });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('Usage:'), 'Should show usage header');
    assert.ok(result.stdout.includes('--enable'), 'Should document --enable flag');
    assert.ok(result.stdout.includes('--disable'), 'Should document --disable flag');
    assert.ok(result.stdout.includes('--global'), 'Should document --global flag');
  });

  test('--disable creates project config with telemetry.enabled=false', () => {
    const result = runTelemetry('--disable', { cwd: tmpProject, env: { HOME: tmpHome } });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('disabled for this project'));

    const configPath = join(tmpProject, '.blocks', 'config.json');
    assert.ok(existsSync(configPath), 'Project config should exist');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    assert.strictEqual(config.telemetry.enabled, false);
  });

  test('--enable creates project config with telemetry.enabled=true', () => {
    const result = runTelemetry('--enable', { cwd: tmpProject, env: { HOME: tmpHome } });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('enabled for this project'));

    const configPath = join(tmpProject, '.blocks', 'config.json');
    assert.ok(existsSync(configPath), 'Project config should exist');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    assert.strictEqual(config.telemetry.enabled, true);
  });

  test('--disable --global writes global config with telemetry.enabled=false', () => {
    const result = runTelemetry('--disable --global', { cwd: tmpProject, env: { HOME: tmpHome } });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('disabled globally'));

    const globalConfigPath = join(tmpHome, '.blocks', 'config.json');
    assert.ok(existsSync(globalConfigPath), 'Global config should exist');
    const config = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
    assert.strictEqual(config.telemetry.enabled, false);
  });

  test('--enable --global writes global config with telemetry.enabled=true', () => {
    const result = runTelemetry('--enable --global', { cwd: tmpProject, env: { HOME: tmpHome } });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('enabled globally'));

    const globalConfigPath = join(tmpHome, '.blocks', 'config.json');
    assert.ok(existsSync(globalConfigPath), 'Global config should exist');
    const config = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
    assert.strictEqual(config.telemetry.enabled, true);
  });

  test('preserves existing keys in project config', () => {
    const configDir = join(tmpProject, '.blocks');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      join(configDir, 'config.json'),
      JSON.stringify({ telemetry: { projectId: 'test-id-123' }, theme: 'dark' }, null, 2)
    );

    const result = runTelemetry('--disable', { cwd: tmpProject, env: { HOME: tmpHome } });
    assert.strictEqual(result.exitCode, 0);

    const config = JSON.parse(readFileSync(join(configDir, 'config.json'), 'utf-8'));
    assert.strictEqual(config.telemetry.enabled, false);
    assert.strictEqual(config.telemetry.projectId, 'test-id-123');
    assert.strictEqual(config.theme, 'dark');
  });

  test('status reflects disabled state after --disable', () => {
    runTelemetry('--disable', { cwd: tmpProject, env: { HOME: tmpHome } });

    const result = runTelemetry('--status', { cwd: tmpProject, env: { HOME: tmpHome } });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('Disabled'), 'Should show telemetry as disabled');
    assert.ok(result.stdout.includes('Project config'), 'Should show project config as source');
  });

  test('status reflects enabled state after --enable', () => {
    runTelemetry('--enable', { cwd: tmpProject, env: { HOME: tmpHome } });

    const result = runTelemetry('--status', { cwd: tmpProject, env: { HOME: tmpHome } });
    assert.strictEqual(result.exitCode, 0);
    assert.ok(result.stdout.includes('Enabled'), 'Should show telemetry as enabled');
  });
});
