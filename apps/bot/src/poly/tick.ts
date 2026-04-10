/**
 * Tick size cache + price snapping.
 *
 * Polymarket markets start at a static tick size (e.g. 0.01) but can narrow
 * automatically as price approaches 0 or 1. We prime the cache from the market
 * config and refresh on:
 *   - a `tick_size_change` event from the /ws/market channel
 *   - a stale-cache-based TTL (60s)
 */

import type { ClobClient } from '@polymarket/clob-client'
import type { MarketDef } from '@polymm/shared'

const TTL_MS = 60_000

interface TickEntry {
  tickSize: number
  updatedAt: number
}

export class TickSizeCache {
  private readonly entries = new Map<string, TickEntry>()
  constructor(private readonly client: ClobClient) {}

  /** Prime the cache from the static market config. */
  prime(markets: readonly MarketDef[]): void {
    const now = Date.now()
    for (const m of markets) {
      this.entries.set(m.yesTokenId, { tickSize: m.tickSize, updatedAt: now })
      this.entries.set(m.noTokenId, { tickSize: m.tickSize, updatedAt: now })
    }
  }

  /** Get tick size, fetching from CLOB if stale/missing. */
  async get(tokenId: string): Promise<number> {
    const entry = this.entries.get(tokenId)
    if (entry && Date.now() - entry.updatedAt < TTL_MS) {
      return entry.tickSize
    }
    const fetched = await this.client.getTickSize(tokenId)
    const parsed = typeof fetched === 'string' ? parseFloat(fetched) : fetched
    this.entries.set(tokenId, { tickSize: parsed, updatedAt: Date.now() })
    return parsed
  }

  /** Update from a WS tick_size_change event. */
  applyWsUpdate(tokenId: string, newTickSize: number): void {
    this.entries.set(tokenId, { tickSize: newTickSize, updatedAt: Date.now() })
  }

  /** Synchronous read; returns undefined if not primed. */
  peek(tokenId: string): number | undefined {
    return this.entries.get(tokenId)?.tickSize
  }
}
