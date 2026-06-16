// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { SUPABASE, SUPABASE_MESSAGING, detectSupabase, extractProjectRef } from './supabase.js';

describe('extractProjectRef', () => {
  test('extracts the ref from a Supabase pooler connection string', () => {
    assert.equal(
      extractProjectRef('postgresql://postgres.abcdefghij:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres'),
      'abcdefghij',
    );
  });

  test('extracts the ref regardless of port (5432 / 6543)', () => {
    assert.equal(
      extractProjectRef('postgresql://postgres.zzz123:pw@region.pooler.supabase.com:6543/postgres?prepared_statements=false'),
      'zzz123',
    );
  });

  test('returns undefined for a non-Supabase string (plain postgres user, no ref)', () => {
    assert.equal(extractProjectRef('postgresql://postgres:pw@db.example.com:5432/app'), undefined);
    assert.equal(extractProjectRef('postgresql://user:pw@host:5432/db'), undefined);
  });
});

describe('SUPABASE identifiers (load-bearing — must stay byte-stable for back-compat)', () => {
  // These strings are baked into already-deployed apps and the AppSetting mock
  // path coupling. Changing them silently breaks existing customers, so this test
  // is a tripwire, not a behavioral assertion. See db-pull/supabase.ts.
  test('stable identifiers are unchanged', () => {
    assert.equal(SUPABASE.scopeName, 'supabase');
    assert.equal(SUPABASE.generatedDbFile, 'supabase.ts');
    assert.equal(SUPABASE.crudExportName, 'supabaseCrud');
    assert.equal(SUPABASE.connStringEnvVar, 'SUPABASE_DB_URL');
  });
});

describe('detectSupabase', () => {
  test('true for a Supabase pooler connection string', () => {
    assert.equal(
      detectSupabase('postgresql://postgres.abcdefghij:pw@aws-0-us-east-1.pooler.supabase.com:5432/postgres'),
      true,
    );
  });

  test('false for a non-Supabase Postgres string', () => {
    assert.equal(detectSupabase('postgresql://postgres:pw@db.example.com:5432/app'), false);
    assert.equal(detectSupabase('postgresql://user:pw@host:6543/db'), false);
  });
});

describe('SUPABASE_MESSAGING (provider-gated customer-facing strings)', () => {
  // These surface the Supabase-specific copy through the provider seam so the
  // orchestrator carries no `provider === 'supabase'` branches. Asserting the
  // exact values keeps the customer-visible output byte-stable.
  test('values are unchanged', () => {
    assert.equal(SUPABASE_MESSAGING.authEligibilityLabel, 'Supabase Auth');
    assert.equal(SUPABASE_MESSAGING.authIneligibleReason, 'No — Supabase Auth not yet supported');
    assert.equal(SUPABASE_MESSAGING.grantSqlLocation, 'run in Supabase SQL editor');
  });
});
