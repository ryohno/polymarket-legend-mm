/**
 * Environment configuration with strict Zod validation.
 * Fail-fast on missing/invalid env vars at boot time.
 */

import { config as loadDotenv } from 'dotenv'
import { z } from 'zod'
import { loadContractConfig } from '@polymm/shared'

loadDotenv()

const EnvSchema = z.object({
  POLYGON_RPC_URL: z.string().url(),
  KEYSTORE_PASSWORD: z.string().min(8, 'KEYSTORE_PASSWORD must be at least 8 characters'),
  MODE: z.enum(['paper', 'live']).default('paper'),
  DRY_RUN: z
    .string()
    .optional()
    .transform((v) => v !== 'false'),
  CANARY_ONLY: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? null : parseInt(v, 10))),
  MAX_POSITION_USD_PER_MARKET: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : 100)),
  MAX_DAILY_DRAWDOWN_USD: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : 200)),
  SPREAD_TICKS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 2)),
  ORDER_SIZE_USD: z
    .string()
    .optional()
    .transform((v) => (v ? parseFloat(v) : 25)),
  POLL_INTERVAL_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 2000)),
  HEARTBEAT_INTERVAL_MS: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 5000)),
  DASHBOARD_PORT: z.string().optional().default('3000'),
  // Collateral / exchange overrides passed through to shared/contracts.ts
  COLLATERAL_TOKEN_ADDRESS: z.string().optional(),
  COLLATERAL_TOKEN_SYMBOL: z.string().optional(),
  COLLATERAL_TOKEN_DECIMALS: z.string().optional(),
  NEG_RISK_EXCHANGE: z.string().optional(),
  NEG_RISK_ADAPTER: z.string().optional(),
  CTF_ADDRESS: z.string().optional(),
})

export type Env = z.infer<typeof EnvSchema>

function loadEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env)
  if (!parsed.success) {
    console.error('❌ Invalid environment configuration:')
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`)
    }
    process.exit(1)
  }
  return parsed.data
}

export const env = loadEnv()
export const contracts = loadContractConfig(process.env)

export const isLive = env.MODE === 'live' && env.DRY_RUN === false
export const isDryRun = env.DRY_RUN !== false
