/**
 * Core types shared between bot, dashboard, and scripts.
 *
 * All money amounts are stored in micro-units (USDC has 6 decimals, so $1 = 1_000_000).
 * Prices are stored as strings to preserve tick precision ("0.125", "0.09", etc).
 * Share amounts also use 6-decimal micro-units internally.
 */

export type Side = 'BUY' | 'SELL'
export type Outcome = 'YES' | 'NO'
export type BotMode = 'paper' | 'live'

/**
 * Represents one of the 8 live Legend Trade Series markets. Each is a binary
 * YES/NO market inside the NegRisk event.
 */
export interface MarketDef {
  /** Human-readable trader name (e.g. "Jadoodoo") */
  trader: string
  /** Polymarket slug */
  slug: string
  /** Polymarket conditionId (0x-prefixed) */
  conditionId: string
  /** CLOB token id for the YES outcome (decimal string, 77 digits) */
  yesTokenId: string
  /** CLOB token id for the NO outcome (decimal string, 77 digits) */
  noTokenId: string
  /** Minimum price tick (e.g. 0.01 or 0.001) */
  tickSize: number
  /** Minimum order size in USDC */
  minOrderSize: number
  /** Whether this market belongs to a NegRisk event */
  negRisk: boolean
}

/**
 * Top-of-book snapshot for one outcome token.
 */
export interface OrderBookLevel {
  price: number
  size: number
}

export interface OrderBookSnapshot {
  tokenId: string
  bestBid: OrderBookLevel | null
  bestAsk: OrderBookLevel | null
  lastTradePrice: number | null
  tickSize: number
  updatedAt: number
}

/**
 * Persisted record of an MM wallet (stored encrypted on disk, metadata in SQLite).
 */
export interface WalletRecord {
  index: number
  address: string
  /** USDC.e balance in micro-USDC */
  usdcMicro: bigint
  /** MATIC balance in wei */
  maticWei: bigint
  updatedAt: number
}

/**
 * Position in one market held by one wallet. Tracks both YES and NO tokens.
 */
export interface PositionRecord {
  walletAddress: string
  conditionId: string
  /** YES shares in micro-units */
  yesMicro: bigint
  /** NO shares in micro-units */
  noMicro: bigint
  /** Average entry price per YES share, as decimal string */
  yesAvgEntry: string
  /** Average entry price per NO share, as decimal string */
  noAvgEntry: string
  /** Realized P&L in micro-USDC */
  realizedPnlMicro: bigint
  updatedAt: number
}

/**
 * Persistent record of an order placed with Polymarket CLOB.
 */
export interface OrderRecord {
  orderId: string
  walletAddress: string
  conditionId: string
  tokenId: string
  outcome: Outcome
  side: Side
  price: string
  /** Size in micro-USDC (for BUY) or micro-shares (for SELL) */
  sizeMicro: bigint
  /** Filled micro-amount so far */
  filledMicro: bigint
  status: 'LIVE' | 'MATCHED' | 'CANCELED' | 'UNMATCHED' | 'REJECTED' | 'PROPOSED'
  createdAt: number
  updatedAt: number
}

/**
 * A single fill event on one of our orders.
 */
export interface FillRecord {
  id: string
  orderId: string
  walletAddress: string
  conditionId: string
  tokenId: string
  side: Side
  price: string
  sizeMicro: bigint
  feeMicro: bigint
  /** Realized P&L impact of this fill, in micro-USDC (can be negative) */
  pnlMicro: bigint
  timestamp: number
}

/**
 * Structured event for the event log panel + debugging.
 */
export type EventKind =
  | 'BOOT'
  | 'SHUTDOWN'
  | 'HEARTBEAT'
  | 'ORDER_PROPOSED'
  | 'ORDER_PLACED'
  | 'ORDER_FILLED'
  | 'ORDER_CANCELED'
  | 'ORDER_REJECTED'
  | 'STP_BLOCK'
  | 'CAP_BLOCK'
  | 'REBALANCE'
  | 'APPROVAL_GRANTED'
  | 'DRAWDOWN_KILL'
  | 'KILL_SWITCH'
  | 'ERROR'
  | 'INFO'

export interface EventRecord {
  id: number
  kind: EventKind
  level: 'info' | 'warn' | 'error'
  walletAddress: string | null
  conditionId: string | null
  message: string
  /** JSON-encoded arbitrary payload */
  payload: string | null
  timestamp: number
}

/**
 * Live heartbeat record used by the dashboard to display bot health.
 */
export interface HeartbeatRecord {
  walletAddress: string
  timestamp: number
}

/**
 * Aggregate P&L snapshot exposed to the dashboard.
 */
export interface PnlSnapshot {
  realizedUsd: number
  unrealizedUsd: number
  totalUsd: number
  updatedAt: number
}
