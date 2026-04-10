/**
 * Terminal dashboard — live-refreshing ANSI-coloured status view.
 *
 * Reads directly from SQLite every refresh interval. Renders header,
 * markets table, wallets table, and recent events. Uses cursor-home +
 * ANSI escape codes to redraw in place without scrolling.
 *
 * When TUI is active, pino logs go to data/bot.log (see log.ts).
 * Hit Ctrl+C to exit — the shutdown handler in index.ts restores the
 * cursor and terminal state.
 */

import type { BotDb } from './db.js'
import type { MarketDef } from '@polymm/shared'
import { maskAddress } from '@polymm/shared'

const A = {
  clear: '\x1b[H\x1b[2J\x1b[3J',
  home: '\x1b[H',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  eraseDown: '\x1b[J',
  eraseLine: '\x1b[2K',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  inv: '\x1b[7m',
  // 24-bit colours matching the Legend brand
  gold: '\x1b[38;2;255;163;24m',
  goldBg: '\x1b[48;2;255;163;24m',
  green: '\x1b[38;2;48;209;88m',
  red: '\x1b[38;2;255;66;69m',
  muted: '\x1b[38;2;163;163;163m',
  mutedDim: '\x1b[38;2;122;122;122m',
  fg: '\x1b[38;2;245;245;245m',
  bgTile: '\x1b[48;2;20;20;20m',
}

const BOX = {
  tl: '╭',
  tr: '╮',
  bl: '╰',
  br: '╯',
  h: '─',
  v: '│',
  cross: '┼',
}

interface MarketRow {
  condition_id: string
  trader: string
  best_bid: number | null
  best_ask: number | null
  last_trade: number | null
  tick_size: number
}

interface WalletRow {
  idx: number
  label: string
  address: string
  usdc_micro: string
  matic_wei: string
}

interface EventRow {
  kind: string
  level: string
  wallet_address: string | null
  condition_id: string | null
  message: string
  timestamp: number
}

interface OrderRow {
  wallet_address: string
  condition_id: string
  side: string
  price: string
  status: string
}

export interface TuiConfig {
  mode: string
  dryRun: boolean
  live: boolean
  wallets: number
  markets: number
  spreadTicks: number
  orderSizeUsd: number
  maxPositionUsd: number
}

export class Tui {
  private timer: NodeJS.Timeout | null = null
  private startTime = Date.now()
  private active = false

  constructor(
    private readonly db: BotDb,
    private readonly markets: readonly MarketDef[],
    private readonly config: TuiConfig
  ) {}

  start(refreshMs = 1000): void {
    if (this.active) return
    this.active = true
    process.stdout.write(A.hideCursor + A.clear)
    this.render()
    this.timer = setInterval(() => this.render(), refreshMs)
    // Restore cursor on unexpected exit paths
    process.on('exit', () => {
      process.stdout.write(A.showCursor + '\n')
    })
  }

  stop(): void {
    this.active = false
    if (this.timer) clearInterval(this.timer)
    process.stdout.write(A.showCursor + A.reset + '\n')
  }

  private render(): void {
    try {
      const now = Date.now()
      const rows: MarketRow[] = this.db.db
        .prepare(
          `SELECT condition_id, trader, best_bid, best_ask, last_trade, tick_size FROM markets ORDER BY trader`
        )
        .all() as MarketRow[]
      const wallets: WalletRow[] = this.db.db
        .prepare(`SELECT idx, label, address, usdc_micro, matic_wei FROM wallets ORDER BY idx`)
        .all() as WalletRow[]
      const openOrders: OrderRow[] = this.db.db
        .prepare(
          `SELECT wallet_address, condition_id, side, price, status FROM orders WHERE status IN ('LIVE','PROPOSED')`
        )
        .all() as OrderRow[]
      const events: EventRow[] = this.db.db
        .prepare(
          `SELECT kind, level, wallet_address, condition_id, message, timestamp FROM events ORDER BY timestamp DESC LIMIT 10`
        )
        .all() as EventRow[]
      const countsRow = this.db.db
        .prepare(`SELECT kind, COUNT(*) as n FROM events WHERE timestamp > ? GROUP BY kind`)
        .all(now - 60_000) as Array<{ kind: string; n: number }>
      const counts1m = new Map(countsRow.map((r) => [r.kind, r.n]))

      const fillsTotal = this.db.db.prepare(`SELECT COUNT(*) as n FROM fills`).get() as {
        n: number
      }
      const hb = this.db.db
        .prepare(`SELECT MAX(timestamp) AS ts FROM heartbeats`)
        .get() as { ts: number | null }
      const hbAgeSec = hb?.ts ? Math.floor((now - hb.ts) / 1000) : null

      const lines: string[] = []
      lines.push(...this.renderHeader(now, counts1m, fillsTotal.n, hbAgeSec))
      lines.push('')
      lines.push(...this.renderMarkets(rows, openOrders))
      lines.push('')
      lines.push(...this.renderWallets(wallets, openOrders))
      lines.push('')
      lines.push(...this.renderEvents(events))

      const out = A.home + lines.join('\n') + A.eraseDown + A.reset
      process.stdout.write(out)
    } catch (err) {
      // Swallow TUI render errors to avoid crashing the bot over a cosmetic issue
      process.stdout.write(
        A.home + A.red + `TUI render error: ${(err as Error).message}` + A.reset + '\n'
      )
    }
  }

