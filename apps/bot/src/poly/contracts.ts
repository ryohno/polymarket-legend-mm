/**
 * Bot-side contract config.
 *
 * Source of truth precedence:
 *   1. Env overrides (COLLATERAL_TOKEN_ADDRESS, NEG_RISK_EXCHANGE, etc.)
 *   2. clob-client's `getContractConfig(137)` — stays in sync with installed SDK version
 *   3. Hardcoded defaults in @polymm/shared (fallback if SDK drops the export)
 */

import { getContractConfig } from '@polymarket/clob-client'
import { loadContractConfig } from '@polymm/shared'

export function resolveContracts() {
  // Start from SDK
  let fromSdk: ReturnType<typeof getContractConfig> | null = null
  try {
    fromSdk = getContractConfig(137)
  } catch {
    fromSdk = null
  }

  // Layer env overrides on top of shared defaults
  const shared = loadContractConfig(process.env)

  return {
    collateralToken: process.env.COLLATERAL_TOKEN_ADDRESS ?? fromSdk?.collateral ?? shared.collateralToken,
    collateralSymbol: shared.collateralSymbol,
    collateralDecimals: shared.collateralDecimals,
    conditionalTokens:
      process.env.CTF_ADDRESS ?? fromSdk?.conditionalTokens ?? shared.conditionalTokens,
    negRiskExchange:
      process.env.NEG_RISK_EXCHANGE ?? fromSdk?.negRiskExchange ?? shared.negRiskExchange,
    negRiskAdapter:
      process.env.NEG_RISK_ADAPTER ?? fromSdk?.negRiskAdapter ?? shared.negRiskAdapter,
    ctfExchange: fromSdk?.exchange ?? shared.ctfExchange,
  }
}

export type ResolvedContracts = ReturnType<typeof resolveContracts>
