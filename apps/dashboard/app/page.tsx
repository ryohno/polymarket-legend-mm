import {
  listWallets,
  listMarkets,
  openOrders,
  latestHeartbeat,
  killSwitchStatus,
  recentEvents,
} from '../lib/db'
import { KillSwitchButton } from './_components/kill-switch'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function OverviewPage() {
  const wallets = listWallets()
  const markets = listMarkets()
  const orders = openOrders()
  const lastHb = latestHeartbeat()
  const kill = killSwitchStatus()
  const events = recentEvents(5)

  const totalUsdcMicro = wallets.reduce((sum, w) => sum + BigInt(w.usdc_micro), 0n)
  const totalUsdc = Number(totalUsdcMicro) / 1_000_000
  const hbAgeSec = lastHb ? Math.floor((Date.now() - lastHb) / 1000) : null

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold">Overview</h1>
        <p className="text-muted-3 text-sm mt-1">
          Polymarket · Legend Trade Series · {wallets.length} wallets · {markets.length} markets
        </p>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="tile">
          <div className="text-xs text-muted-2 uppercase tracking-wide">Capital</div>
          <div className="text-2xl font-bold num mt-1">${totalUsdc.toFixed(2)}</div>
        </div>
        <div className="tile">
          <div className="text-xs text-muted-2 uppercase tracking-wide">Wallets</div>
          <div className="text-2xl font-bold num mt-1">{wallets.length}</div>
        </div>
        <div className="tile">
          <div className="text-xs text-muted-2 uppercase tracking-wide">Open Orders</div>
          <div className="text-2xl font-bold num mt-1">{orders.length}</div>
        </div>
        <div className="tile">
          <div className="text-xs text-muted-2 uppercase tracking-wide">Heartbeat</div>
          <div className={`text-2xl font-bold num mt-1 ${hbAgeSec === null ? 'text-muted' : hbAgeSec > 15 ? 'text-alert' : 'text-confirm'}`}>
            {hbAgeSec === null ? '—' : `${hbAgeSec}s ago`}
          </div>
        </div>
      </section>

      <section className="tile">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Kill Switch</h2>
            <p className="text-xs text-muted-2 mt-1">
              {kill.engaged ? (
                <span className="text-alert">ENGAGED — {kill.reason ?? 'no reason'}</span>
              ) : (
                <span>Hit to cancel all orders across all wallets and halt the bot.</span>
              )}
            </p>
          </div>
          <KillSwitchButton engaged={kill.engaged} />
        </div>
      </section>

      <section className="tile">
        <h2 className="text-lg font-bold mb-3">Recent events</h2>
        <ul className="text-xs font-mono space-y-1">
          {events.length === 0 && <li className="text-muted">No events yet.</li>}
          {events.map((e) => (
            <li key={e.id} className="text-muted-3">
              <span className="text-muted mr-2 num">
                {new Date(e.timestamp).toLocaleTimeString()}
              </span>
              <span className={e.level === 'error' ? 'text-alert' : e.level === 'warn' ? 'text-gold' : ''}>
                [{e.kind}]
              </span>{' '}
              {e.message}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
