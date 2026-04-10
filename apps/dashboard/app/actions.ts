'use server'

import { writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { revalidatePath } from 'next/cache'
import { KILL_SWITCH_FILE } from '@polymm/shared'

export async function engageKillSwitch() {
  writeFileSync(
    KILL_SWITCH_FILE,
    JSON.stringify({ engagedAt: Date.now(), source: 'dashboard' }, null, 2)
  )
  revalidatePath('/')
}

export async function resetKillSwitch() {
  if (existsSync(KILL_SWITCH_FILE)) {
    unlinkSync(KILL_SWITCH_FILE)
  }
  revalidatePath('/')
}