  // ────────────────────────── sections ──────────────────────────

  private renderHeader(
    now: number,
    counts1m: Map<string, number>,
    fillsTotal: number,
    hbAgeSec: number | null
  ): string[] {
    const uptime = formatDuration(now - this.startTime)
    const modeBadge = this.config.dryRun
      ? `${A.mutedDim}${A.inv} PAPER ${A.reset}`
      : `${A.red}${A.inv} LIVE ${A.reset}`

    const proposed1m = counts1m.get('ORDER_PROPOSED') ?? 0
    const placed1m = counts1m.get('ORDER_PLACED') ?? 0
    const filled1m = counts1m.get('ORDER_FILLED') ?? 0
    const canceled1m = counts1m.get('ORDER_CANCELED') ?? 0
    const stp1m = counts1m.get('STP_BLOCK') ?? 0
    const cap1m = counts1m.get('CAP_BLOCK') ?? 0
    const err1m =
      (counts1m.get('ERROR') ?? 0) + (counts1m.get('ORDER_REJECTED') ?? 0)

    const hbText =
      hbAgeSec === null
        ? `${A.mutedDim}heartbeat —${A.reset}`
        : hbAgeSec > 15
          ? `${A.red}heartbeat ${hbAgeSec}s${A.reset}`
          : `${A.green}heartbeat ${hbAgeSec}s${A.reset}`

    const title = `${A.bold}${A.gold}polymm${A.reset}${A.muted} · polymarket legend market-maker${A.reset}`
    const status = `${modeBadge}  ${A.muted}mode${A.reset} ${A.fg}${this.config.mode}${A.reset}  ${A.muted}wallets${A.reset} ${A.fg}${this.config.wallets}${A.reset}  ${A.muted}spread${A.reset} ${A.fg}${this.config.spreadTicks}t${A.reset}  ${A.muted}size${A.reset} ${A.fg}$${this.config.orderSizeUsd}${A.reset}  ${A.muted}cap${A.reset} ${A.fg}$${this.config.maxPositionUsd}${A.reset}  ${A.muted}uptime${A.reset} ${A.fg}${uptime}${A.reset}`
    const stats = `  ${A.muted}1m:${A.reset} ${A.fg}${proposed1m}${A.reset} ${A.muted}proposed${A.reset}  ${A.green}${placed1m}${A.reset} ${A.muted}placed${A.reset}  ${A.gold}${filled1m}${A.reset} ${A.muted}fills${A.reset}  ${A.muted}${canceled1m} canc${A.reset}  ${stp1m > 0 ? A.red : A.mutedDim}${stp1m}${A.reset} ${A.muted}stp${A.reset}  ${cap1m > 0 ? A.red : A.mutedDim}${cap1m}${A.reset} ${A.muted}cap${A.reset}  ${err1m > 0 ? A.red : A.mutedDim}${err1m}${A.reset} ${A.muted}err${A.reset}  ${A.muted}·${A.reset}  ${A.fg}${fillsTotal}${A.reset} ${A.muted}total fills${A.reset}  ${A.muted}·${A.reset}  ${hbText}`

    return [title, '', status, stats]
  }

  private renderMarkets(rows: MarketRow[], openOrders: OrderRow[]): string[] {
    const lines: string[] = []
    lines.push(`${A.dim}${BOX.h.repeat(96)}${A.reset}`)
    lines.push(
      `${A.bold}MARKETS${A.reset}` +
        `${A.mutedDim}  (YES outcome)${A.reset}`
    )
    lines.push(
      `  ${A.muted}${pad('trader', 14)} ${pad('bid', 8, 'r')} ${pad('ask', 8, 'r')} ${pad('mid', 8, 'r')}   ${pad('our bid', 10, 'r')} ${pad('our ask', 10, 'r')}   ${pad('buys', 5, 'r')} ${pad('sells', 5, 'r')}${A.reset}`
    )

    for (const m of rows) {
      const bidStr = m.best_bid == null ? '—' : m.best_bid.toFixed(3)
      const askStr = m.best_ask == null ? '—' : m.best_ask.toFixed(3)
      const mid =
        m.best_bid != null && m.best_ask != null ? (m.best_bid + m.best_ask) / 2 : null
      const midStr = mid == null ? '—' : mid.toFixed(3)

      const ours = openOrders.filter(
        (o) => o.condition_id.toLowerCase() === m.condition_id.toLowerCase()
      )
      const buys = ours.filter((o) => o.side === 'BUY')
      const sells = ours.filter((o) => o.side === 'SELL')
      const topBid = buys.length ? Math.max(...buys.map((o) => parseFloat(o.price))) : null
      const topAsk = sells.length ? Math.min(...sells.map((o) => parseFloat(o.price))) : null

      const ourBidStr = topBid == null ? `${A.mutedDim}—${A.reset}` : `${A.green}${topBid.toFixed(3)}${A.reset}`
      const ourAskStr = topAsk == null ? `${A.mutedDim}—${A.reset}` : `${A.red}${topAsk.toFixed(3)}${A.reset}`

      lines.push(
        `  ${A.fg}${pad(m.trader, 14)}${A.reset} ` +
          `${A.green}${pad(bidStr, 8, 'r')}${A.reset} ` +
          `${A.red}${pad(askStr, 8, 'r')}${A.reset} ` +
          `${A.fg}${pad(midStr, 8, 'r')}${A.reset}   ` +
          padColor(ourBidStr, 10, 'r') +
          ' ' +
          padColor(ourAskStr, 10, 'r') +
          `   ${A.muted}${pad(String(buys.length), 5, 'r')} ${pad(String(sells.length), 5, 'r')}${A.reset}`
      )
    }
    return lines
  }

