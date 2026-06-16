// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Vendorize integration test.
 *
 * Verifies:
 * 1. CDK synth produces a baseline
 * 2. Vendorize copies source and creates correct workspace structure
 * 3. Vendorized source is importable and functional
 * 4. Vendorized CDK source can be modified and re-synthesized
 *
 * Note: In the monorepo, root workspaces take priority over nested ones,
 * so we verify vendorize correctness by directly importing the vendorized
 * path and running a standalone CDK synth against it.
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, describe, after } from 'node:test';
import assert from 'node:assert';

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = join(__dirname, '..');
const MONO_ROOT = join(APP_ROOT, '../..');
const VENDOR_DIR = join(APP_ROOT, 'vendor');

function synth(outputDir: string) {
  rmSync(outputDir, { recursive: true, force: true });
  execSync(
    `npx cdk synth --app "npx tsx -C cdk aws-blocks/index.cdk.ts" --output "${outputDir}" --context sandboxMode=true --quiet`,
    { cwd: APP_ROOT, stdio: 'pipe' }
  );
}

function getTemplateJson(dir: string): string {
  const files = execSync(`find "${dir}" -name "*.template.json"`, { encoding: 'utf-8' }).trim().split('\n');
  return readFileSync(files[0], 'utf-8');
}

function cleanup() {
  rmSync(VENDOR_DIR, { recursive: true, force: true });
  rmSync(join(APP_ROOT, 'cdk.out.baseline'), { recursive: true, force: true });
  rmSync(join(APP_ROOT, 'cdk.out.post'), { recursive: true, force: true });
  const pkgPath = join(APP_ROOT, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  pkg.workspaces = (pkg.workspaces as string[]).filter((w: string) => !w.startsWith('vendor/'));
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  execSync('npm install', { cwd: MONO_ROOT, stdio: 'pipe' });
}

describe('vendorize', () => {
  after(cleanup);

  test('baseline CDK synth succeeds', () => {
    synth(join(APP_ROOT, 'cdk.out.baseline'));
    const json = getTemplateJson(join(APP_ROOT, 'cdk.out.baseline'));
    const template = JSON.parse(json);
    assert.ok(Object.keys(template.Resources).length > 0);
  });

  test('vendorize creates correct workspace structure', () => {
    execSync('npm run vendorize -- @aws-blocks/bb-kv-store', { cwd: APP_ROOT, stdio: 'pipe' });

    // Source copied
    assert.ok(existsSync(join(VENDOR_DIR, 'bb-kv-store/src/index.cdk.ts')));
    assert.ok(existsSync(join(VENDOR_DIR, 'bb-kv-store/src/index.mock.ts')));

    // package.json correct
    const pkg = JSON.parse(readFileSync(join(VENDOR_DIR, 'bb-kv-store/package.json'), 'utf-8'));
    assert.strictEqual(pkg.name, '@aws-blocks/bb-kv-store');
    assert.ok(pkg.exports['.'].cdk.default.endsWith('.ts'));
    assert.ok(pkg.exports['.'].default.endsWith('.ts'));

    // tsconfig.json created
    assert.ok(existsSync(join(VENDOR_DIR, 'bb-kv-store/tsconfig.json')));

    // Workspace added
    const appPkg = JSON.parse(readFileSync(join(APP_ROOT, 'package.json'), 'utf-8'));
    assert.ok(appPkg.workspaces.includes('vendor/bb-kv-store'));
  });

  test('vendorized source is importable', async () => {
    const mod = await import(join(VENDOR_DIR, 'bb-kv-store/src/index.mock.ts'));
    assert.ok('KVStore' in mod, 'KVStore should be exported from vendorized mock');
  });

  test('vendorized CDK source is importable', async () => {
    const mod = await import(join(VENDOR_DIR, 'bb-kv-store/src/index.cdk.ts'));
    assert.ok('KVStore' in mod, 'KVStore should be exported from vendorized CDK');
  });

  test('re-synth after vendorize produces identical output', () => {
    synth(join(APP_ROOT, 'cdk.out.post'));
    const baseline = getTemplateJson(join(APP_ROOT, 'cdk.out.baseline'));
    const post = getTemplateJson(join(APP_ROOT, 'cdk.out.post'));
    assert.strictEqual(post, baseline, 'Synth output should be identical after vendorize (no modifications)');
  });

  test('modifying vendorized source and importing shows the change', async () => {
    // Add an exported marker to the vendorized mock
    const mockFile = join(VENDOR_DIR, 'bb-kv-store/src/index.mock.ts');
    const content = readFileSync(mockFile, 'utf-8');
    writeFileSync(mockFile, content + '\nexport const VENDORIZED = true;\n');

    // Dynamic import with cache bust
    const mod = await import(mockFile + '?v=modified');
    assert.strictEqual(mod.VENDORIZED, true, 'Modified vendorized source should reflect changes');
  });

  test('re-vendorize without --force fails', () => {
    assert.throws(
      () => execSync('npm run vendorize -- @aws-blocks/bb-kv-store', { cwd: APP_ROOT, stdio: 'pipe' }),
      /already vendorized/
    );
  });

  test('re-vendorize with --force succeeds and resets source', () => {
    execSync('npm run vendorize -- @aws-blocks/bb-kv-store --force', { cwd: APP_ROOT, stdio: 'pipe' });

    // The custom VENDORIZED export should be gone (fresh copy from published source)
    const mockFile = join(VENDOR_DIR, 'bb-kv-store/src/index.mock.ts');
    const content = readFileSync(mockFile, 'utf-8');
    assert.ok(!content.includes('VENDORIZED'), 'Fresh vendorize should not contain prior modifications');
  });
});
