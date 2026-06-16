// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export default defineEventHandler((event) => {
  const slug = (getRouterParam(event, 'slug') ?? '').split('/').filter(Boolean);
  return { ok: true, method: 'GET', path: slug, url: getRequestURL(event).toString() };
});
