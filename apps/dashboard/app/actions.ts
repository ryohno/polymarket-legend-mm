'use server'

import { writeFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { revalidatePath } from 'next/cache'
import { KILL_SWITCH_FILE, findWorkspaceRoot } from '@polymm/shared'

function killSwitchPath(): string {
  const root = findWorkspaceRoot()
  return root ? resolve(root, KILL_SWITCH_FILE) : KILL_SWITCH_FILE
}

export async function engageKillSwitch() {
  writeFileSync(
    killSwitchPath(),
    JSON.stringify({ engagedAt: Date.now(), source: 'dashboard' }, null, 2)
  )
  revalidatePath('/')
}

export async function resetKillSwitch() {
  const path = killSwitchPath()
  if (existsSync(path)) {
    unlinkSync(path)
  }
  revalidatePath('/')
}
