import { recentEvents } from '../../lib/db'
import { maskAddress } from '@polymm/shared'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function EventsPage() {
  const events = recentEvents(500)

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Events</h1>
      <div className="tile">
        <table className="w-full text-xs font-mono">
          <thead className="text-muted-2">
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">Kind</th>
              <th className="py-2 pr-4">Wallet</th>
              <th className="py-2 pr-4">Message</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 && (
              <tr>
                <td colSpan={4} className="py-6 text-center text-muted">
                  No events yet.
                </td>
              </tr>
            )}
            {events.map((e) => (
              <tr key={e.id} className="border-b border-border/50">
                <td className="py-1 pr-4 text-muted num whitespace-nowrap">
                  {new Date(e.timestamp).toLocaleTimeString()}
                </td>
                <td
                  className={`py-1 pr-4 ${e.level === 'error' ? 'text-alert' : e.level === 'warn' ? 'text-gold' : 'text-muted-3'}`}
                >
                  {e.kind}
                </td>
                <td className="py-1 pr-4 text-muted-3">
                  {e.wallet_address ? maskAddress(e.wallet_address) : '—'}
                </td>
                <td className="py-1 pr-4">{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
