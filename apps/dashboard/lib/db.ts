/**
 * Read-only SQLite connection shared by server components.
 * Opens a single connection in read-only mode against the bot's database file.
 */

import Database from 'better-sqlite3'
import { DB_PATH_DEFAULT, findWorkspaceRoot } from '@polymm/shared'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

// We cache a handle keyed by inode so we never hand out a stale handle
// pointing at a deleted file (Unix keeps the fd alive against the old
// inode, causing read-only consumers to see pre-delete state forever).
let cached: { db: Database.Database; ino: bigint } | null = null

function dbPath(): string {
  const root = findWorkspaceRoot()
  return root ? resolve(root, DB_PATH_DEFAULT) : DB_PATH_DEFAULT
}

export function getDb(): Database.Database | null {
  const path = dbPath()
  if (!existsSync(path)) return null
  const stat = statSync(path)
  const ino = stat.ino as unknown as bigint
  if (cached && cached.ino === ino) {
    return cached.db
  }
  // Path exists but inode changed (or first call) — close any old handle,
  // open a fresh one.
  if (cached) {
    try {
      cached.db.close()
    } catch {
      // ignore
    }
  }
  const db = new Database(path, { readonly: true, fileMustExist: true })
  cached = { db, ino }
  return db
}

export interface WalletRow {
  idx: number
  address: string
  label: string
  usdc_micro: string
  matic_wei: string
  updated_at: number
}

export interface MarketRow {
  condition_id: string
  trader: string
  slug: string
  yes_token_id: string
  no_token_id: string
  tick_size: number
  min_order: number
  best_bid: number | null
  best_ask: number | null
  last_trade: number | null
  updated_at: number
}

export interface EventRow {
  id: number
  kind: string
  level: string
  wallet_address: string | null
  condition_id: string | null
  message: string
  payload: string | null
  timestamp: number
}

export interface OrderRow {
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
}

export function listWallets(): WalletRow[] {
  const d = getDb()
  if (!d) return []
  return d
    .prepare(`SELECT idx, address, label, usdc_micro, matic_wei, updated_at FROM wallets ORDER BY idx`)
    .all() as WalletRow[]
}

export function listMarkets(): MarketRow[] {
  const d = getDb()
  if (!d) return []
  return d.prepare(`SELECT * FROM markets ORDER BY trader`).all() as MarketRow[]
}

export function recentEvents(limit = 100): EventRow[] {
  const d = getDb()
  if (!d) return []
  return d
    .prepare(`SELECT * FROM events ORDER BY timestamp DESC LIMIT ?`)
    .all(limit) as EventRow[]
}

export function openOrders(): OrderRow[] {
  const d = getDb()
  if (!d) return []
  return d
    .prepare(`SELECT * FROM orders WHERE status IN ('LIVE', 'PROPOSED') ORDER BY updated_at DESC`)
    .all() as OrderRow[]
}

export function latestHeartbeat(): number | null {
  const d = getDb()
  if (!d) return null
  const row = d.prepare(`SELECT MAX(timestamp) AS ts FROM heartbeats`).get() as
    | { ts: number | null }
    | undefined
  return row?.ts ?? null
}

export function killSwitchStatus(): { engaged: boolean; reason: string | null; engagedAt: number | null } {
  const d = getDb()
  if (!d) return { engaged: false, reason: null, engagedAt: null }
  const row = d.prepare(`SELECT engaged, engaged_at, reason FROM kill_switch WHERE id = 1`).get() as
    | { engaged: number; engaged_at: number | null; reason: string | null }
    | undefined
  return {
    engaged: (row?.engaged ?? 0) === 1,
    reason: row?.reason ?? null,
    engagedAt: row?.engaged_at ?? null,
  }
}
