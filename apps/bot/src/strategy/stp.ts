/**
 * Cross-wallet self-trade prevention.
 *
 * Polymarket's CLOB only blocks self-matching on a per-maker-address basis.
 * Since we operate multiple maker addresses, it is OUR responsibility to
 * ensure our own wallets never cross each other.
 *
 * Rule: a proposed BUY at price P on token T is blocked if any other wallet
 * we control has a LIVE SELL on the same token at a price ≤ P (or vice versa).
 */

import type { BotDb } from '../db.js'
import type { Side } from '@polymm/shared'

export interface StpCheck {
  walletAddress: string
  tokenId: string
  side: Side
  price: number
}

export function wouldSelfCross(db: BotDb, check: StpCheck): boolean {
  const openOrders = db.listAllOpenOrders()
  for (const existing of openOrders) {
    if (existing.tokenId !== check.tokenId) continue
    if (existing.walletAddress.toLowerCase() === check.walletAddress.toLowerCase()) continue

    const existingPrice = parseFloat(existing.price)

    if (check.side === 'BUY' && existing.side === 'SELL' && check.price >= existingPrice) {
      return true
    }
    if (check.side === 'SELL' && existing.side === 'BUY' && check.price <= existingPrice) {
      return true
    }
  }
  return false
}
