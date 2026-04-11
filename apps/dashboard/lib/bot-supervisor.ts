/**
 * Spawns / kills / monitors the bot as a detached child process so the
 * dashboard can manage it without the user touching a terminal.
 *
 * The bot is spawned with:
 *   - detached: true → survives dashboard crash
 *   - stdio: 'ignore' → no pipes; bot logs via pino to data/bot.log
 *   - HEADLESS=true → bot skips TUI, writes logs to file
 *
 * State is tracked via data/bot.pid. `isBotRunning()` verifies by sending
 * signal 0 to the pid (zero-cost liveness check).
 */

import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { findWorkspaceRoot } from '@polymm/shared'

const PID_FILE_REL = 'data/bot.pid'

function workspaceRoot(): string {
  const root = findWorkspaceRoot()
  if (!root) throw new Error('workspace root not found')
  return root
}

function pidFilePath(): string {
  return resolve(workspaceRoot(), PID_FILE_REL)
}

export interface BotStatus {
  running: boolean
  pid: number | null
  startedAt: number | null
}

interface PidFileContents {
  pid: number
  startedAt: number
}

function readPidFile(): PidFileContents | null {
  const path = pidFilePath()
  if (!existsSync(path)) return null
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as PidFileContents
    if (typeof parsed.pid !== 'number') return null
    return parsed
  } catch {
    return null
  }
}

function writePidFile(contents: PidFileContents): void {
  writeFileSync(pidFilePath(), JSON.stringify(contents, null, 2))
}

function clearPidFile(): void {
  const path = pidFilePath()
  if (existsSync(path)) {
    try {
      unlinkSync(path)
    } catch {
      // ignore
    }
  }
}

function pidAlive(pid: number): boolean {
  try {
    // Signal 0 checks liveness without actually delivering a signal
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function getBotStatus(): BotStatus {
  const rec = readPidFile()
  if (!rec) return { running: false, pid: null, startedAt: null }
  if (!pidAlive(rec.pid)) {
    clearPidFile()
    return { running: false, pid: null, startedAt: null }
  }
  return { running: true, pid: rec.pid, startedAt: rec.startedAt }
}

export type StartResult =
  | { ok: true; pid: number }
  | { ok: false; error: string }

export function startBot(): StartResult {
  if (getBotStatus().running) {
    return { ok: false, error: 'bot is already running' }
  }

  const root = workspaceRoot()

  // Use pnpm to invoke the bot script so it resolves workspace deps correctly.
  const child = spawn(
    'pnpm',
    ['--filter', '@polymm/bot', 'exec', 'tsx', 'src/index.ts'],
    {
      cwd: root,
      env: {
        ...process.env,
        HEADLESS: 'true',
        TUI: 'false',
      },
      detached: true,
      stdio: 'ignore',
    }
  )

  // Unref so the dashboard can exit without killing the bot.
  child.unref()

  if (!child.pid) {
    return { ok: false, error: 'spawn did not return a pid' }
  }

  writePidFile({ pid: child.pid, startedAt: Date.now() })
  return { ok: true, pid: child.pid }
}

export type StopResult = { ok: true } | { ok: false; error: string }

export async function stopBot(): Promise<StopResult> {
  const status = getBotStatus()
  if (!status.running || status.pid == null) {
    clearPidFile()
    return { ok: true }
  }

  try {
    // SIGTERM triggers the bot's graceful shutdown (cancelAll in live mode,
    // close WS, flush DB, exit cleanly).
    process.kill(status.pid, 'SIGTERM')
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }

  // Wait up to 10s for the process to exit. If still alive, SIGKILL.
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (!pidAlive(status.pid)) {
      clearPidFile()
      return { ok: true }
    }
    await new Promise((r) => setTimeout(r, 200))
  }

  try {
    process.kill(status.pid, 'SIGKILL')
  } catch {
    // ignore
  }
  clearPidFile()
  return { ok: true }
}
