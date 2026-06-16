// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto';

export default defineEventHandler(async (event) => {
  const buf = await readRawBody(event, false);
  if (!buf) throw createError({ statusCode: 400, statusMessage: 'no body' });
  const sha256 = createHash('sha256').update(buf).digest('hex');
  return {
    ok: true,
    runtime: 'nodejs',
    bytes: buf.length,
    sha256,
    contentType: getRequestHeader(event, 'content-type') ?? null,
  };
});
