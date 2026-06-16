// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export default defineEventHandler(() => ({
  ok: true,
  runtime: 'nodejs',
  ts: new Date().toISOString(),
}));
