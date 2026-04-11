/**
 * Runs setup scripts as one-shot child processes and captures their output.
 *
 * Rather than re-implementing treasury/wallet generation + funding logic in
 * the dashboard, we spawn the existing `pnpm --filter @polymm/scripts run X`
 * commands as subprocesses. This keeps a single source of truth and means
 * CLI-users and GUI-users do the same thing.
 *
 * Each script call:
 *   1. Spawns pnpm with the correct cwd (workspace root)
 *   2. Captures stdout + stderr
 *   3. Waits for exit
 *   4. Returns { ok, output, error, exitCode }
 *
 * Long-running scripts (fund, sweep) can take tens of seconds; server
 * actions have a default 30s timeout in Next.js which is plenty.
 */

import { spawn } from 'node:child_process'
import { findWorkspaceRoot } from '@polymm/shared'

export interface ScriptResult {
  ok: boolean
  output: string
  error: string | null
  exitCode: number | null
}

function workspaceRoot(): string {
  const root = findWorkspaceRoot()
  if (!root) throw new Error('workspace root not found')
  return root
}

export async function runScript(
  scriptName: string,
  args: string[] = []
): Promise<ScriptResult> {
  return new Promise((resolve) => {
    const child = spawn(
      'pnpm',
      ['--filter', '@polymm/scripts', 'run', scriptName, ...args],
      {
        cwd: workspaceRoot(),
        env: { ...process.env },
      }
    )

    let output = ''
    let error = ''

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      error += chunk.toString()
    })

    child.on('error', (err) => {
      resolve({
        ok: false,
        output,
        error: `${error}\n${err.message}`.trim(),
        exitCode: null,
      })
    })

    child.on('close', (code) => {
      resolve({
        ok: code === 0,
        output,
        error: error.trim() || null,
        exitCode: code,
      })
    })
  })
}
