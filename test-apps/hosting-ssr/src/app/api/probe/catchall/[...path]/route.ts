// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return NextResponse.json({ ok: true, method: 'GET', path, url: req.url });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  let body: unknown = null;
  try { body = await req.json(); } catch {}
  return NextResponse.json({ ok: true, method: 'POST', path, body });
}
