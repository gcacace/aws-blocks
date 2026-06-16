// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const incoming: Record<string, string> = {};
  req.cookies.getAll().forEach((c) => {
    incoming[c.name] = c.value;
  });

  const res = NextResponse.json({ ok: true, runtime: 'nodejs', incoming });
  res.cookies.set('stress-a', '1', { path: '/' });
  res.cookies.set('stress-b', '2', { path: '/', httpOnly: true });
  res.cookies.set('stress-c', '3', { path: '/', sameSite: 'lax', secure: true });
  return res;
}
