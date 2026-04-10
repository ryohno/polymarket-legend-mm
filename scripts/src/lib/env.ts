/**
 * Minimal env loader for operator CLI scripts. Separate from the bot's
 * config.ts because scripts don't need all the strategy parameters.
 */

import { config as loadDotenv } from 'dotenv'
import { resolve } from 'node:path'
import { z } from 'zod'
import { ensureCwdAtRoot } from '@polymm/shared'

// Chdir to workspace root so all data/*, .env paths resolve consistently
// regardless of where pnpm --filter launched us from.
const root = ensureCwdAtRoot()
loadDotenv({ path: resolve(root, '.env') })

const ScriptEnvSchema = z.object({
  POLYGON_RPC_URL: z.string().url(),
  KEYSTORE_PASSWORD: z.string().min(8),
})

export type ScriptEnv = z.infer<typeof ScriptEnvSchema>

export function loadScriptEnv(): ScriptEnv {
  const parsed = ScriptEnvSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('❌ Invalid environment:')
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}

export function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag)
}

export function getFlagValue(flag: string): string | null {
  const args = process.argv.slice(2)
  const idx = args.indexOf(flag)
  if (idx === -1 || idx === args.length - 1) return null
  return args[idx + 1] ?? null
}
