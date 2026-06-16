// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length === 0) {
    return NextResponse.json({ error: 'no body' }, { status: 400 });
  }
  const sha256 = createHash('sha256').update(buf).digest('hex');
  return NextResponse.json({
    ok: true,
    runtime: 'nodejs',
    bytes: buf.length,
    sha256,
    contentType: req.headers.get('content-type'),
  });
}
