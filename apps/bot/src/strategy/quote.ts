/**
 * Quote computation.
 *
 * Given a market's order book snapshot + strategy parameters, compute a
 * symmetric bid/ask quote around the mid, snapped to valid tick size.
 */

import type { MarketDef, OrderBookSnapshot } from '@polymm/shared'
import { snapPriceDown, snapPriceUp } from '@polymm/shared'

export interface QuoteParams {
  /** How many ticks off the mid on each side */
  spreadTicks: number
  /** Dollar size per side */
  orderSizeUsd: number
  /** Fallback mid if the book is empty (e.g. fair odds = 1/8 = 0.125) */
  fallbackMid: number
  /**
   * Extra tick offset this wallet adds to its spread (wallet tier).
   * Wallet 0 quotes at the tightest level; wallet N quotes N ticks wider.
   * Creates real book depth across wallets instead of 8x size at 1 level.
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
 *
 * Returns null if the market is in a weird state (price at boundary, etc.)
 * and we should skip quoting this cycle.
 */
export function computeYesQuote(params: {
  market: MarketDef
  snapshot: OrderBookSnapshot | undefined
  params: QuoteParams
}): Quote | null {
  const { market, snapshot, params: p } = params
  const tick = snapshot?.tickSize ?? market.tickSize

  // Determine mid
  let mid: number
  if (snapshot?.bestBid && snapshot?.bestAsk) {
    mid = (snapshot.bestBid.price + snapshot.bestAsk.price) / 2
  } else if (snapshot?.bestBid) {
    mid = snapshot.bestBid.price + tick
  } else if (snapshot?.bestAsk) {
    mid = snapshot.bestAsk.price - tick
  } else if (snapshot?.lastTradePrice != null) {
    mid = snapshot.lastTradePrice
  } else {
    mid = p.fallbackMid
  }

  // Clamp mid to valid range
  mid = Math.max(tick * 2, Math.min(1 - tick * 2, mid))

  const tierOffset = tick * (p.walletTierOffset ?? 0)
  const bidPrice = snapPriceDown(mid - tick * p.spreadTicks - tierOffset, tick)
  const askPrice = snapPriceUp(mid + tick * p.spreadTicks + tierOffset, tick)

  // Refuse to quote if the result is crossed or equals mid-exactly
  if (parseFloat(bidPrice) >= parseFloat(askPrice)) return null

  // Size: USD for BUY, shares for SELL.
  // For a SELL at price `askPrice`, N shares of YES yields N * askPrice USD when filled.
  // To target orderSizeUsd notional: shares = orderSizeUsd / askPrice.
  const bidSizeUsd = p.orderSizeUsd
  const askSizeShares = p.orderSizeUsd / parseFloat(askPrice)

  return { bidPrice, askPrice, bidSizeUsd, askSizeShares }
}
