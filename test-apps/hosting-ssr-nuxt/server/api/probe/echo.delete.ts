// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export default defineEventHandler((event) => ({
  ok: true,
  method: 'DELETE',
  runtime: 'nodejs',
  query: getQuery(event),
  ts: new Date().toISOString(),
}));
