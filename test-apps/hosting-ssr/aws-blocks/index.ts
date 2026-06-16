// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

// Blog with Auth — SSR e2e test backend
// AuthBasic + posts CRUD + profile

import { ApiNamespace, Scope, KVStore, AuthBasic } from '@aws-blocks/blocks';

const scope = new Scope('hosting-ssr-test');

// Verification codes are sensitive. e2e tests read them via the API getter
// below, not from logs — so only echo to the console in local/mock dev. In the
// deployed Lambda this is a no-op so codes never reach CloudWatch.
const isDeployedLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;

// ── Auth ────────────────────────────────────────────────────────────────────

let lastDeliveredCode: { username: string; code: string } | null = null;
const auth = new AuthBasic(scope, 'auth', {
  sessionDuration: 86400,
  passwordPolicy: { minLength: 6 },
  codeDelivery: async (username, code) => {
    lastDeliveredCode = { username, code };
    if (!isDeployedLambda) console.log(`[AuthBasic] Code for "${username}": ${code}`);
  },
});

// ── Data stores ─────────────────────────────────────────────────────────────

const posts = new KVStore(scope, 'posts', {});
const postIndex = new KVStore(scope, 'post-index', {});
const userPosts = new KVStore(scope, 'user-posts', {});

// ── API ─────────────────────────────────────────────────────────────────────

export const api = new ApiNamespace(scope, 'api', (context) => ({
  // Public
  async listPosts() {
    const indexRaw = await postIndex.get('all');
    const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    const result = [];
    for (const id of ids) {
      const raw = await posts.get(id);
      if (raw) result.push(JSON.parse(raw));
    }
    return result.reverse();
  },

  async getPost(id: string) {
    const raw = await posts.get(id);
    return raw ? JSON.parse(raw) : null;
  },

  // Auth
  async authSignUp(username: string, password: string) {
    await auth.signUp(username, password);
    return { success: true };
  },

  async authConfirmSignUp(username: string, code: string) {
    await auth.confirmSignUp(username, code);
    return { success: true };
  },

  async authSignIn(username: string, password: string) {
    const user = await auth.signIn(username, password, context);
    return { userId: user.userId, username: user.username };
  },

  async authSignOut() {
    await auth.signOut(context);
    return { success: true };
  },

  async authCheckAuth() {
    return await auth.checkAuth(context);
  },

  async authGetLastCode() {
    return lastDeliveredCode;
  },

  // Protected
  async getProfile() {
    const user = await auth.requireAuth(context);
    const myPostsRaw = await userPosts.get(`user:${user.username}`);
    const myPostIds: string[] = myPostsRaw ? JSON.parse(myPostsRaw) : [];
    return { username: user.username, userId: user.userId, postCount: myPostIds.length };
  },

  async createPost(title: string, body: string) {
    const user = await auth.requireAuth(context);
    const id = `post-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const post = { id, title, body, author: user.username, createdAt: new Date().toISOString() };
    await posts.put(id, JSON.stringify(post));

    // Add to global index
    const indexRaw = await postIndex.get('all');
    const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    ids.push(id);
    await postIndex.put('all', JSON.stringify(ids));

    // Add to user's posts
    const myPostsRaw = await userPosts.get(`user:${user.username}`);
    const myPostIds: string[] = myPostsRaw ? JSON.parse(myPostsRaw) : [];
    myPostIds.push(id);
    await userPosts.put(`user:${user.username}`, JSON.stringify(myPostIds));

    return post;
  },

  async listMyPosts() {
    const user = await auth.requireAuth(context);
    const myPostsRaw = await userPosts.get(`user:${user.username}`);
    const myPostIds: string[] = myPostsRaw ? JSON.parse(myPostsRaw) : [];
    const result = [];
    for (const id of myPostIds) {
      const raw = await posts.get(id);
      if (raw) result.push(JSON.parse(raw));
    }
    return result.reverse();
  },

  async deletePost(id: string) {
    const user = await auth.requireAuth(context);
    const raw = await posts.get(id);
    if (!raw) return { success: false };
    const post = JSON.parse(raw);
    if (post.author !== user.username) throw new Error('Not authorized to delete this post');

    await posts.delete(id);

    // Remove from global index
    const indexRaw = await postIndex.get('all');
    const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    await postIndex.put('all', JSON.stringify(ids.filter(i => i !== id)));

    // Remove from user's posts
    const myPostsRaw = await userPosts.get(`user:${user.username}`);
    const myPostIds: string[] = myPostsRaw ? JSON.parse(myPostsRaw) : [];
    await userPosts.put(`user:${user.username}`, JSON.stringify(myPostIds.filter(i => i !== id)));

    return { success: true };
  },
}));

export const authApi = auth.createApi();
