// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

async function echo(req: NextRequest, method: 'POST' | 'PUT') {
  const contentType = req.headers.get('content-type');
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }
  return NextResponse.json({
    ok: true,
    method,
    runtime: 'nodejs',
    contentType,
    body,
    ts: new Date().toISOString(),
  });
}

export async function POST(req: NextRequest) {
  return echo(req, 'POST');
}

export async function PUT(req: NextRequest) {
  return echo(req, 'PUT');
}

export async function DELETE(req: NextRequest) {
  const url = new URL(req.url);
  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => {
    query[k] = v;
  });
  return NextResponse.json({
    ok: true,
    method: 'DELETE',
    runtime: 'nodejs',
    query,
    ts: new Date().toISOString(),
  });
}
