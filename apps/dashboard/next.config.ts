import type { NextConfig } from 'next'

const config: NextConfig = {
  // better-sqlite3 is a native module — exclude it from Webpack bundling
  // so Next.js uses require() at runtime.
  serverExternalPackages: ['better-sqlite3'],
  // Let Next transpile the workspace shared package so its `.js` ESM-style
  // imports resolve against the actual `.ts` sources.
  transpilePackages: ['@polymm/shared'],
}

export default config
