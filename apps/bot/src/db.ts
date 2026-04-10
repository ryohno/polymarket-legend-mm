/**
 * SQLite persistence layer for the bot.
 *
 * Uses better-sqlite3 (synchronous, single-process-friendly).
 * The dashboard opens the same file read-only.
 */

import Database from 'better-sqlite3'
import { SCHEMA_SQL, DB_PATH_DEFAULT } from '@polymm/shared'
import type {
  EventKind,
  EventRecord,
  FillRecord,
  OrderRecord,
  PositionRecord,
  WalletRecord,
  MarketDef,
} from '@polymm/shared'
import { mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

export class BotDb {
  readonly db: Database.Database

  constructor(path: string = DB_PATH_DEFAULT) {
    if (!existsSync(dirname(path))) mkdirSync(dirname(path), { recursive: true })
    this.db = new Database(path)
    this.db.exec(SCHEMA_SQL)
  }

  close(): void {
    this.db.close()
  }

  // -------- wallets --------

  upsertWallet(row: {
    index: number
    address: string
    label: string
    usdcMicro: bigint
    maticWei: bigint
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO wallets (idx, address, label, usdc_micro, matic_wei, updated_at)
      VALUES (@idx, @address, @label, @usdcMicro, @maticWei, @updatedAt)
      ON CONFLICT(idx) DO UPDATE SET
        address = excluded.address,
        label = excluded.label,
        usdc_micro = excluded.usdc_micro,
        matic_wei = excluded.matic_wei,
        updated_at = excluded.updated_at
    `)
    stmt.run({
      idx: row.index,
      address: row.address,
      label: row.label,
      usdcMicro: row.usdcMicro.toString(),
      maticWei: row.maticWei.toString(),
      updatedAt: Date.now(),
    })
  }

  listWallets(): WalletRecord[] {
    const rows = this.db
      .prepare(`SELECT idx, address, usdc_micro, matic_wei, updated_at FROM wallets ORDER BY idx`)
      .all() as Array<{
      idx: number
      address: string
      usdc_micro: string
      matic_wei: string
      updated_at: number
    }>
    return rows.map((r) => ({
      index: r.idx,
      address: r.address,
      usdcMicro: BigInt(r.usdc_micro),
      maticWei: BigInt(r.matic_wei),
      updatedAt: r.updated_at,
    }))
  }

  // -------- markets --------

  upsertMarket(market: MarketDef): void {
    const stmt = this.db.prepare(`
      INSERT INTO markets (condition_id, trader, slug, yes_token_id, no_token_id, tick_size, min_order, updated_at)
      VALUES (@conditionId, @trader, @slug, @yesTokenId, @noTokenId, @tickSize, @minOrder, @updatedAt)
      ON CONFLICT(condition_id) DO UPDATE SET
        trader = excluded.trader,
        slug = excluded.slug,
        yes_token_id = excluded.yes_token_id,
        no_token_id = excluded.no_token_id,
        tick_size = excluded.tick_size,
        min_order = excluded.min_order,
        updated_at = excluded.updated_at
    `)
    stmt.run({
      conditionId: market.conditionId,
      trader: market.trader,
      slug: market.slug,
      yesTokenId: market.yesTokenId,
      noTokenId: market.noTokenId,
      tickSize: market.tickSize,
      minOrder: market.minOrderSize,
      updatedAt: Date.now(),
    })
  }

  updateMarketBook(params: {
    conditionId: string
    bestBid: number | null
    bestAsk: number | null
    lastTrade: number | null
  }): void {
    this.db
      .prepare(
        `UPDATE markets SET best_bid = @bestBid, best_ask = @bestAsk, last_trade = @lastTrade, updated_at = @updatedAt WHERE condition_id = @conditionId`
      )
      .run({ ...params, updatedAt: Date.now() })
  }

  // -------- orders --------

  upsertOrder(order: OrderRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO orders (order_id, wallet_address, condition_id, token_id, outcome, side, price, size_micro, filled_micro, status, created_at, updated_at)
      VALUES (@orderId, @walletAddress, @conditionId, @tokenId, @outcome, @side, @price, @sizeMicro, @filledMicro, @status, @createdAt, @updatedAt)
      ON CONFLICT(order_id) DO UPDATE SET
        filled_micro = excluded.filled_micro,
        status = excluded.status,
        updated_at = excluded.updated_at
    `)
    stmt.run({
      orderId: order.orderId,
      walletAddress: order.walletAddress,
      conditionId: order.conditionId,
      tokenId: order.tokenId,
      outcome: order.outcome,
      side: order.side,
      price: order.price,
      sizeMicro: order.sizeMicro.toString(),
      filledMicro: order.filledMicro.toString(),
      status: order.status,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    })
  }

  listOpenOrdersForWallet(walletAddress: string): OrderRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM orders WHERE wallet_address = ? AND status IN ('LIVE', 'PROPOSED') ORDER BY created_at`
      )
      .all(walletAddress) as Array<{
      order_id: string
      wallet_address: string
      condition_id: string
      token_id: string
      outcome: string
      side: string
      price: string
      size_micro: string
      filled_micro: string
      status: string
      created_at: number
      updated_at: number
    }>
    return rows.map((r) => ({
      orderId: r.order_id,
      walletAddress: r.wallet_address,
      conditionId: r.condition_id,
      tokenId: r.token_id,
      outcome: r.outcome as OrderRecord['outcome'],
      side: r.side as OrderRecord['side'],
      price: r.price,
      sizeMicro: BigInt(r.size_micro),
      filledMicro: BigInt(r.filled_micro),
      status: r.status as OrderRecord['status'],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }

  listAllOpenOrders(): OrderRecord[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM orders WHERE status IN ('LIVE', 'PROPOSED') ORDER BY created_at`
      )
      .all() as Array<{
      order_id: string
      wallet_address: string
      condition_id: string
      token_id: string
      outcome: string
      side: string
      price: string
      size_micro: string
      filled_micro: string
      status: string
      created_at: number
      updated_at: number
    }>
    return rows.map((r) => ({
      orderId: r.order_id,
      walletAddress: r.wallet_address,
      conditionId: r.condition_id,
      tokenId: r.token_id,
      outcome: r.outcome as OrderRecord['outcome'],
      side: r.side as OrderRecord['side'],
      price: r.price,
      sizeMicro: BigInt(r.size_micro),
      filledMicro: BigInt(r.filled_micro),
      status: r.status as OrderRecord['status'],
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }))
  }

  // -------- fills --------

  insertFill(fill: FillRecord): void {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO fills (id, order_id, wallet_address, condition_id, token_id, side, price, size_micro, fee_micro, pnl_micro, timestamp)
         VALUES (@id, @orderId, @walletAddress, @conditionId, @tokenId, @side, @price, @sizeMicro, @feeMicro, @pnlMicro, @timestamp)`
      )
      .run({
        id: fill.id,
        orderId: fill.orderId,
        walletAddress: fill.walletAddress,
        conditionId: fill.conditionId,
        tokenId: fill.tokenId,
        side: fill.side,
        price: fill.price,
        sizeMicro: fill.sizeMicro.toString(),
        feeMicro: fill.feeMicro.toString(),
        pnlMicro: fill.pnlMicro.toString(),
        timestamp: fill.timestamp,
      })
  }

  // -------- positions --------

  upsertPosition(pos: PositionRecord): void {
    this.db
      .prepare(
        `INSERT INTO positions (wallet_address, condition_id, yes_micro, no_micro, yes_avg_entry, no_avg_entry, realized_pnl, updated_at)
         VALUES (@walletAddress, @conditionId, @yesMicro, @noMicro, @yesAvgEntry, @noAvgEntry, @realizedPnl, @updatedAt)
         ON CONFLICT(wallet_address, condition_id) DO UPDATE SET
           yes_micro = excluded.yes_micro,
           no_micro = excluded.no_micro,
           yes_avg_entry = excluded.yes_avg_entry,
           no_avg_entry = excluded.no_avg_entry,
           realized_pnl = excluded.realized_pnl,
           updated_at = excluded.updated_at`
      )
      .run({
        walletAddress: pos.walletAddress,
        conditionId: pos.conditionId,
        yesMicro: pos.yesMicro.toString(),
        noMicro: pos.noMicro.toString(),
        yesAvgEntry: pos.yesAvgEntry,
        noAvgEntry: pos.noAvgEntry,
        realizedPnl: pos.realizedPnlMicro.toString(),
        updatedAt: pos.updatedAt,
      })
  }

  // -------- events --------

  logEvent(params: {
    kind: EventKind
    level?: 'info' | 'warn' | 'error'
    walletAddress?: string | null
    conditionId?: string | null
    message: string
    payload?: unknown
  }): void {
    this.db
      .prepare(
        `INSERT INTO events (kind, level, wallet_address, condition_id, message, payload, timestamp)
         VALUES (@kind, @level, @walletAddress, @conditionId, @message, @payload, @timestamp)`
      )
      .run({
        kind: params.kind,
        level: params.level ?? 'info',
        walletAddress: params.walletAddress ?? null,
        conditionId: params.conditionId ?? null,
        message: params.message,
        payload: params.payload != null ? JSON.stringify(params.payload) : null,
        timestamp: Date.now(),
      })
  }

  recentEvents(limit = 100): EventRecord[] {
    const rows = this.db
      .prepare(`SELECT * FROM events ORDER BY timestamp DESC LIMIT ?`)
      .all(limit) as Array<{
      id: number
      kind: string
      level: string
      wallet_address: string | null
      condition_id: string | null
      message: string
      payload: string | null
      timestamp: number
    }>
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind as EventKind,
      level: r.level as 'info' | 'warn' | 'error',
      walletAddress: r.wallet_address,
      conditionId: r.condition_id,
      message: r.message,
      payload: r.payload,
      timestamp: r.timestamp,
    }))
  }

  // -------- heartbeats --------

  recordHeartbeat(walletAddress: string): void {
    this.db
      .prepare(
        `INSERT INTO heartbeats (wallet_address, timestamp) VALUES (?, ?)
         ON CONFLICT(wallet_address) DO UPDATE SET timestamp = excluded.timestamp`
      )
      .run(walletAddress, Date.now())
  }

  latestHeartbeat(): number | null {
    const row = this.db
      .prepare(`SELECT MAX(timestamp) AS ts FROM heartbeats`)
      .get() as { ts: number | null } | undefined
    return row?.ts ?? null
  }

  // -------- kill switch --------

  isKillSwitchEngaged(): boolean {
    const row = this.db
      .prepare(`SELECT engaged FROM kill_switch WHERE id = 1`)
      .get() as { engaged: number } | undefined
    return (row?.engaged ?? 0) === 1
  }

  engageKillSwitch(reason: string): void {
    this.db
      .prepare(
        `UPDATE kill_switch SET engaged = 1, engaged_at = ?, reason = ? WHERE id = 1`
      )
      .run(Date.now(), reason)
  }

  resetKillSwitch(): void {
    this.db
      .prepare(`UPDATE kill_switch SET engaged = 0, engaged_at = NULL, reason = NULL WHERE id = 1`)
      .run()
  }
}
