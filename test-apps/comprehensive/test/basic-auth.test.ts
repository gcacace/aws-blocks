// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { describe, test } from 'node:test';
import assert from 'node:assert';
import { isBlocksError } from '@aws-blocks/core';
import type { api as apiType } from 'aws-blocks';

const InvalidCredentials = 'InvalidCredentialsException';
const UserAlreadyExists = 'UserAlreadyExistsException';
const SessionExpired = 'SessionExpiredException';
const InvalidPassword = 'InvalidPasswordException';
const InvalidCode = 'InvalidCodeException';

function uniqueUser() {
  return `user-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Poll authGetLastCode until a code is available (handles async delivery race). */
async function pollForCode(api: typeof apiType, maxMs = 15000): Promise<{ username: string; code: string }> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const result = await api.authGetLastCode();
    if (result) return result;
    await new Promise(r => global.setTimeout(r, 200));
  }
  throw new Error(`authGetLastCode() returned null after ${maxMs}ms`);
}

export function basicAuthTests(getApi: () => typeof apiType) {

  describe('AuthBasic', () => {

    // ── Sign Up (code-confirmed) ─────────────────────────────────────────

    describe('signUp', () => {
      test('creates user in unconfirmed state — signIn rejected until confirmed', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');

        // Can't sign in yet — unconfirmed
        try {
          await api.authSignIn(username, 'password123');
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, InvalidCredentials), `Expected ${InvalidCredentials}, got ${e}`);
        }
      });

      test('confirm signup with code — then signIn succeeds', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');

        const delivered = await pollForCode(api);
        assert.ok(delivered, 'Code should have been delivered');
        assert.strictEqual(delivered!.username, username);

        await api.authConfirmSignUp(username, delivered!.code);

        const user = await api.authSignIn(username, 'password123');
        assert.strictEqual(user.username, username);
        assert.ok(user.createdAt);
        await api.authSignOut();
      });

      test('confirm signup with wrong code — rejected', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');

        try {
          await api.authConfirmSignUp(username, '000000');
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, InvalidCode), `Expected ${InvalidCode}, got ${e}`);
        }
      });

      test('rejects duplicate username', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        try {
          await api.authSignUp(username, 'password456');
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, UserAlreadyExists), `Expected ${UserAlreadyExists}, got ${e}`);
        }
      });

      test('rejects password below minLength policy', async () => {
        const api = getApi();
        try {
          await api.authSignUp(uniqueUser(), 'short');
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, InvalidPassword), `Expected ${InvalidPassword}, got ${e}`);
        }
      });
    });

    // ── Sign In ──────────────────────────────────────────────────────────

    describe('signIn', () => {
      test('returns user on valid credentials', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        const code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);

        const user = await api.authSignIn(username, 'password123');
        assert.strictEqual(user.username, username);
        assert.ok(user.userId);
        await api.authSignOut();
      });

      test('rejects wrong password', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        const code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);

        try {
          await api.authSignIn(username, 'wrongpassword');
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, InvalidCredentials), `Expected ${InvalidCredentials}, got ${e}`);
        }
      });

      test('rejects non-existent user', async () => {
        const api = getApi();
        try {
          await api.authSignIn('no-such-user-ever', 'password123');
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, InvalidCredentials), `Expected ${InvalidCredentials}, got ${e}`);
        }
      });
    });

    // ── Session persistence ──────────────────────────────────────────────

    describe('session', () => {
      test('signIn sets session cookie — getCurrentUser returns user', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        const code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);
        await api.authSignIn(username, 'password123');

        const user = await api.authGetCurrentUser();
        assert.ok(user, 'getCurrentUser should return user after signIn');
        assert.strictEqual(user!.username, username);
        await api.authSignOut();
      });

      test('signIn sets session cookie — checkAuth returns true', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        const code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);
        await api.authSignIn(username, 'password123');

        assert.strictEqual(await api.authCheckAuth(), true);
        await api.authSignOut();
      });

      test('signIn sets session cookie — requireAuth returns user', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        const code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);
        await api.authSignIn(username, 'password123');

        const result = await api.authRequired();
        assert.strictEqual(result.user.username, username);
        await api.authSignOut();
      });

      test('signOut clears session — getCurrentUser returns null', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        const code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);
        await api.authSignIn(username, 'password123');
        await api.authSignOut();

        assert.strictEqual(await api.authGetCurrentUser(), null);
        assert.strictEqual(await api.authCheckAuth(), false);
      });

      test('signOut clears session — requireAuth throws', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        const code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);
        await api.authSignIn(username, 'password123');
        await api.authSignOut();

        try {
          await api.authRequired();
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, SessionExpired), `Expected ${SessionExpired}, got ${e}`);
        }
      });

      test('no session — getCurrentUser returns null', async () => {
        const api = getApi();
        await api.authSignOut();
        assert.strictEqual(await api.authGetCurrentUser(), null);
      });
    });

    // ── Password Reset ───────────────────────────────────────────────────

    describe('password reset', () => {
      test('resetPassword does not throw for non-existent user', async () => {
        const api = getApi();
        await api.authResetPassword('no-such-user-ever');
      });

      test('full reset flow — reset, confirm with code, sign in with new password', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        let code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);

        // Request reset
        await api.authResetPassword(username);
        code = await pollForCode(api);
        assert.ok(code);
        assert.strictEqual(code!.username, username);

        // Confirm reset with new password
        await api.authConfirmResetPassword(username, code!.code, 'newpass123');

        // Old password should fail
        try {
          await api.authSignIn(username, 'password123');
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, InvalidCredentials));
        }

        // New password should work
        const user = await api.authSignIn(username, 'newpass123');
        assert.strictEqual(user.username, username);
        await api.authSignOut();
      });

      test('confirmResetPassword rejects invalid code', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        let code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);
        await api.authResetPassword(username);

        try {
          await api.authConfirmResetPassword(username, '000000', 'newpass123');
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, InvalidCode), `Expected ${InvalidCode}, got ${e}`);
        }
      });

      test('confirmResetPassword rejects without prior reset request', async () => {
        const api = getApi();
        const username = uniqueUser();
        await api.authSignUp(username, 'password123');
        const code = await pollForCode(api);
        await api.authConfirmSignUp(username, code!.code);

        try {
          await api.authConfirmResetPassword(username, '123456', 'newpass123');
          assert.fail('Expected error');
        } catch (e) {
          assert.ok(isBlocksError(e, InvalidCode), `Expected ${InvalidCode}, got ${e}`);
        }
      });
    });

  });

}
