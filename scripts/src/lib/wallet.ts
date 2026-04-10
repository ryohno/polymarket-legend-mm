/**
 * Wallet utilities for scripts. Generates viem accounts, builds wallet/public
 * clients, loads encrypted keystores.
 */

import { createPublicClient, createWalletClient, http, type PublicClient, type WalletClient } from 'viem'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { polygon } from 'viem/chains'
import { encryptKeystore, decryptKeystore, loadKeystore, type KeystoreFile } from '@polymm/shared'
import { readFileSync } from 'node:fs'

export interface ScriptWallet {
  address: `0x${string}`
  privateKey: `0x${string}`
  walletClient: WalletClient
  label: string
}

export function makePublicClient(rpcUrl: string): PublicClient {
  return createPublicClient({ chain: polygon, transport: http(rpcUrl) })
}

export function makeWalletClient(privateKey: `0x${string}`, rpcUrl: string): WalletClient {
  const account = privateKeyToAccount(privateKey)
  return createWalletClient({ account, chain: polygon, transport: http(rpcUrl) })
}

export function generateWallet(label: string): { privateKey: `0x${string}`; address: `0x${string}`; label: string } {
  const privateKey = generatePrivateKey()
  const account = privateKeyToAccount(privateKey)
  return { privateKey, address: account.address, label }
}

export function loadWalletFromKeystore(
  path: string,
  password: string,
  rpcUrl: string
): ScriptWallet {
  const keystore: KeystoreFile = loadKeystore(path)
  const privateKey = decryptKeystore(keystore, password)
  const account = privateKeyToAccount(privateKey)
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(rpcUrl),
  })
  return {
    address: account.address,
    privateKey,
    walletClient,
    label: keystore.label,
  }
}

export { encryptKeystore, decryptKeystore, loadKeystore }
