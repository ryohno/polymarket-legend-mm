import { tailBotLog } from '../actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function LogsPage() {
  const logText = await tailBotLog()
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-3xl font-bold">Logs</h1>
        <p className="text-muted-3 text-sm mt-1">
          Live tail of <code className="font-mono">data/bot.log</code>. Refreshes every 2s.
        </p>
      </header>
      <pre className="tile text-xs font-mono text-muted-3 whitespace-pre-wrap max-h-[70vh] overflow-y-auto">
        {logText || '(empty)'}
      </pre>
    </div>
  )
}
