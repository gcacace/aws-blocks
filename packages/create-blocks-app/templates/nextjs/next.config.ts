import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Enable standalone output for Lambda deployment
  output: 'standalone',
};

export default nextConfig;
