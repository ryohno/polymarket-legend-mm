/**
 * Contract addresses for scripts. Resolves from clob-client + env overrides.
 */

import { getContractConfig } from '@polymarket/clob-client'
import { loadContractConfig } from '@polymm/shared'

export function resolveContracts() {
  let fromSdk: ReturnType<typeof getContractConfig> | null = null
  try {
    fromSdk = getContractConfig(137)
  } catch {
    fromSdk = null
  }
  const shared = loadContractConfig(process.env)
  return {
    collateralToken:
      process.env.COLLATERAL_TOKEN_ADDRESS ?? fromSdk?.collateral ?? shared.collateralToken,
    collateralDecimals: shared.collateralDecimals,
    collateralSymbol: shared.collateralSymbol,
    conditionalTokens:
      process.env.CTF_ADDRESS ?? fromSdk?.conditionalTokens ?? shared.conditionalTokens,
    negRiskExchange:
      process.env.NEG_RISK_EXCHANGE ?? fromSdk?.negRiskExchange ?? shared.negRiskExchange,
    negRiskAdapter:
      process.env.NEG_RISK_ADAPTER ?? fromSdk?.negRiskAdapter ?? shared.negRiskAdapter,
  }
}
