import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const config: NextConfig = {
  output: process.env.REVIEWLAB_STANDALONE === '1' ? 'standalone' : undefined,
  outputFileTracingRoot: root,
  turbopack: { root },
  transpilePackages: ['@reviewlab/api'],
  poweredByHeader: false,
  agentRules: false,
  devIndicators: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};

export default config;
