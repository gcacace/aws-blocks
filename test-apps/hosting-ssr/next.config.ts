// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  redirects: async () => [
    { source: '/redirected', destination: '/', permanent: false },
  ],
  rewrites: async () => [
    { source: '/rewritten', destination: '/api/probe/echo' },
  ],
  headers: async () => [
    {
      source: '/headers-test',
      headers: [
        { key: 'x-stress-test', value: 'on' },
        { key: 'cache-control', value: 's-maxage=120, stale-while-revalidate=60' },
      ],
    },
  ],
};

export default nextConfig;
