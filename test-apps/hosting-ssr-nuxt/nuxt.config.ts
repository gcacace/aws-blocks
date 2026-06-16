// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },

  nitro: {
    awsLambda: { streaming: true },
    experimental: { asyncContext: true },
  },

  routeRules: {
    '/about': { prerender: true },
    '/headers-test': {
      headers: {
        'x-stress-test': 'on',
        'cache-control': 's-maxage=120, stale-while-revalidate=60',
      },
    },
    '/old-page': { redirect: '/about' },
  },
});
