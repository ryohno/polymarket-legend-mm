import type { NextConfig } from 'next'

const config: NextConfig = {
  // better-sqlite3 is a native module — exclude it from Webpack bundling
  // so Next.js uses require() at runtime.
  serverExternalPackages: ['better-sqlite3'],
  experimental: {
    // Allow importing from workspace packages outside next.config
    // externalDir: true,
  },
}

export default config
