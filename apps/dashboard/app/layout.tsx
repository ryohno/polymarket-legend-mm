import './globals.css'
import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'polymm · dashboard',
  description: 'Polymarket market-making bot dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="border-b border-border px-6 py-4 flex items-center gap-6 bg-tile">
          <span className="text-gold font-bold tracking-widest text-xs uppercase">polymm</span>
          <Link href="/" className="text-fg hover:text-gold text-sm">
            Overview
          </Link>
          <Link href="/wallets" className="text-fg hover:text-gold text-sm">
            Wallets
          </Link>
          <Link href="/markets" className="text-fg hover:text-gold text-sm">
            Markets
          </Link>
          <Link href="/events" className="text-fg hover:text-gold text-sm">
            Events
          </Link>
          <div className="ml-auto text-xs text-muted-2 num">local · read-only</div>
        </nav>
        <main className="max-w-7xl mx-auto p-6">{children}</main>
      </body>
    </html>
  )
}
