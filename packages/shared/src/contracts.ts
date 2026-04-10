/**
 * Polymarket / Polygon contract addresses.
 *
 * These are the defaults as of 2026-04-10. Polymarket announced a migration to
 * "Polymarket USD" on 2026-04-06 with a 2–3 week rollout, which will likely
 * change the collateral token address and possibly the exchange addresses.
 *
 * Prefer sourcing addresses from `@polymarket/order-utils`'s `getContractConfig`
 * at runtime where possible — bumping that dep gives us the new addresses
 * automatically. This file exists as a fallback + env-override layer so we can
 * hot-swap during the migration window without waiting for an SDK update.
 */

export const POLYGON_CHAIN_ID = 137

export interface ContractConfig {
  /** ERC-20 collateral token (USDC.e today, Polymarket USD soon) */
  collateralToken: string
  collateralSymbol: string
  collateralDecimals: number
  /** ConditionalTokens framework (ERC-1155, holds YES/NO shares) */
  conditionalTokens: string
  /** NegRisk CTF Exchange — settles orders for NegRisk events */
  negRiskExchange: string
  /** NegRisk Adapter — split/merge basket positions */
  negRiskAdapter: string
  /** Regular CTF Exchange — for non-NegRisk markets */
  ctfExchange: string
}

/**
 * Defaults from public Polymarket deployment. Verify with
 * `@polymarket/order-utils` `getContractConfig(137, negRisk)` at runtime.
 */
export const DEFAULT_CONTRACT_CONFIG: ContractConfig = {
  collateralToken: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e
  collateralSymbol: 'USDC.e',
  collateralDecimals: 6,
  conditionalTokens: '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045',
  negRiskExchange: '0xC5d563A36AE78145C45a50134d48A1215220f80a',
  negRiskAdapter: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296',
  ctfExchange: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
}

/**
 * Build a ContractConfig, applying env-var overrides if present.
 * Use this instead of importing DEFAULT_CONTRACT_CONFIG directly — it's the
 * seam where the Polymarket USD migration will land.
 */
export function loadContractConfig(env: NodeJS.ProcessEnv = process.env): ContractConfig {
  const cfg = { ...DEFAULT_CONTRACT_CONFIG }
  if (env.COLLATERAL_TOKEN_ADDRESS) cfg.collateralToken = env.COLLATERAL_TOKEN_ADDRESS
  if (env.COLLATERAL_TOKEN_SYMBOL) cfg.collateralSymbol = env.COLLATERAL_TOKEN_SYMBOL
  if (env.COLLATERAL_TOKEN_DECIMALS) {
    const n = parseInt(env.COLLATERAL_TOKEN_DECIMALS, 10)
    if (!Number.isNaN(n)) cfg.collateralDecimals = n
  }
  if (env.NEG_RISK_EXCHANGE) cfg.negRiskExchange = env.NEG_RISK_EXCHANGE
  if (env.NEG_RISK_ADAPTER) cfg.negRiskAdapter = env.NEG_RISK_ADAPTER
  if (env.CTF_ADDRESS) cfg.conditionalTokens = env.CTF_ADDRESS
  return cfg
}

/**
 * CLOB endpoints.
 */
export const CLOB_REST_URL = 'https://clob.polymarket.com'
export const CLOB_WS_MARKET_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/market'
export const CLOB_WS_USER_URL = 'wss://ws-subscriptions-clob.polymarket.com/ws/user'
export const GAMMA_REST_URL = 'https://gamma-api.polymarket.com'