  private renderWallets(wallets: WalletRow[], openOrders: OrderRow[]): string[] {
    const lines: string[] = []
    lines.push(`${A.dim}${BOX.h.repeat(96)}${A.reset}`)

    const totalUsdc = wallets.reduce((s, w) => s + Number(BigInt(w.usdc_micro)) / 1e6, 0)
    const totalMatic = wallets.reduce((s, w) => s + Number(BigInt(w.matic_wei)) / 1e18, 0)

    lines.push(
      `${A.bold}WALLETS${A.reset}${A.mutedDim}  (${wallets.length})  total ${A.reset}${A.fg}$${totalUsdc.toFixed(2)}${A.mutedDim} · ${totalMatic.toFixed(3)} MATIC${A.reset}`
    )
    lines.push(
      `  ${A.muted}${pad('#', 3, 'r')} ${pad('label', 7)} ${pad('address', 18)} ${pad('USDC.e', 12, 'r')} ${pad('MATIC', 10, 'r')} ${pad('orders', 7, 'r')}${A.reset}`
    )

    for (const w of wallets) {
      const usdc = Number(BigInt(w.usdc_micro)) / 1e6
      const matic = Number(BigInt(w.matic_wei)) / 1e18
      const wallet = openOrders.filter(
        (o) => o.wallet_address.toLowerCase() === w.address.toLowerCase()
      )
      const usdcColor = usdc === 0 ? A.mutedDim : A.fg
      lines.push(
        `  ${A.muted}${pad(String(w.idx), 3, 'r')}${A.reset} ` +
          `${A.fg}${pad(w.label, 7)}${A.reset} ` +
          `${A.muted}${pad(maskAddress(w.address), 18)}${A.reset} ` +
          `${usdcColor}${pad(`$${usdc.toFixed(2)}`, 12, 'r')}${A.reset} ` +
          `${A.muted}${pad(matic.toFixed(3), 10, 'r')}${A.reset} ` +
          `${A.fg}${pad(String(wallet.length), 7, 'r')}${A.reset}`
      )
    }
    return lines
  }

  private renderEvents(events: EventRow[]): string[] {
    const lines: string[] = []
    lines.push(`${A.dim}${BOX.h.repeat(96)}${A.reset}`)
    lines.push(`${A.bold}RECENT EVENTS${A.reset}`)

    if (events.length === 0) {
      lines.push(`  ${A.mutedDim}no events yet${A.reset}`)
      return lines
    }

    for (const e of events) {
      const time = new Date(e.timestamp).toTimeString().slice(0, 8)
      const kindColor =
        e.level === 'error'
          ? A.red
          : e.level === 'warn'
            ? A.gold
            : e.kind === 'ORDER_FILLED'
              ? A.gold
              : e.kind === 'ORDER_PLACED'
                ? A.green
                : A.muted
      const walletLabel = e.wallet_address
        ? `${A.mutedDim}${maskAddress(e.wallet_address).padEnd(16)}${A.reset}`
        : `${A.mutedDim}${'—'.padEnd(16)}${A.reset}`
      lines.push(
        `  ${A.mutedDim}${time}${A.reset} ` +
          `${kindColor}${pad(e.kind, 16)}${A.reset} ` +
          `${walletLabel} ` +
          `${A.fg}${truncate(e.message, 56)}${A.reset}`
      )
    }
    return lines
  }
}

// ────────────────────────── helpers ──────────────────────────

function pad(s: string, n: number, align: 'l' | 'r' = 'l'): string {
  const plain = s.replace(/\x1b\[[0-9;]*m/g, '')
  const diff = n - plain.length
  if (diff <= 0) return s
  return align === 'r' ? ' '.repeat(diff) + s : s + ' '.repeat(diff)
}

/**
 * Pad a string that already contains ANSI colour codes to a visual width.
 * The visible length is computed by stripping escape sequences.
 */
function padColor(s: string, n: number, align: 'l' | 'r' = 'l'): string {
  return pad(s, n, align)
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…'
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000)
  const hours = Math.floor(s / 3600)
  const mins = Math.floor((s % 3600) / 60)
  const secs = s % 60
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}
