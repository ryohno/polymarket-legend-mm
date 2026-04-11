'use server'

import { writeFileSync, existsSync, unlinkSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { revalidatePath } from 'next/cache'
import { KILL_SWITCH_FILE, findWorkspaceRoot } from '@polymm/shared'
import {
  startBot as startBotSupervisor,
  stopBot as stopBotSupervisor,
  getBotStatus,
  type BotStatus,
} from '../lib/bot-supervisor'
import { runScript, type ScriptResult } from '../lib/scripts-runner'

function ws(): string {
  const r = findWorkspaceRoot()
  if (!r) throw new Error('workspace root not found')
  return r
}

function killSwitchPath(): string {
  return resolve(ws(), KILL_SWITCH_FILE)
}

// ────────────────────────── Kill switch ──────────────────────────

export async function engageKillSwitch() {
  writeFileSync(
    killSwitchPath(),
    JSON.stringify({ engagedAt: Date.now(), source: 'dashboard' }, null, 2)
  )
  revalidatePath('/')
}

export async function resetKillSwitch() {
  const path = killSwitchPath()
  if (existsSync(path)) unlinkSync(path)
  revalidatePath('/')
}

// ────────────────────────── Bot control ──────────────────────────

export async function startBotAction() {
  // Remove stale kill-switch file so the bot doesn't immediately exit on boot
  const ks = killSwitchPath()
  if (existsSync(ks)) unlinkSync(ks)

  const result = startBotSupervisor()
  revalidatePath('/control')
  revalidatePath('/')
  return result
}

export async function stopBotAction() {
  const result = await stopBotSupervisor()
  revalidatePath('/control')
  revalidatePath('/')
  return result
}

export async function restartBotAction() {
  await stopBotSupervisor()
  // Small pause to let OS reap
  await new Promise((r) => setTimeout(r, 500))
  const result = startBotSupervisor()
  revalidatePath('/control')
  revalidatePath('/')
  return result
}

export async function getBotStatusAction(): Promise<BotStatus> {
  return getBotStatus()
}

// ────────────────────────── Setup scripts ──────────────────────────

export async function generateTreasuryAction(): Promise<ScriptResult> {
  const result = await runScript('treasury:generate')
  revalidatePath('/setup')
  return result
}

export async function generateWalletsAction(count = 8): Promise<ScriptResult> {
  const result = await runScript('wallets:generate', ['--count', String(count)])
  revalidatePath('/setup')
  return result
}

export async function fundWalletsAction(params: {
  usdPerWallet?: number
  maticPerWallet?: number
}): Promise<ScriptResult> {
  const args = ['--yes']
  if (params.usdPerWallet != null) args.push('--usd', String(params.usdPerWallet))
  if (params.maticPerWallet != null) args.push('--matic', String(params.maticPerWallet))
  const result = await runScript('wallets:fund', args)
  revalidatePath('/setup')
  return result
}

export async function grantApprovalsAction(): Promise<ScriptResult> {
  const result = await runScript('wallets:approve')
  revalidatePath('/setup')
  return result
}

export async function sweepWalletsAction(): Promise<ScriptResult> {
  const result = await runScript('wallets:sweep', ['--yes'])
  revalidatePath('/setup')
  return result
}

// ────────────────────────── Live log tail ──────────────────────────

const LOG_PATH_REL = 'data/bot.log'
const LOG_MAX_BYTES = 64 * 1024 // read only the last 64KB

export async function tailBotLog(): Promise<string> {
  const path = resolve(ws(), LOG_PATH_REL)
  if (!existsSync(path)) return ''
  try {
    const stat = await import('node:fs').then((m) => m.promises.stat(path))
    const size = stat.size
    const start = Math.max(0, size - LOG_MAX_BYTES)
    const buf = Buffer.alloc(size - start)
    const fs = await import('node:fs')
    const fd = fs.openSync(path, 'r')
    try {
      fs.readSync(fd, buf, 0, buf.length, start)
    } finally {
      fs.closeSync(fd)
    }
    let text = buf.toString('utf8')
    // Drop partial first line if we didn't start from 0
    if (start > 0) {
      const nl = text.indexOf('\n')
      if (nl !== -1) text = text.slice(nl + 1)
    }
    // Pino JSON lines → compact form
    return text
      .split('\n')
      .filter(Boolean)
      .map((line) => formatPinoLine(line))
      .join('\n')
  } catch {
    return ''
  }
}

function formatPinoLine(line: string): string {
  try {
    const obj = JSON.parse(line) as {
      time?: number
      level?: number
      msg?: string
      [k: string]: unknown
    }
    const time = obj.time ? new Date(obj.time).toTimeString().slice(0, 8) : ''
    const levelMap: Record<number, string> = {
      10: 'trace',
      20: 'debug',
      30: 'info',
      40: 'warn',
      50: 'error',
      60: 'fatal',
    }
    const level = obj.level != null ? (levelMap[obj.level] ?? String(obj.level)) : ''
    const msg = obj.msg ?? ''
    // Strip noisy fields from extra JSON
    const extras = { ...obj }
    delete extras.time
    delete extras.level
    delete extras.msg
    delete extras.pid
    delete extras.hostname
    const extrasStr =
      Object.keys(extras).length > 0 ? ' ' + JSON.stringify(extras) : ''
    return `${time} ${level.padEnd(5)} ${msg}${extrasStr}`
  } catch {
    return line
  }
}
