/**
 * Workspace root resolution.
 *
 * Many commands (bot, scripts) are launched from a nested package dir by pnpm's
 * `--filter` flag. All file-relative paths (data/state.sqlite, data/keystore/,
 * data/KILL_SWITCH, .env) live at the workspace root. Calling `ensureCwdAtRoot`
 * at process startup chdir's there so every cwd-relative path just works.
 */

import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

/**
 * Walk upward from a starting dir looking for a `pnpm-workspace.yaml`. That
 * file only exists at the monorepo root, so finding it identifies the root
 * unambiguously.
 */
export function findWorkspaceRoot(startDir: string = process.cwd()): string | null {
  let dir = resolve(startDir)
  for (let i = 0; i < 6; i++) {
    if (existsSync(resolve(dir, 'pnpm-workspace.yaml'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/**
 * Switch the process cwd to the workspace root. Safe to call multiple times.
 * Returns the root path.
 */
export function ensureCwdAtRoot(): string {
  const root = findWorkspaceRoot()
  if (!root) {
    throw new Error(
      'Could not find workspace root (no pnpm-workspace.yaml in any parent). ' +
        'Run this from inside the polymarket-legend-mm repository.'
    )
  }
  if (resolve(process.cwd()) !== root) {
    process.chdir(root)
  }
  return root
}
