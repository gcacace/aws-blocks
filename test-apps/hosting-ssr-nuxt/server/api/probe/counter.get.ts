// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

const g = globalThis as unknown as { __counter?: { value: number } };
function counter() {
  if (!g.__counter) g.__counter = { value: 0 };
  return g.__counter;
}

export default defineEventHandler(() => ({ value: counter().value }));
