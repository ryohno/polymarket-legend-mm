/**
 * Bot entry point. Boots wallets, subscribes to WS channels, starts the
 * strategy loop, heartbeats, and risk monitor.
 */

import { env, contracts, isDryRun, isLive } from './config.js'
import { logger } from './log.js'
import { BotDb } from './db.js'
import { loadMmWallets } from './wallet-pool.js'
import { MarketDataWs } from './poly/ws-market.js'
import { UserDataWs } from './poly/ws-user.js'
import { TickSizeCache } from './poly/tick.js'
import { InventoryTracker } from './strategy/inventory.js'
import { StrategyLoop } from './strategy/loop.js'
import { Heartbeat } from './heartbeat.js'
import { RiskMonitor } from './risk.js'
import { LEGEND_TRADE_SERIES_MARKETS } from '@polymm/shared'

async function main(): Promise<void> {
  logger.info(
    { mode: env.MODE, dryRun: isDryRun, canary: env.CANARY_ONLY, live: isLive },
    'bot: boot'
  )
  logger.info({ contracts }, 'resolved contracts')

  const db = new BotDb()
  db.logEvent({
    kind: 'BOOT',
    message: `mode=${env.MODE} dryRun=${isDryRun} canary=${env.CANARY_ONLY ?? 'off'}`,
  })

  for (const market of LEGEND_TRADE_SERIES_MARKETS) {
    db.upsertMarket(market)
  }

  const wallets = await loadMmWallets({
    password: env.KEYSTORE_PASSWORD,
    rpcUrl: env.POLYGON_RPC_URL,
    onlyIndex: env.CANARY_ONLY,
  })

  if (wallets.length === 0) {
    logger.error('no wallets loaded — aborting')
    process.exit(1)
  }

  for (const w of wallets) {
    db.upsertWallet({
      index: w.index,
      address: w.address,
      label: w.label,
      usdcMicro: 0n,
      maticWei: 0n,
    })
  }

  // --- Market data ---
  const tickCache = new TickSizeCache(wallets[0]!.clobClient)
  tickCache.prime(LEGEND_TRADE_SERIES_MARKETS)

  const tokenIds = LEGEND_TRADE_SERIES_MARKETS.flatMap((m) => [m.yesTokenId, m.noTokenId])
  const marketWs = new MarketDataWs(tokenIds, tickCache)
  marketWs.onChange((snap) => {
    const market = LEGEND_TRADE_SERIES_MARKETS.find(
      (m) => m.yesTokenId === snap.tokenId || m.noTokenId === snap.tokenId
    )
    if (!market || market.yesTokenId !== snap.tokenId) return
    db.updateMarketBook({
      conditionId: market.conditionId,
      bestBid: snap.bestBid?.price ?? null,
      bestAsk: snap.bestAsk?.price ?? null,
      lastTrade: snap.lastTradePrice,
    })
  })
  marketWs.connect()

  // --- Inventory ---
  const inventory = new InventoryTracker({
    maxNetUsdPerMarket: env.MAX_POSITION_USD_PER_MARKET,
  })

  // Mark inventory on every book change
  marketWs.onChange((snap) => {
    const market = LEGEND_TRADE_SERIES_MARKETS.find(
      (m) => m.yesTokenId === snap.tokenId || m.noTokenId === snap.tokenId
    )
    if (!market || market.yesTokenId !== snap.tokenId) return
    for (const w of wallets) {
      inventory.mark(w.address, market.conditionId, snap)
    }
  })

  // --- User channels (one per wallet) ---
  const conditionIds = LEGEND_TRADE_SERIES_MARKETS.map((m) => m.conditionId)
  const userWsClients: UserDataWs[] = []
  for (const w of wallets) {
    if (!w.clobClient.creds) {
      logger.warn({ wallet: w.address }, 'wallet has no CLOB creds — skipping user ws')
      continue
    }
    const userWs = new UserDataWs(w.address, w.clobClient.creds, conditionIds)
    userWs.onEvent((event) => {
      db.logEvent({
        kind: 'INFO',
        walletAddress: event.walletAddress,
        message: `user-ws ${event.kind}`,
        payload: event.raw,
      })
      // TODO Phase 3.1: apply fill events to inventory
    })
    userWs.connect()
    userWsClients.push(userWs)
  }

  // --- Heartbeats ---
  const heartbeats: Heartbeat[] = []
  if (isLive) {
    for (const w of wallets) {
      const hb = new Heartbeat(w.clobClient, w.address, db, env.HEARTBEAT_INTERVAL_MS)
      hb.start()
      heartbeats.push(hb)
    }
  }

  // --- Strategy loop ---
  const loop = new StrategyLoop(
    wallets,
    LEGEND_TRADE_SERIES_MARKETS,
    marketWs,
    inventory,
    db,
    {
      dryRun: isDryRun,
      canaryOnly: env.CANARY_ONLY,
      quoteParams: {
        spreadTicks: env.SPREAD_TICKS,
        orderSizeUsd: env.ORDER_SIZE_USD,
        fallbackMid: 0.125, // 1/8 fair odds
      },
    }
  )

  // --- Risk monitor + kill switch ---
  const riskMonitor = new RiskMonitor(db, 500, async (reason) => {
    logger.warn({ reason }, 'risk: shutting down strategy')
    loop.stop()
    if (isLive) {
      for (const w of wallets) {
        try {
          await w.clobClient.cancelAll()
        } catch (err) {
          logger.error({ err, wallet: w.address }, 'cancelAll failed during kill')
        }
      }
    }
    for (const hb of heartbeats) hb.stop()
    marketWs.close()
    for (const ws of userWsClients) ws.close()
    db.close()
    process.exit(0)
  })
  riskMonitor.start()

  loop.start(env.POLL_INTERVAL_MS)

  logger.info(
    {
      wallets: wallets.length,
      markets: LEGEND_TRADE_SERIES_MARKETS.length,
      dryRun: isDryRun,
      live: isLive,
      spreadTicks: env.SPREAD_TICKS,
      orderSizeUsd: env.ORDER_SIZE_USD,
      maxPositionUsd: env.MAX_POSITION_USD_PER_MARKET,
    },
    'bot: running'
  )

  // --- graceful shutdown ---
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'bot: shutting down')
    db.logEvent({ kind: 'SHUTDOWN', message: `signal=${signal}` })
    loop.stop()
    riskMonitor.stop()
    if (isLive) {
      for (const w of wallets) {
        try {
          await w.clobClient.cancelAll()
        } catch (err) {
          logger.warn({ err, wallet: w.address }, 'cancelAll on shutdown failed')
        }
      }
    }
    for (const hb of heartbeats) hb.stop()
    marketWs.close()
    for (const ws of userWsClients) ws.close()
    db.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}

main().catch((err) => {
  logger.error({ err }, 'bot: fatal')
  process.exit(1)
})
