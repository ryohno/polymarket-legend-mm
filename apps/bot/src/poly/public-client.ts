/**
 * Shared viem PublicClient for on-chain reads (balances, allowances, positions).
 * Use sparingly — most hot-path data comes from the WS feed and SQLite.
 */

import { createPublicClient, http, type PublicClient } from 'viem'
import { polygon } from 'viem/chains'

let cached: PublicClient | null = null

export function getPublicClient(rpcUrl: string): PublicClient {
  if (cached) return cached
  cached = createPublicClient({
    chain: polygon,
    transport: http(rpcUrl),
  })
  return cached
}
