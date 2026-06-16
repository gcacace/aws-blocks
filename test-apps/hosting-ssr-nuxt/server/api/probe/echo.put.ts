// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => null);
  return {
    ok: true,
    method: 'PUT',
    runtime: 'nodejs',
    contentType: getRequestHeader(event, 'content-type') ?? null,
    body,
    ts: new Date().toISOString(),
  };
});
