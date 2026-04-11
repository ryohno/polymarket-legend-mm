'use client'

import { useState, useTransition } from 'react'
import { startBotAction, stopBotAction, restartBotAction } from '../actions'

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function ControlPanel({
  running,
  pid,
  uptimeSec,
  hbAgeSec,
  orderCount,
  walletCount,
  marketCount,
  setupReady,
  logText,
}: {
  running: boolean
  pid: number | null
  uptimeSec: number | null
  hbAgeSec: number | null
  orderCount: number
  walletCount: number
  marketCount: number
  setupReady: boolean
  logText: string
}) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const onStart = () => {
    setError(null)
    startTransition(async () => {
      const r = await startBotAction()
      if (!r.ok) setError(r.error)
    })
  }
  const onStop = () => {
    setError(null)
    startTransition(async () => {
      const r = await stopBotAction()
      if (!r.ok) setError(r.error)
    })
  }
  const onRestart = () => {
    setError(null)
    startTransition(async () => {
      const r = await restartBotAction()
      if (!r.ok) setError(r.error)
    })
  }

  return (
    <div className="space-y-4">
      {/* Status card */}
      <div className="tile">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div
                className={`w-3 h-3 rounded-full ${running ? 'bg-confirm animate-pulse' : 'bg-muted'}`}
              />
              <h2 className="text-xl font-bold">
                {running ? 'Running' : 'Stopped'}
              </h2>
            </div>
            <div className="mt-2 text-sm text-muted-3 space-x-4 num">
              {running && pid != null && <span>pid {pid}</span>}
              {uptimeSec != null && <span>uptime {formatDuration(uptimeSec)}</span>}
              {hbAgeSec != null && (
                <span className={hbAgeSec > 15 ? 'text-alert' : 'text-confirm'}>
                  heartbeat {hbAgeSec}s ago
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!running ? (
              <button
                onClick={onStart}
                disabled={!setupReady || pending}
                className="px-6 py-3 rounded-md bg-gold text-bg font-bold text-sm hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {pending ? 'Starting…' : 'Start bot'}
              </button>
            ) : (
              <>
                <button
                  onClick={onRestart}
                  disabled={pending}
                  className="px-4 py-3 rounded-md bg-trans-2 text-fg font-bold text-sm hover:bg-trans-3 disabled:opacity-50"
                >
                  {pending ? '…' : 'Restart'}
                </button>
                <button
                  onClick={onStop}
                  disabled={pending}
                  className="px-6 py-3 rounded-md bg-alert text-fg font-bold text-sm hover:brightness-110 disabled:opacity-50"
                >
                  {pending ? 'Stopping…' : 'Stop bot'}
                </button>
              </>
            )}
          </div>
        </div>
        {!setupReady && !running && (
          <div className="mt-3 text-xs text-alert">
            Setup incomplete. Finish the <a href="/setup" className="underline">setup wizard</a> first.
          </div>
        )}
        {error && <div className="mt-3 text-xs text-alert font-mono">error: {error}</div>}
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="tile">
          <div className="text-xs text-muted-2 uppercase tracking-wide">Wallets</div>
          <div className="text-2xl font-bold num mt-1">{walletCount}</div>
        </div>
        <div className="tile">
          <div className="text-xs text-muted-2 uppercase tracking-wide">Markets</div>
          <div className="text-2xl font-bold num mt-1">{marketCount}</div>
        </div>
        <div className="tile">
          <div className="text-xs text-muted-2 uppercase tracking-wide">Open orders</div>
          <div className="text-2xl font-bold num mt-1">{orderCount}</div>
        </div>
        <div className="tile">
          <div className="text-xs text-muted-2 uppercase tracking-wide">Heartbeat</div>
          <div
            className={`text-2xl font-bold num mt-1 ${hbAgeSec == null ? 'text-muted' : hbAgeSec > 15 ? 'text-alert' : 'text-confirm'}`}
          >
            {hbAgeSec == null ? '—' : `${hbAgeSec}s`}
          </div>
        </div>
      </div>

      {/* Live log tail */}
      <div className="tile">
        <h3 className="text-sm font-bold uppercase tracking-wide text-muted-2 mb-2">
          Live logs · data/bot.log
        </h3>
        <pre className="text-xs font-mono bg-background border border-border rounded-md p-3 max-h-96 overflow-y-auto text-muted-3 whitespace-pre-wrap">
          {logText || '(no logs yet — start the bot)'}
        </pre>
      </div>
    </div>
  )
}
