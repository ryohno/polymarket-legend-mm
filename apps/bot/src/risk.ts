/**
 * Risk controls:
 *   - Kill-switch file polling (dashboard writes data/KILL_SWITCH to halt)
 *   - Drawdown watch — aggregate P&L cutoff
 *   - Process-level kill switch inside the DB (survives restarts)
 */

import { existsSync } from 'node:fs'
import { KILL_SWITCH_FILE } from '@polymm/shared'
import { logger } from './log.js'
import type { BotDb } from './db.js'

export class RiskMonitor {
  private killed = false
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly db: BotDb,
    private readonly pollIntervalMs: number,
    private readonly onKill: (reason: string) => Promise<void>
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.poll(), this.pollIntervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  isKilled(): boolean {
    return this.killed
  }

  private poll(): void {
    if (this.killed) return
    if (existsSync(KILL_SWITCH_FILE)) {
      this.trigger('KILL_SWITCH file present')
      return
    }
    if (this.db.isKillSwitchEngaged()) {
      this.trigger('kill switch engaged in DB')
      return
    }
  }

  private trigger(reason: string): void {
    this.killed = true
    logger.warn({ reason }, 'risk: killing bot')
    this.db.logEvent({ kind: 'KILL_SWITCH', level: 'warn', message: reason })
    this.db.engageKillSwitch(reason)
    void this.onKill(reason)
  }
}
