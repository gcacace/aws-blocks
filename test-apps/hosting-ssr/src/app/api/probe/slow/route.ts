// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MAX_MS = 30_000;

export async function GET(req: Request) {
  const requested = Number(new URL(req.url).searchParams.get('ms') ?? 25_000);
  const ms = Number.isFinite(requested) ? Math.min(Math.max(requested, 0), MAX_MS) : 25_000;
  await new Promise((r) => setTimeout(r, ms));
  return NextResponse.json({ ok: true, slept: ms });
}
