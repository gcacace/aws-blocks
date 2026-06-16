import { ApiNamespace, Scope } from '@aws-blocks/core';
import { KVStore } from '@aws-blocks/bb-kv-store';
import { DistributedDatabase } from '@aws-blocks/bb-distributed-data';
import { sql } from '@aws-blocks/data-common';
import { CognitoVerifier } from './cognito-verifier.js';

// Keep the Scope id a STABLE LOGICAL id — it must be byte-for-byte identical at
// synth time and at Lambda runtime, since physical resource names (tables, IAM
// grants, env-var keys) are derived from it. Per-deployment uniqueness already
// comes from the stack name, which BlocksBackend folds in via BLOCKS_STACK_NAME. Do
// NOT mix in build-only values (e.g. BLOCKS_STACK_SUFFIX) — they are absent at
// runtime, so the names baked at synth would not match what the code looks up.
const scope = new Scope('amp-gen2');

const store = new KVStore(scope, 'notes', {});

const db = new DistributedDatabase(scope, 'db', {
  migrationsPath: './aws-blocks/migrations',
});

const auth = new CognitoVerifier({
  userPoolId: process.env.COGNITO_USER_POOL_ID!,
  clientId: process.env.COGNITO_CLIENT_ID!,
  tokenUse: 'id',
});

export const api = new ApiNamespace(scope, 'api', (context) => ({
  // Public — no auth required
  async greet(name: string) {
    return { message: `Hello from Blocks, ${name}!`, timestamp: Date.now() };
  },

  // Protected — requires signed-in user
  async putNote(key: string, value: string) {
    const user = await auth.requireAuth(context);
    await store.put(`${user.sub}:${key}`, value);
    return { success: true };
  },

  async getNote(key: string) {
    const user = await auth.requireAuth(context);
    return { value: await store.get(`${user.sub}:${key}`) };
  },

  // ── Database (Aurora DSQL) ──────────────────────────────────────────────

  async createTodo(title: string) {
    const user = await auth.requireAuth(context);
    const id = `todo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    await db.execute(sql`
      INSERT INTO todos (id, title, owner_id) VALUES (${id}, ${title}, ${user.sub})
    `);
    return { id, title, ownerId: user.sub };
  },

  async listTodos() {
    const user = await auth.requireAuth(context);
    const rows = await db.query<{ id: string; title: string; completed: boolean; created_at: string }>(sql`
      SELECT id, title, completed, created_at FROM todos WHERE owner_id = ${user.sub} ORDER BY created_at DESC
    `);
    return rows;
  },

  async completeTodo(id: string) {
    const user = await auth.requireAuth(context);
    const result = await db.execute(sql`
      UPDATE todos SET completed = true WHERE id = ${id} AND owner_id = ${user.sub}
    `);
    return { success: result.rowCount > 0 };
  },

  async deleteTodo(id: string) {
    const user = await auth.requireAuth(context);
    const result = await db.execute(sql`
      DELETE FROM todos WHERE id = ${id} AND owner_id = ${user.sub}
    `);
    return { success: result.rowCount > 0 };
  },
}));
