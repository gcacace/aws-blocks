// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export default defineEventHandler((event) => {
  const incoming = parseCookies(event);
  setCookie(event, 'stress-a', '1', { path: '/' });
  setCookie(event, 'stress-b', '2', { path: '/', httpOnly: true });
  setCookie(event, 'stress-c', '3', { path: '/', sameSite: 'lax', secure: true });
  return { ok: true, runtime: 'nodejs', incoming };
});
