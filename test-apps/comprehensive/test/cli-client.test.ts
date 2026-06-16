// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const projectRoot = join(__dirname, '..');

/**
 * CLI client tests — verifies generateClient() works for out-of-context
 * consumers (CLIs, micro-frontends, cross-repo packages) that can't rely
 * on automatic config.json discovery.
 *
 * Each test spawns a subprocess to simulate a real CLI environment.
 * The subprocess imports client.js by absolute path (so the module resolves),
 * but runs from a chosen CWD (which controls whether config.json is discoverable).
 */
export function cliClientTests() {
  describe('CLI Client (generateClient)', () => {

    test('default export fails when CWD has no config.json', { timeout: 15_000 }, async () => {
      // CWD is /tmp — no .blocks-sandbox/config.json exists there.
      // The client's auto-discovery reads config.json relative to CWD, so it fails.
      const result = runCli(`
        const { api } = await import('aws-blocks');
        await api.echoData('ping');
      `, { cwd: '/tmp' });

      assert.ok(result.exitCode !== 0, 'Should have failed');
      assert.ok(
        result.stderr.includes('Blocks API URL not configured') || result.stderr.includes('ENOENT') || result.stderr.includes('fetch'),
        `Expected config discovery error, got: ${result.stderr}`
      );
    });

    test('generateClient with incorrect URL fails', { timeout: 15_000 }, async () => {
      const result = runCli(`
        const { generateClient } = await import('aws-blocks');
        const { api } = generateClient({ url: 'http://localhost:19999/api' });
        await api.echoData('ping');
      `);

      assert.ok(result.exitCode !== 0, 'Should have failed');
      assert.ok(
        result.stderr.includes('ECONNREFUSED') || result.stderr.includes('fetch failed') || result.stderr.includes('connect'),
        `Expected connection error, got: ${result.stderr}`
      );
    });

    test('generateClient with correct URL succeeds', { timeout: 15_000 }, async () => {
      const config = JSON.parse(readFileSync(join(projectRoot, '.blocks-sandbox', 'config.json'), 'utf-8'));

      // CWD is /tmp (no config.json), but generateClient bypasses discovery entirely.
      const result = runCli(`
        const { generateClient } = await import('aws-blocks');
        const { api } = generateClient({ url: '${config.apiUrl}' });
        const result = await api.echoData('hello from CLI');
        if (result !== 'hello from CLI') throw new Error('Expected echo, got: ' + JSON.stringify(result));
        console.log('OK');
      `, { cwd: '/tmp' });

      assert.strictEqual(result.exitCode, 0, `Should succeed, stderr: ${result.stderr}`);
      assert.ok(result.stdout.includes('OK'));
    });
  });
}

/**
 * Run an inline script as a subprocess simulating a CLI consumer.
 *
 * Rewrites `import('aws-blocks')` to use the absolute path to client.js so the
 * module resolves regardless of CWD. The CWD only affects config.json discovery
 * (which reads relative to process.cwd()), not module resolution.
 */
function runCli(script: string, opts?: { cwd?: string }): { exitCode: number; stdout: string; stderr: string } {
  const cwd = opts?.cwd ?? projectRoot;
  const clientPath = join(projectRoot, 'aws-blocks', 'client.js');
  const resolvedScript = script.replace(/import\('aws-blocks'\)/g, `import('${clientPath}')`);
  // Wrap in async IIFE — tsx -e uses CJS mode where top-level await is unsupported.
  const wrapped = `(async () => { ${resolvedScript} })().catch(e => { console.error(e); process.exit(1); })`;
  try {
    const stdout = execFileSync('npx', ['tsx', '-e', wrapped], {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 12_000,
      env: { ...process.env, NODE_OPTIONS: '' },
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (e: any) {
    return { exitCode: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}
