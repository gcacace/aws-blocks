// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Unit tests for the R1 dev/prod routing helpers: the dev-vs-prod intent parse,
 * the "is dev set up?" gate that production configuration depends on, and the
 * `.env.production` writer. All are DB-free and TTY-free (no prompts), so they
 * cover the routing decisions without driving the interactive orchestration.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { ensureGitignored, hasDevConnection, parseDevOrProd, writeProductionEnv } from './pull.js';

const SUPA_DEV = 'postgresql://postgres.devref0001:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres';
const SUPA_PROD = 'postgresql://postgres.prodref9999:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres';

function tmpProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'db-pull-r1-'));
}

describe('parseDevOrProd', () => {
  test('defaults to dev on empty input (the safe choice)', () => {
    assert.equal(parseDevOrProd(''), 'dev');
    assert.equal(parseDevOrProd('   '), 'dev');
  });

  test('recognizes prod / production / p (case-insensitive)', () => {
    assert.equal(parseDevOrProd('prod'), 'prod');
    assert.equal(parseDevOrProd('PRODUCTION'), 'prod');
    assert.equal(parseDevOrProd('  Prod '), 'prod');
    assert.equal(parseDevOrProd('p'), 'prod');
  });

  test('recognizes dev and falls back to dev on anything unknown', () => {
    assert.equal(parseDevOrProd('dev'), 'dev');
    assert.equal(parseDevOrProd('development'), 'dev');
    assert.equal(parseDevOrProd('whatever'), 'dev');
  });
});

describe('hasDevConnection (production prerequisite gate)', () => {
  test('false when .env.local is absent', () => {
    const dir = tmpProject();
    try {
      assert.equal(hasDevConnection(dir), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('true when .env.local holds a non-empty SUPABASE_DB_URL', () => {
    const dir = tmpProject();
    try {
      fs.writeFileSync(path.join(dir, '.env.local'), `SUPABASE_DB_URL=${SUPA_DEV}\n`);
      assert.equal(hasDevConnection(dir), true);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('false when the connection var is present but empty', () => {
    const dir = tmpProject();
    try {
      fs.writeFileSync(path.join(dir, '.env.local'), 'SUPABASE_DB_URL=\n');
      assert.equal(hasDevConnection(dir), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('false when .env.local has unrelated vars only', () => {
    const dir = tmpProject();
    try {
      fs.writeFileSync(path.join(dir, '.env.local'), 'SOME_OTHER=1\nFOO=bar\n');
      assert.equal(hasDevConnection(dir), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('writeProductionEnv', () => {
  test('writes .env.production with the connection string and does not touch dev artifacts', () => {
    const dir = tmpProject();
    try {
      // Seed dev artifacts that must remain untouched.
      fs.writeFileSync(path.join(dir, '.env.local'), `SUPABASE_DB_URL=${SUPA_DEV}\n`);

      const result = writeProductionEnv(dir, SUPA_PROD);

      assert.equal(result.path, path.join(dir, '.env.production'));
      assert.equal(
        fs.readFileSync(path.join(dir, '.env.production'), 'utf-8'),
        `SUPABASE_DB_URL=${SUPA_PROD}\n`,
      );
      // Dev connection is unchanged — prod config must not rewrite .env.local.
      assert.equal(
        fs.readFileSync(path.join(dir, '.env.local'), 'utf-8'),
        `SUPABASE_DB_URL=${SUPA_DEV}\n`,
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('adds .env.production to an existing .gitignore exactly once', () => {
    const dir = tmpProject();
    try {
      fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n.env.local\n');
      const first = writeProductionEnv(dir, SUPA_PROD);
      assert.equal(first.gitignoreUpdated, true);
      const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
      assert.ok(gitignore.includes('.env.production'), 'gitignore now ignores .env.production');

      // Idempotent: a second write does not append a duplicate entry.
      const second = writeProductionEnv(dir, SUPA_PROD);
      assert.equal(second.gitignoreUpdated, false);
      const occurrences = gitignore.split('.env.production').length - 1;
      assert.equal(occurrences, 1, 'no duplicate .env.production line');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('creates a .gitignore (ignoring .env.production) when none exists — credential safety', () => {
    const dir = tmpProject();
    try {
      const result = writeProductionEnv(dir, SUPA_PROD);
      assert.equal(result.gitignoreUpdated, true);
      const gitignorePath = path.join(dir, '.gitignore');
      assert.equal(fs.existsSync(gitignorePath), true, '.gitignore was created');
      assert.ok(
        fs.readFileSync(gitignorePath, 'utf-8').includes('.env.production'),
        'the created .gitignore ignores .env.production',
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ensureGitignored', () => {
  test('creates .gitignore with the entries when none exists', () => {
    const dir = tmpProject();
    try {
      const r = ensureGitignored(dir, ['.env.local', '.env.production']);
      assert.deepEqual(r, { changed: true, created: true });
      const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
      assert.ok(content.includes('.env.local'));
      assert.ok(content.includes('.env.production'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('appends only missing entries to an existing .gitignore (changed, not created)', () => {
    const dir = tmpProject();
    try {
      fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\n.env.local\n');
      const r = ensureGitignored(dir, ['.env.local', '.env.production']);
      assert.deepEqual(r, { changed: true, created: false });
      const content = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');
      assert.equal(content.split('.env.local').length - 1, 1, 'no duplicate .env.local');
      assert.ok(content.includes('.env.production'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('is a no-op when all entries are already present', () => {
    const dir = tmpProject();
    try {
      fs.writeFileSync(path.join(dir, '.gitignore'), '.env.local\n.env.production\n');
      const r = ensureGitignored(dir, ['.env.local', '.env.production']);
      assert.deepEqual(r, { changed: false, created: false });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('matches whole lines — .env.production.example does not mask .env.production', () => {
    const dir = tmpProject();
    try {
      fs.writeFileSync(path.join(dir, '.gitignore'), '.env.production.example\n');
      const r = ensureGitignored(dir, ['.env.production']);
      assert.equal(r.changed, true, '.env.production added despite the .example substring');
      const lines = fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8').split('\n');
      assert.ok(lines.includes('.env.production'), 'exact .env.production line present');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
