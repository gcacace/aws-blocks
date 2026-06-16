// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export default defineEventHandler(async (event) => {
  const ms = Number(getQuery(event).ms ?? 25_000);
  await new Promise((r) => setTimeout(r, ms));
  return { ok: true, slept: ms };
});
