// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Installs a cookie jar on `global.fetch` so that `Set-Cookie` response
 * headers persist across requests. Node's native fetch doesn't do this.
 *
 * Call once before any API imports. Returns a cleanup function that
 * restores the original fetch.
 *
 * @throws If a cookie jar is already installed.
 */
let installed = false;

export function installCookieJar(): () => void {
  if (installed) throw new Error('Cookie jar is already installed. Do NOT attempt to install or clean up nested cookie jar management.');
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
