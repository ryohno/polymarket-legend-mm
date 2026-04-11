import './globals.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AutoRefresh } from './_components/auto-refresh'
import { getBotStatus } from '../lib/bot-supervisor'

export const metadata: Metadata = {
  title: 'polymm · dashboard',
  description: 'Polymarket market-making bot dashboard',
}

export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const botStatus = getBotStatus()

  const navClass = 'text-fg hover:text-gold text-sm'

  return (
    <html lang="en">
      <body>
        <nav className="border-b border-border px-6 py-4 flex items-center gap-6 bg-tile">
          <span className="text-gold font-bold tracking-widest text-xs uppercase">polymm</span>
          <Link href="/" className={navClass}>Overview</Link>
          <Link href="/setup" className={navClass}>Setup</Link>
          <Link href="/control" className={navClass}>
            Control
            <span
              className={`inline-block ml-2 w-2 h-2 rounded-full align-middle ${botStatus.running ? 'bg-confirm' : 'bg-muted'}`}
            />
          </Link>
          <Link href="/wallets" className={navClass}>Wallets</Link>
          <Link href="/markets" className={navClass}>Markets</Link>
          <Link href="/events" className={navClass}>Events</Link>
          <Link href="/logs" className={navClass}>Logs</Link>
          <div className="ml-auto text-xs text-muted-2 num">
            {botStatus.running ? (
              <span className="text-confirm">● bot running · pid {botStatus.pid}</span>
            ) : (
              <span className="text-muted">○ bot stopped</span>
            )}
          </div>
        </nav>
        <main className="max-w-7xl mx-auto p-6">
          <AutoRefresh intervalMs={2000} />
          {children}
        </main>
      </body>
    </html>
  )
}
