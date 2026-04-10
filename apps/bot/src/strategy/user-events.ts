/**
 * Translate user-channel WebSocket messages (trades + order updates) into
 * database writes and inventory mutations.
 *
 * Message shapes (per docs.polymarket.com/api-reference/wss/user):
 *
 * Trade event:
 *   {
 *     event_type: "trade",
 *     type: "TRADE",
 *     id, taker_order_id, market, asset_id, side, size, price, fee_rate_bps,
 *     status: "MATCHED" | "MINED" | "CONFIRMED" | "RETRYING" | "FAILED",
 *     outcome, maker_orders, trader_side, timestamp
 *   }
 *
 * Order event:
 *   {
 *     event_type: "order",
 *     id, owner, market, asset_id, side,
 *     original_size, size_matched, price,
 *     type: "PLACEMENT" | "UPDATE" | "CANCELLATION",
 *     status: "LIVE" | "MATCHED" | "CANCELED",
 *     order_type, timestamp
 *   }
 */

import type { MarketDef } from '@polymm/shared'
import { findMarketByTokenId, sharesToMicro, usdcToMicro } from '@polymm/shared'
import type { BotDb } from '../db.js'
import type { InventoryTracker } from './inventory.js'
import type { UserEvent } from '../poly/ws-user.js'
import { logger } from '../log.js'

interface RawTradeEvent {
  event_type: 'trade'
  type: string
  id: string
  taker_order_id?: string
  market: string
  asset_id: string
  side: 'BUY' | 'SELL'
  size: string
  price: string
  fee_rate_bps?: string
  status: 'MATCHED' | 'MINED' | 'CONFIRMED' | 'RETRYING' | 'FAILED'
  outcome?: 'YES' | 'NO'
  trader_side?: 'TAKER' | 'MAKER'
  maker_orders?: Array<{ order_id?: string; maker_address?: string }>
  transaction_hash?: string
  timestamp?: string
}

interface RawOrderEvent {
  event_type: 'order'
  id: string
  market: string
  asset_id: string
  side: 'BUY' | 'SELL'
  original_size: string
  size_matched: string
  price: string
  type: 'PLACEMENT' | 'UPDATE' | 'CANCELLATION'
  status: 'LIVE' | 'MATCHED' | 'CANCELED'
  order_type?: string
  timestamp?: string
}

export class UserEventHandler {
  constructor(
    private readonly db: BotDb,
    private readonly inventory: InventoryTracker,
    private readonly markets: readonly MarketDef[]
  ) {}

  handle(event: UserEvent): void {
    const raw = event.raw as { event_type?: string } & Record<string, unknown>
    if (!raw || typeof raw !== 'object') return

    switch (raw.event_type) {
      case 'trade':
        this.handleTrade(event.walletAddress, raw as unknown as RawTradeEvent)
        break
      case 'order':
        this.handleOrder(event.walletAddress, raw as unknown as RawOrderEvent)
        break
      default:
        // Unknown event; log at debug
        break
    }
  }

  private handleTrade(walletAddress: string, trade: RawTradeEvent): void {
    // Only process confirmed (or at least mined) trades — earlier statuses
    // will be followed by another event with the final state.
    if (trade.status !== 'CONFIRMED' && trade.status !== 'MINED') {
      return
    }

    const tokenMatch = findMarketByTokenId(this.markets, trade.asset_id)
    if (!tokenMatch) {
      logger.warn({ asset: trade.asset_id }, 'user-events: trade on unknown token')
      return
    }
    const { market, outcome } = tokenMatch

    const price = parseFloat(trade.price)
    const sizeShares = parseFloat(trade.size)
    const feeBps = parseFloat(trade.fee_rate_bps ?? '0')
    const feeUsd = (price * sizeShares * feeBps) / 10_000

    // Insert fill (idempotent on id)
    const stmt = this.db.db.prepare(
      `INSERT OR IGNORE INTO fills (id, order_id, wallet_address, condition_id, token_id, side, price, size_micro, fee_micro, pnl_micro, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const orderId = trade.taker_order_id ?? trade.id
    const result = stmt.run(
      trade.id,
      orderId,
      walletAddress,
      market.conditionId,
      trade.asset_id,
      trade.side,
      trade.price,
      sharesToMicro(sizeShares).toString(),
      usdcToMicro(feeUsd).toString(),
      '0', // P&L computed later when the other side closes
      trade.timestamp ? parseInt(trade.timestamp, 10) : Date.now()
    )

    const isNewFill = result.changes === 1
    if (!isNewFill) return

    // Apply to inventory (only YES outcome since we quote YES only)
    if (outcome === 'YES') {
      const signedShares = trade.side === 'BUY' ? sizeShares : -sizeShares
      this.inventory.applyFill({
        walletAddress,
        conditionId: market.conditionId,
        shares: signedShares,
        price,
      })
    }

    this.db.logEvent({
      kind: 'ORDER_FILLED',
      walletAddress,
      conditionId: market.conditionId,
      message: `${trade.side} ${trade.size} ${outcome} @ ${trade.price} ${market.trader} [${trade.status}]`,
      payload: {
        tradeId: trade.id,
        orderId,
        feeBps: trade.fee_rate_bps,
        txHash: trade.transaction_hash,
        traderSide: trade.trader_side,
      },
    })
  }

  private handleOrder(walletAddress: string, order: RawOrderEvent): void {
    const tokenMatch = findMarketByTokenId(this.markets, order.asset_id)
    if (!tokenMatch) return
    const { market, outcome } = tokenMatch

    // Map order size to our internal representation.
    // For BUY orders, the CLOB "size" field is USD notional; for SELL it's shares.
    const originalSize = parseFloat(order.original_size)
    const matchedSize = parseFloat(order.size_matched)
    const sizeMicro =
      order.side === 'BUY' ? usdcToMicro(originalSize) : sharesToMicro(originalSize)
    const filledMicro =
      order.side === 'BUY' ? usdcToMicro(matchedSize) : sharesToMicro(matchedSize)

    const now = Date.now()
    this.db.upsertOrder({
      orderId: order.id,
      walletAddress,
      conditionId: market.conditionId,
      tokenId: order.asset_id,
      outcome,
      side: order.side,
      price: order.price,
      sizeMicro,
      filledMicro,
      status: order.status,
      createdAt: now,
      updatedAt: now,
    })

    if (order.type === 'CANCELLATION' || order.status === 'CANCELED') {
      this.db.logEvent({
        kind: 'ORDER_CANCELED',
        walletAddress,
        conditionId: market.conditionId,
        message: `${order.side} ${order.price} canceled`,
        payload: { orderId: order.id },
      })
    }
  }
}
