/**
 * Market data WebSocket.
 *
 * Single connection per bot process, subscribing to all 16 tokenIds
 * (8 YES + 8 NO). Maintains an in-memory OrderBook map keyed by tokenId
 * that the strategy engine reads synchronously.
 *
 * Message types consumed:
 *   - book: full snapshot of a side
 *   - price_change: incremental updates
 *   - last_trade_price: record last trade
 *   - tick_size_change: update tick cache
 */

import WebSocket from 'ws'
import { CLOB_WS_MARKET_URL } from '@polymm/shared'
import type { OrderBookSnapshot } from '@polymm/shared'
import type { TickSizeCache } from './tick.js'
import { logger } from '../log.js'

type BookSide = 'bid' | 'ask'

interface RawBookLevel {
  price: string
  size: string
}

interface RawBookMessage {
  event_type: 'book'
  asset_id: string
  bids: RawBookLevel[]
  asks: RawBookLevel[]
  timestamp: string
}

interface RawPriceChange {
  event_type: 'price_change'
  asset_id: string
  changes: Array<{ price: string; side: BookSide; size: string }>
  timestamp: string
}

interface RawLastTrade {
  event_type: 'last_trade_price'
  asset_id: string
  price: string
  size: string
  side: string
  timestamp: string
}

interface RawTickSizeChange {
  event_type: 'tick_size_change'
  asset_id: string
  old_tick_size: string
  new_tick_size: string
  timestamp: string
}

type RawMessage = RawBookMessage | RawPriceChange | RawLastTrade | RawTickSizeChange

export type OrderBookChangeListener = (snapshot: OrderBookSnapshot) => void

interface InternalBook {
  bids: Map<string, number> // price -> size
  asks: Map<string, number>
  lastTrade: number | null
}

export class MarketDataWs {
  private ws: WebSocket | null = null
  private readonly books = new Map<string, InternalBook>()
  private readonly snapshots = new Map<string, OrderBookSnapshot>()
  private readonly listeners = new Set<OrderBookChangeListener>()
  private reconnectAttempt = 0
  private pingTimer: NodeJS.Timeout | null = null
  private intentionalClose = false

  constructor(
    private readonly tokenIds: readonly string[],
    private readonly tickCache: TickSizeCache
  ) {}

  connect(): void {
    this.intentionalClose = false
    logger.info({ tokens: this.tokenIds.length }, 'market-ws: connecting')
    const ws = new WebSocket(CLOB_WS_MARKET_URL)
    this.ws = ws

    ws.on('open', () => {
      this.reconnectAttempt = 0
      logger.info('market-ws: open')
      ws.send(
        JSON.stringify({
          assets_ids: [...this.tokenIds],
          type: 'market',
          initial_dump: true,
          level: 2,
        })
      )
      // Keep-alive: server expects periodic PING
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('PING')
      }, 10_000)
    })

    ws.on('message', (data) => {
      const text = data.toString()
      if (text === 'PONG' || text === 'PING') return
      try {
        const parsed = JSON.parse(text)
        const msgs: RawMessage[] = Array.isArray(parsed) ? parsed : [parsed]
        for (const msg of msgs) this.handleMessage(msg)
      } catch (err) {
        logger.warn({ err, sample: text.slice(0, 120) }, 'market-ws: parse error')
      }
    })

    ws.on('close', (code) => {
      if (this.pingTimer) clearInterval(this.pingTimer)
      this.pingTimer = null
      if (this.intentionalClose) {
        logger.info('market-ws: closed (intentional)')
        return
      }
      this.reconnectAttempt++
      const delay = Math.min(30_000, 500 * 2 ** this.reconnectAttempt)
      logger.warn({ code, delay }, 'market-ws: closed, reconnecting')
      setTimeout(() => this.connect(), delay)
    })

    ws.on('error', (err) => {
      logger.error({ err }, 'market-ws: socket error')
    })
  }

  close(): void {
    this.intentionalClose = true
    this.ws?.close()
    if (this.pingTimer) clearInterval(this.pingTimer)
  }

  onChange(listener: OrderBookChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Synchronous access for the strategy loop. */
  getSnapshot(tokenId: string): OrderBookSnapshot | undefined {
    return this.snapshots.get(tokenId)
  }

  // -------- handlers --------

  private handleMessage(msg: RawMessage): void {
    switch (msg.event_type) {
      case 'book': {
        const book: InternalBook = {
          bids: new Map(msg.bids.map((b) => [b.price, parseFloat(b.size)])),
          asks: new Map(msg.asks.map((a) => [a.price, parseFloat(a.size)])),
          lastTrade: this.books.get(msg.asset_id)?.lastTrade ?? null,
        }
        this.books.set(msg.asset_id, book)
        this.emit(msg.asset_id)
        break
      }
      case 'price_change': {
        const book = this.books.get(msg.asset_id) ?? {
          bids: new Map<string, number>(),
          asks: new Map<string, number>(),
          lastTrade: null,
        }
        for (const change of msg.changes) {
          const sizeNum = parseFloat(change.size)
          const target = change.side === 'bid' ? book.bids : book.asks
          if (sizeNum === 0) target.delete(change.price)
          else target.set(change.price, sizeNum)
        }
        this.books.set(msg.asset_id, book)
        this.emit(msg.asset_id)
        break
      }
      case 'last_trade_price': {
        const book = this.books.get(msg.asset_id)
        if (book) {
          book.lastTrade = parseFloat(msg.price)
          this.emit(msg.asset_id)
        }
        break
      }
      case 'tick_size_change': {
        const newTick = parseFloat(msg.new_tick_size)
        this.tickCache.applyWsUpdate(msg.asset_id, newTick)
        logger.info({ tokenId: msg.asset_id, newTick }, 'market-ws: tick size changed')
        break
      }
    }
  }

  private emit(tokenId: string): void {
    const book = this.books.get(tokenId)
    if (!book) return
    const bestBid = topOfBook(book.bids, 'bid')
    const bestAsk = topOfBook(book.asks, 'ask')
    const tickSize = this.tickCache.peek(tokenId) ?? 0.01
    const snapshot: OrderBookSnapshot = {
      tokenId,
      bestBid,
      bestAsk,
      lastTradePrice: book.lastTrade,
      tickSize,
      updatedAt: Date.now(),
    }
    this.snapshots.set(tokenId, snapshot)
    for (const listener of this.listeners) listener(snapshot)
  }
}

function topOfBook(
  levels: Map<string, number>,
  side: BookSide
): { price: number; size: number } | null {
  let bestPrice: number | null = null
  let bestSize = 0
  for (const [priceStr, size] of levels) {
    if (size <= 0) continue
    const price = parseFloat(priceStr)
    if (bestPrice === null) {
      bestPrice = price
      bestSize = size
      continue
    }
    if (side === 'bid' ? price > bestPrice : price < bestPrice) {
      bestPrice = price
      bestSize = size
    }
  }
  return bestPrice === null ? null : { price: bestPrice, size: bestSize }
}
