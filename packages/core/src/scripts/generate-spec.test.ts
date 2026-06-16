/**
 * Integration test for `generateSpec`. Builds a tiny backend file with one
 * normal method and one `@blocksSkipCodegen`-tagged method, runs the spec
 * emitter, and asserts the tagged method is dropped from the OpenRPC
 * document.
 *
 * Uses a `.js` foundation file so plain `node --test dist/...` can run the
 * test without a TypeScript loader. The TS compiler still parses JSDoc on
 * the `.js` file when `allowJs` is enabled in the synthetic tsconfig.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath, pathToFileURL } from 'url';
import { generateSpec } from './generate-spec.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// `import.meta.url` lives in dist/scripts/, so `..` is dist/ and the built
// `api.js` is next to it. Re-using the real ApiNamespace ensures the marker
// symbol matches what `generateSpec` discovers.
const builtApiUrl = pathToFileURL(join(__dirname, '..', 'api.js')).href;

function writeTsconfig(dir: string): void {
	writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
		compilerOptions: {
			target: 'ESNext',
			module: 'ESNext',
			moduleResolution: 'bundler',
			allowJs: true,
			esModuleInterop: true,
			skipLibCheck: true,
		},
	}));
}

describe('generateSpec — @blocksSkipCodegen', () => {
	it('drops methods carrying @blocksSkipCodegen from the OpenRPC document', async () => {
		const dir = join(tmpdir(), `blocks-spec-test-${Date.now()}-skip`);
		mkdirSync(dir, { recursive: true });
		writeTsconfig(dir);

		writeFileSync(join(dir, 'index.js'), `
			import { ApiNamespace } from ${JSON.stringify(builtApiUrl)};

			export const api = new ApiNamespace(null, 'api', (context) => ({
				async normalMethod(name) {
					return { greeting: 'hi ' + name };
				},

				/**
				 * Mock-only helper.
				 * @blocksSkipCodegen
				 */
				async getLastCode() {
					return null;
				},
			}));
		`);

		try {
			const doc = await generateSpec(join(dir, 'index.js'));
			const methodNames = doc.methods.map((m) => m.name).sort();
			assert.deepStrictEqual(
				methodNames,
				['api.normalMethod'],
				'getLastCode should be omitted; only normalMethod should remain',
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('keeps methods that do not carry the tag', async () => {
		const dir = join(tmpdir(), `blocks-spec-test-${Date.now()}-keep`);
		mkdirSync(dir, { recursive: true });
		writeTsconfig(dir);

		writeFileSync(join(dir, 'index.js'), `
			import { ApiNamespace } from ${JSON.stringify(builtApiUrl)};

			export const api = new ApiNamespace(null, 'api', (context) => ({
				/** Plain JSDoc with no special tag. */
				async ping() { return { ok: true }; },
				async echo(s) { return s; },
			}));
		`);

		try {
			const doc = await generateSpec(join(dir, 'index.js'));
			const methodNames = doc.methods.map((m) => m.name).sort();
			assert.deepStrictEqual(methodNames, ['api.echo', 'api.ping']);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
