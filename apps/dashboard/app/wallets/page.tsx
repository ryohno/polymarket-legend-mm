import { listWallets, openOrders } from '../../lib/db'
import { maskAddress } from '@polymm/shared'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function WalletsPage() {
  const wallets = listWallets()
  const orders = openOrders()

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Wallets</h1>
      {wallets.length === 0 && (
        <div className="tile text-muted">No wallets registered yet. Run the bot to seed them.</div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {wallets.map((w) => {
          const usdc = Number(BigInt(w.usdc_micro)) / 1_000_000
          const matic = Number(BigInt(w.matic_wei)) / 1e18
          const walletOrders = orders.filter(
            (o) => o.wallet_address.toLowerCase() === w.address.toLowerCase()
          )
          return (
            <div key={w.idx} className="tile">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="text-xs text-muted-2 uppercase tracking-wide">{w.label}</div>
                  <div className="font-mono text-sm text-muted-3">{maskAddress(w.address)}</div>
                </div>
                <div className="text-xs text-muted-2">#{w.idx}</div>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-muted-2 text-xs">USDC.e</div>
                  <div className="num font-bold">${usdc.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-muted-2 text-xs">MATIC</div>
                  <div className="num font-bold">{matic.toFixed(4)}</div>
                </div>
                <div>
                  <div className="text-muted-2 text-xs">Orders</div>
                  <div className="num font-bold">{walletOrders.length}</div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
