/**
 * The main strategy loop.
 *
 * On every book update (or on a 2s backstop timer), iterate over every
 * (wallet × market) pair and decide whether to place/replace/cancel our
 * two-sided quote. Respects risk caps, cross-wallet STP, and dry-run mode.
 *
 * Orders placed in PROPOSED state by the loop; flip to LIVE / MATCHED /
 * CANCELED on WS user events.
 */

import { OrderType, Side as ClobSide } from '@polymarket/clob-client'
import { randomUUID } from 'node:crypto'
import type { MarketDef, OrderRecord } from '@polymm/shared'
import { usdcToMicro, sharesToMicro } from '@polymm/shared'
import type { BotWallet } from '../poly/client.js'
import type { MarketDataWs } from '../poly/ws-market.js'
import type { BotDb } from '../db.js'
import type { InventoryTracker } from './inventory.js'
import { wouldSelfCross } from './stp.js'
import { computeYesQuote, type QuoteParams } from './quote.js'
import { logger } from '../log.js'

export interface LoopConfig {
  dryRun: boolean
  canaryOnly: number | null
  quoteParams: QuoteParams
}

export class StrategyLoop {
  private running = false
  private pending = false
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly wallets: BotWallet[],
    private readonly markets: readonly MarketDef[],
    private readonly marketWs: MarketDataWs,
    private readonly inventory: InventoryTracker,
    private readonly db: BotDb,
    private readonly config: LoopConfig
  ) {}

  start(pollIntervalMs: number): void {
    this.running = true
    this.timer = setInterval(() => void this.tick(), pollIntervalMs)
    // Re-tick on any book change
    this.marketWs.onChange(() => {
      if (!this.pending) {
        this.pending = true
        setImmediate(() => {
          this.pending = false
          void this.tick()
        })
      }
    })
  }

  stop(): void {
    this.running = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async tick(): Promise<void> {
    if (!this.running) return

    for (const market of this.markets) {
      const snapshot = this.marketWs.getSnapshot(market.yesTokenId)
      if (!snapshot) continue

      for (const wallet of this.wallets) {
        if (this.config.canaryOnly != null && wallet.index !== this.config.canaryOnly) continue

        const quote = computeYesQuote({
          market,
          snapshot,
          params: this.config.quoteParams,
        })
        if (!quote) continue

        await this.maybePlaceSide({
          wallet,
          market,
          side: 'BUY',
          price: quote.bidPrice,
          sizeUsd: quote.bidSizeUsd,
        })
        await this.maybePlaceSide({
          wallet,
          market,
          side: 'SELL',
          price: quote.askPrice,
          sizeShares: quote.askSizeShares,
        })
      }
    }
  }

  private async maybePlaceSide(params: {
    wallet: BotWallet
    market: MarketDef
    side: 'BUY' | 'SELL'
    price: string
    sizeUsd?: number
    sizeShares?: number
  }): Promise<void> {
    const { wallet, market, side, price } = params
    const priceNum = parseFloat(price)

    // STP check
    const crosses = wouldSelfCross(this.db, {
      walletAddress: wallet.address,
      tokenId: market.yesTokenId,
      side,
      price: priceNum,
    })
    if (crosses) {
      this.db.logEvent({
        kind: 'STP_BLOCK',
        level: 'warn',
        walletAddress: wallet.address,
        conditionId: market.conditionId,
        message: `${side} @ ${price} would cross another wallet`,
      })
      return
    }

    // Cap check
    if (side === 'BUY') {
      if (!this.inventory.canBuy(wallet.address, market.conditionId, params.sizeUsd ?? 0)) {
        this.db.logEvent({
          kind: 'CAP_BLOCK',
          level: 'info',
          walletAddress: wallet.address,
          conditionId: market.conditionId,
          message: `BUY blocked by position cap`,
        })
        return
      }
    } else {
      if (!this.inventory.canSell(wallet.address, market.conditionId, params.sizeShares ?? 0)) {
        // No inventory to sell — for Phase 3 MVP we just skip
        return
      }
    }

    // Generate or update the existing order for this (wallet, market, side)
    const existing = this.db
      .listOpenOrdersForWallet(wallet.address)
      .find(
        (o) =>
          o.conditionId === market.conditionId && o.side === side && o.outcome === 'YES'
      )

    if (existing && existing.price === price && existing.status === 'LIVE') {
      // Same price, nothing to do
      return
    }

    // Record a PROPOSED order
    const orderId = existing?.orderId ?? `proposed-${randomUUID()}`
    const now = Date.now()
    const sizeMicro =
      side === 'BUY'
        ? usdcToMicro(params.sizeUsd ?? 0)
        : sharesToMicro(params.sizeShares ?? 0)
    const record: OrderRecord = {
      orderId,
      walletAddress: wallet.address,
      conditionId: market.conditionId,
      tokenId: market.yesTokenId,
      outcome: 'YES',
      side,
      price,
      sizeMicro,
      filledMicro: existing?.filledMicro ?? 0n,
      status: 'PROPOSED',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    this.db.upsertOrder(record)
    this.db.logEvent({
      kind: 'ORDER_PROPOSED',
      walletAddress: wallet.address,
      conditionId: market.conditionId,
      message: `${side} ${price} ${market.trader}`,
      payload: {
        size: side === 'BUY' ? params.sizeUsd : params.sizeShares,
      },
    })

    if (this.config.dryRun) {
      return // paper mode — stop here
    }

    // Live mode — cancel the previous order (if any) and submit a new one
    try {
      if (existing && existing.status === 'LIVE') {
        await wallet.clobClient.cancelOrder({ orderID: existing.orderId })
        this.db.upsertOrder({ ...existing, status: 'CANCELED', updatedAt: now })
      }

      const signed = await wallet.clobClient.createOrder({
        tokenID: market.yesTokenId,
        price: parseFloat(price),
        side: side === 'BUY' ? ClobSide.BUY : ClobSide.SELL,
        size: side === 'BUY' ? params.sizeUsd ?? 0 : params.sizeShares ?? 0,
        feeRateBps: 0,
      })
      const resp = await wallet.clobClient.postOrder(signed, OrderType.GTC)
      if (resp?.success === false) {
        this.db.logEvent({
          kind: 'ORDER_REJECTED',
          level: 'warn',
          walletAddress: wallet.address,
          conditionId: market.conditionId,
          message: `rejected: ${resp.errorMsg ?? 'unknown'}`,
          payload: resp,
        })
        this.db.upsertOrder({ ...record, status: 'REJECTED' })
        return
      }
      const liveOrderId = (resp?.orderID as string | undefined) ?? orderId
      this.db.upsertOrder({
        ...record,
        orderId: liveOrderId,
        status: 'LIVE',
      })
      this.db.logEvent({
        kind: 'ORDER_PLACED',
        walletAddress: wallet.address,
        conditionId: market.conditionId,
        message: `${side} ${price} live`,
        payload: { orderId: liveOrderId },
      })
    } catch (err) {
      logger.error({ err, wallet: wallet.address, market: market.trader }, 'order placement failed')
      this.db.logEvent({
        kind: 'ERROR',
        level: 'error',
        walletAddress: wallet.address,
        conditionId: market.conditionId,
        message: `order placement failed: ${(err as Error).message}`,
      })
    }
  }
}
