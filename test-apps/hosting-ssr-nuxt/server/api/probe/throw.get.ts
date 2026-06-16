// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export default defineEventHandler(() => {
  throw createError({ statusCode: 500, statusMessage: 'intentional' });
});
