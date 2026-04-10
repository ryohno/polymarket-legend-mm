/**
 * Factory for creating per-wallet ClobClient instances.
 *
 * We use viem for signing (clob-client v5.8+ natively supports WalletClient).
 * Each wallet in the pool gets its own ClobClient + cached API credentials.
 */

import { ClobClient, SignatureType } from '@polymarket/clob-client'
import { createWalletClient, http, type WalletClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { polygon } from 'viem/chains'
import { CLOB_REST_URL } from '@polymm/shared'

export interface BotWallet {
  index: number
  label: string
  address: `0x${string}`
  privateKey: `0x${string}`
  walletClient: WalletClient
  clobClient: ClobClient
}

/**
 * Build a viem WalletClient from a raw private key. Used both for CLOB
 * signing and for on-chain transactions (approvals, transfers).
 */
export function buildWalletClient(privateKey: `0x${string}`, rpcUrl: string): WalletClient {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({
    account,
    chain: polygon,
    transport: http(rpcUrl),
  })
}

/**
 * Build an authenticated ClobClient for this wallet.
 * Calls createOrDeriveApiKey() on first invocation to establish L2 creds.
 */
export async function buildClobClient(
  walletClient: WalletClient,
  funderAddress: `0x${string}`
): Promise<ClobClient> {
  // First pass: no creds, used only to call createOrDeriveApiKey
  const bootstrap = new ClobClient(CLOB_REST_URL, 137, walletClient)
  const creds = await bootstrap.createOrDeriveApiKey()

  // Second pass: full client with creds, signature type 0 (EOA), funder == signer
  return new ClobClient(
    CLOB_REST_URL,
    137,
    walletClient,
    creds,
    SignatureType.EOA,
    funderAddress
  )
}

/**
 * Convenience: build a BotWallet from a decrypted private key + metadata.
 */
export async function buildBotWallet(params: {
  index: number
  label: string
  privateKey: `0x${string}`
  rpcUrl: string
}): Promise<BotWallet> {
  const account = privateKeyToAccount(params.privateKey)
  const walletClient = buildWalletClient(params.privateKey, params.rpcUrl)
  const clobClient = await buildClobClient(walletClient, account.address)
  return {
    index: params.index,
    label: params.label,
    address: account.address,
    privateKey: params.privateKey,
    walletClient,
    clobClient,
  }
}
