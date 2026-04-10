'use client'

import { useState, useTransition } from 'react'
import { engageKillSwitch } from '../actions'

export function KillSwitchButton({ engaged }: { engaged: boolean }) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  if (engaged) {
    return (
      <div className="px-4 py-2 rounded-md bg-alert/20 text-alert text-sm font-bold border border-alert">
        ENGAGED
      </div>
    )
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            startTransition(async () => {
              await engageKillSwitch()
              setConfirming(false)
            })
          }}
          disabled={pending}
          className="px-4 py-2 rounded-md bg-alert text-white text-sm font-bold hover:opacity-90 disabled:opacity-50"
        >
          {pending ? 'Engaging…' : 'Confirm KILL'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-4 py-2 rounded-md text-muted-2 text-sm hover:text-fg"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="px-6 py-3 rounded-md bg-alert/10 hover:bg-alert/20 text-alert text-sm font-bold border border-alert/50"
    >
      KILL SWITCH
    </button>
  )
}
