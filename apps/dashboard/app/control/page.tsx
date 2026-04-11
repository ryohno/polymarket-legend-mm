import { getBotStatus } from '../../lib/bot-supervisor'
import { tailBotLog } from '../actions'
import { listMarkets, listWallets, openOrders, latestHeartbeat } from '../../lib/db'
import { getSetupStatus } from '../../lib/setup-status'
import { ControlPanel } from './_control-panel'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function ControlPage() {
  const botStatus = getBotStatus()
  const setup = await getSetupStatus()
  const markets = listMarkets()
  const wallets = listWallets()
  const orders = openOrders()
  const hb = latestHeartbeat()
  const logText = await tailBotLog()

  const hbAgeSec = hb ? Math.floor((Date.now() - hb) / 1000) : null
  const uptime =
    botStatus.running && botStatus.startedAt
      ? Math.floor((Date.now() - botStatus.startedAt) / 1000)
      : null

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold">Bot Control</h1>
        <p className="text-muted-3 text-sm mt-1">
          Start, stop, and monitor the market-making bot process.
        </p>
      </header>

      <ControlPanel
        running={botStatus.running}
        pid={botStatus.pid}
        uptimeSec={uptime}
        hbAgeSec={hbAgeSec}
        orderCount={orders.length}
        walletCount={wallets.length}
        marketCount={markets.length}
        setupReady={setup.envReady && setup.treasuryReady && setup.walletsReady}
        logText={logText}
      />
    </div>
  )
}
