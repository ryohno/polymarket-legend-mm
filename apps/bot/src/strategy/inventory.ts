/**
 * Per-wallet per-market inventory tracking.
 *
 * Tracks net YES position (shares) and avg entry price from fills, derives
 * "can buy / can sell" based on caps configured in env.
 *
 * Phase 3 MVP: populated from the /ws/user trade events. For paper mode,
 * positions are computed from simulated fills recorded in the events table.
 */

import type { OrderBookSnapshot } from '@polymm/shared'

export interface WalletMarketInventory {
  walletAddress: string
  conditionId: string
  /** Net YES shares held (can be negative if we somehow went short; normally >= 0) */
  yesShares: number
  /** Avg entry price per share */
  avgEntry: number
  /** Current mark-to-market value in USDC */
  markValueUsd: number
  /** Unrealized P&L in USDC (markValue - cost basis) */
  unrealizedPnlUsd: number
}

export interface InventoryCaps {
  /** Max net USD position per wallet per market (absolute) */
  maxNetUsdPerMarket: number
}

export class InventoryTracker {
  private readonly positions = new Map<string, WalletMarketInventory>() // key = wallet|conditionId

  constructor(private readonly caps: InventoryCaps) {}

  private key(walletAddress: string, conditionId: string): string {
    return `${walletAddress.toLowerCase()}|${conditionId.toLowerCase()}`
  }

  get(walletAddress: string, conditionId: string): WalletMarketInventory {
    const k = this.key(walletAddress, conditionId)
    return (
      this.positions.get(k) ?? {
        walletAddress,
        conditionId,
        yesShares: 0,
        avgEntry: 0,
        markValueUsd: 0,
        unrealizedPnlUsd: 0,
      }
    )
  }

  /**
   * Apply a fill to the inventory. Positive shares = BUY, negative = SELL.
   */
  applyFill(params: {
    walletAddress: string
    conditionId: string
    shares: number // signed
    price: number
  }): void {
    const k = this.key(params.walletAddress, params.conditionId)
    const prev = this.get(params.walletAddress, params.conditionId)

    const newShares = prev.yesShares + params.shares
    let newAvg = prev.avgEntry

    if (params.shares > 0) {
      // BUY — weighted-average entry
      const totalCost = prev.avgEntry * prev.yesShares + params.price * params.shares
      newAvg = newShares === 0 ? 0 : totalCost / newShares
    } else if (params.shares < 0 && newShares === 0) {
      newAvg = 0
    } else if (params.shares < 0 && Math.sign(prev.yesShares) !== Math.sign(newShares)) {
      // Position flipped sign; reset avg to the fill price
      newAvg = params.price
    }

    this.positions.set(k, {
      walletAddress: params.walletAddress,
      conditionId: params.conditionId,
      yesShares: newShares,
      avgEntry: newAvg,
      markValueUsd: newShares * (prev.markValueUsd > 0 ? prev.markValueUsd / prev.yesShares : params.price),
      unrealizedPnlUsd: 0,
    })
  }

  /** Update mark-to-market from a fresh book snapshot. */
  mark(walletAddress: string, conditionId: string, snapshot: OrderBookSnapshot): void {
    const pos = this.get(walletAddress, conditionId)
    if (pos.yesShares === 0) return
    const mid =
      snapshot.bestBid && snapshot.bestAsk
        ? (snapshot.bestBid.price + snapshot.bestAsk.price) / 2
        : (snapshot.lastTradePrice ?? pos.avgEntry)
    const k = this.key(walletAddress, conditionId)
    this.positions.set(k, {
      ...pos,
      markValueUsd: pos.yesShares * mid,
      unrealizedPnlUsd: pos.yesShares * (mid - pos.avgEntry),
    })
  }

  /** Whether this wallet can place a new BUY order without exceeding cap. */
  canBuy(walletAddress: string, conditionId: string, orderSizeUsd: number): boolean {
    const pos = this.get(walletAddress, conditionId)
    const projected = pos.markValueUsd + orderSizeUsd
    return projected <= this.caps.maxNetUsdPerMarket
  }

  /** Whether this wallet holds enough YES shares to sell `orderSizeShares`. */
  canSell(walletAddress: string, conditionId: string, orderSizeShares: number): boolean {
    const pos = this.get(walletAddress, conditionId)
    return pos.yesShares >= orderSizeShares
  }

  /** Iterate all positions (for dashboard export). */
  *entries(): IterableIterator<WalletMarketInventory> {
    for (const v of this.positions.values()) yield v
  }
}
