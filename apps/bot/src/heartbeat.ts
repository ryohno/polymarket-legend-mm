/**
 * CLOB heartbeat — dead-man switch.
 *
 * Polymarket's CLOB supports a `POST /heartbeat` endpoint that acts as a
 * dead-man switch: if the bot stops sending heartbeats for >10s, the CLOB
 * automatically cancels all the wallet's open orders.
 *
 * The endpoint returns a `heartbeat_id` that must be passed to the next call
 * to chain heartbeats. Pass `null` to start a new chain.
 */

import type { ClobClient } from '@polymarket/clob-client'
import { logger } from './log.js'
import type { BotDb } from './db.js'

export class Heartbeat {
  private lastHeartbeatId: string | null = null
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly client: ClobClient,
    private readonly walletAddress: string,
    private readonly db: BotDb,
    private readonly intervalMs: number
  ) {}

  start(): void {
    if (this.timer) return
    void this.tick() // fire immediately
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async tick(): Promise<void> {
    try {
      const resp = await this.client.postHeartbeat(this.lastHeartbeatId ?? undefined)
      // The response shape varies; look for a heartbeat_id to chain
      const nextId =
        (resp && typeof resp === 'object' && 'heartbeat_id' in resp
          ? (resp as { heartbeat_id?: string }).heartbeat_id
          : null) ?? null
      this.lastHeartbeatId = nextId
      this.db.recordHeartbeat(this.walletAddress)
    } catch (err) {
      logger.warn({ err, wallet: this.walletAddress }, 'heartbeat failed')
    }
  }
}
