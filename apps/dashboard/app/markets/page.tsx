import { listMarkets, openOrders } from '../../lib/db'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function MarketsPage() {
  const markets = listMarkets()
  const orders = openOrders()

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Markets</h1>
      {markets.length === 0 && (
        <div className="tile text-muted">No markets yet. Start the bot to seed them.</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {markets.map((m) => {
          const marketOrders = orders.filter(
            (o) => o.condition_id.toLowerCase() === m.condition_id.toLowerCase()
          )
          const mid =
            m.best_bid != null && m.best_ask != null
              ? (m.best_bid + m.best_ask) / 2
              : null
          return (
            <div key={m.condition_id} className="tile">
              <div className="flex items-center justify-between mb-3">
                <div className="font-bold">{m.trader}</div>
                <div className="text-xs text-muted-2">tick {m.tick_size}</div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm mb-3">
                <div>
                  <div className="text-muted-2 text-xs">Bid</div>
                  <div className="num text-confirm">{m.best_bid?.toFixed(3) ?? '—'}</div>
                </div>
                <div>
                  <div className="text-muted-2 text-xs">Mid</div>
                  <div className="num">{mid?.toFixed(3) ?? '—'}</div>
                </div>
                <div>
                  <div className="text-muted-2 text-xs">Ask</div>
                  <div className="num text-alert">{m.best_ask?.toFixed(3) ?? '—'}</div>
                </div>
              </div>
              <div className="text-xs text-muted-2 pt-3 border-t border-border">
                Our open orders: <span className="text-fg num">{marketOrders.length}</span>
              </div>
              {marketOrders.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs font-mono">
                  {marketOrders.slice(0, 6).map((o) => (
                    <li key={o.order_id} className="flex gap-2">
                      <span
                        className={o.side === 'BUY' ? 'text-confirm' : 'text-alert'}
                      >
                        {o.side}
                      </span>
                      <span className="num">{o.price}</span>
                      <span className="text-muted-2">{o.status}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
