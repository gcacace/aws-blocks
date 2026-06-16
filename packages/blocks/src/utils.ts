// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Installs a cookie jar on `global.fetch` so that `Set-Cookie` response
 * headers persist across requests. Node's native fetch doesn't do this.
 *
 * Call once before importing the API client. Required for any Node.js script
 * that uses authenticated APIs (tests, CLI tools, migration scripts).
 *
 * @returns A cleanup function that restores the original fetch.
 *
 * @example
 * ```typescript
 * import { installCookieJar } from '@aws-blocks/blocks/utils';
 * installCookieJar();
 *
 * const { api, authApi } = await import('aws-blocks');
 * await authApi.setAuthState({ action: 'signIn', username: '...', password: '...' });
 * // Subsequent calls now carry the auth cookie automatically
 * const data = await api.listTodos();
 * ```
 */
let installed = false;

export function installCookieJar(): () => void {
  if (installed) throw new Error('Cookie jar is already installed.');
  installed = true;

  const jar = new Map<string, string>();
  const nativeFetch = global.fetch;

  global.fetch = (async (input: any, init?: any) => {
    if (jar.size > 0) {
      const cookieHeader = Array.from(jar.values()).join('; ');
      init = init ?? {};
      init.headers = { ...init.headers, cookie: cookieHeader };
    }

    const response = await nativeFetch(input, init);

    for (const sc of response.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(';');
      const [name, ...rest] = pair.split('=');
      const value = rest.join('=');
      if (value && !sc.includes('Max-Age=0')) {
        jar.set(name.trim(), `${name.trim()}=${value}`);
      } else {
        jar.delete(name.trim());
      }
    }

    return response;
  }) as typeof fetch;

  return () => { global.fetch = nativeFetch; installed = false; };
}

/**
 * Returns true if a server is already listening on the given port.
 * Useful in test setup to skip spawning a dev server when one is already running.
 *
 * @param port - Port to check (default: 3000)
 *
 * @example
 * ```typescript
 * import { isServerRunning } from '@aws-blocks/blocks/utils';
 *
 * if (!await isServerRunning()) {
 *   server = spawn('npm', ['run', 'dev:server'], { ... });
 * }
 * ```
 */
export async function isServerRunning(port = 3000): Promise<boolean> {
  try {
    await fetch(`http://localhost:${port}`);
    return true;
  } catch (e: any) {
    if (e.cause?.code === 'ECONNREFUSED' || e.cause === 'ECONNREFUSED') {
      return false;
    }
    throw e;
  }
}
