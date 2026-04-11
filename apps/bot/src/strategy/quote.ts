/**
 * Quote computation — top-of-book market making.
 *
 * Strategy: land at the best bid / best ask of the Polymarket order book,
 * improving by 1 tick when the spread allows it. This replaces the earlier
 * mid-centred formula, which quoted outside the visible book when the real
 * spread was ≤ 2 ticks (nearly always the case on these markets).
 *
 * Rules:
 *   - Spread > 1 tick: improve by 1 tick on each side (become the new top)
 *   - Spread == 1 tick: join the existing top (share queue with current best)
 *   - Only one side present: join it, quote the other side 3 ticks away
 *   - No book at all: fall back to the 0.125 fair-odds anchor
 *
 * We still guard against crossed quotes and refuse to emit bid >= ask.
 */

import type { MarketDef, OrderBookSnapshot } from '@polymm/shared'
import { snapPriceDown, snapPriceUp } from '@polymm/shared'

export interface QuoteParams {
  /**
   * Legacy field retained for backwards compat, unused in top-of-book mode.
   */
  spreadTicks: number
  /** Dollar size per side */
  orderSizeUsd: number
  /** Fallback mid if the book is completely empty */
  fallbackMid: number
  /**
   * Optional per-wallet tier offset in ticks. Wallet 0 gets 0 ticks (tightest);
   * subsequent wallets step wider. Usually 0 when STAGGER_WALLETS=false.
   */
  walletTierOffset?: number
}

export interface Quote {
  bidPrice: string
  askPrice: string
  /** Size in USD (for BUY orders the CLOB expects USD notional) */
  bidSizeUsd: number
  /** Size in shares (for SELL orders the CLOB expects share count) */
  askSizeShares: number
}

/**
 * Compute a two-sided quote for the YES token of a market.
 * Returns null if the resulting quote would cross or be invalid.
 */
export function computeYesQuote(params: {
  market: MarketDef
  snapshot: OrderBookSnapshot | undefined
  params: QuoteParams
}): Quote | null {
  const { market, snapshot, params: p } = params
  const tick = snapshot?.tickSize ?? market.tickSize
  const EPS = tick / 2

  const bestBid = snapshot?.bestBid?.price ?? null
  const bestAsk = snapshot?.bestAsk?.price ?? null
  const tierOffset = tick * (p.walletTierOffset ?? 0)

  let bidNum: number
  let askNum: number

  if (bestBid != null && bestAsk != null) {
    const spread = bestAsk - bestBid
    // Refuse to operate on a crossed or zero-width book (stale WS state)
    if (spread <= EPS) return null

    if (spread > tick + EPS) {
      // Improve by 1 tick on both sides — become the new top of book
      bidNum = bestBid + tick
      askNum = bestAsk - tick
    } else {
      // Spread is exactly 1 tick, can't improve without crossing — join the top
      bidNum = bestBid
      askNum = bestAsk
    }
  } else if (bestBid != null) {
    // Only bids visible — join best bid, quote 3 ticks above as ask
    bidNum = bestBid
    askNum = bestBid + 3 * tick
  } else if (bestAsk != null) {
    // Only asks visible — join best ask, quote 3 ticks below as bid
    askNum = bestAsk
    bidNum = bestAsk - 3 * tick
  } else {
    // Empty book — anchor to fair odds
    bidNum = p.fallbackMid - tick
    askNum = p.fallbackMid + tick
  }

  // Apply wallet tier (widens both sides by N ticks). Default 0.
  bidNum -= tierOffset
  askNum += tierOffset

  // Snap to tick and clamp away from 0/1 boundaries
  const bidPrice = snapPriceDown(bidNum, tick)
  const askPrice = snapPriceUp(askNum, tick)

  // Final guard
  if (parseFloat(bidPrice) >= parseFloat(askPrice)) return null

  const bidSizeUsd = p.orderSizeUsd
  const askSizeShares = p.orderSizeUsd / parseFloat(askPrice)

  return { bidPrice, askPrice, bidSizeUsd, askSizeShares }
}
