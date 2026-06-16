-- Supabase E2E test schema.
-- Applied automatically by test/apply-schema.ts at the start of E2E runs.
-- All statements are idempotent (IF NOT EXISTS / DROP IF EXISTS).

-- ── Existing: todos (auth.uid() policy — should be SKIPPED by db pull) ──

CREATE TABLE IF NOT EXISTS todos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  content text NOT NULL,
  done boolean NOT NULL DEFAULT false
);

ALTER TABLE todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_todos" ON todos;
CREATE POLICY "users_own_todos" ON todos
  FOR ALL USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON todos TO authenticated;

-- ── Composite PK ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS composite_pk_items (
  order_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, product_id)
);

ALTER TABLE composite_pk_items DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON composite_pk_items TO authenticated;

-- ── No PK (append-only log) ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS no_pk_log (
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE no_pk_log DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON no_pk_log TO authenticated;

-- ── Unmapped PG types ───────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE IF NOT EXISTS exotic_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  display_name citext NOT NULL,
  ip_address inet,
  search_vector tsvector
);

ALTER TABLE exotic_types DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON exotic_types TO authenticated;

-- ── Reserved-word columns ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS reserved_cols (
  id serial PRIMARY KEY,
  "order" integer NOT NULL,
  "group" text,
  "select" boolean NOT NULL DEFAULT false
);

ALTER TABLE reserved_cols DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON reserved_cols TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE reserved_cols_id_seq TO authenticated;

-- ── OIDC-compatible RLS (auth.jwt(), NOT auth.uid()) — should be INCLUDED ─

CREATE TABLE IF NOT EXISTS jwt_policy_table (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_sub text NOT NULL,
  content text NOT NULL
);

ALTER TABLE jwt_policy_table ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "jwt_sub_policy" ON jwt_policy_table;
CREATE POLICY "jwt_sub_policy" ON jwt_policy_table
  FOR ALL USING ((auth.jwt() ->> 'sub') = owner_sub);

GRANT SELECT, INSERT, UPDATE, DELETE ON jwt_policy_table TO authenticated;
