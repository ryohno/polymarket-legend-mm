/**
 * Loads encrypted keystore files, decrypts on boot, and constructs BotWallet
 * instances (viem WalletClient + ClobClient + API credentials).
 *
 * Private key material is held in memory for the lifetime of the bot process
 * and is never persisted in plaintext.
 */

import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { loadKeystore, decryptKeystore } from '@polymm/shared'
import { buildBotWallet, type BotWallet } from './poly/client.js'
import { logger } from './log.js'

export const KEYSTORE_DIR = 'data/keystore'
export const TREASURY_KEYSTORE_PATH = 'data/treasury.json'

export async function loadMmWallets(params: {
  password: string
  rpcUrl: string
  onlyIndex?: number | null
}): Promise<BotWallet[]> {
  if (!existsSync(KEYSTORE_DIR)) {
    throw new Error(
      `Keystore directory ${KEYSTORE_DIR} does not exist. Run \`pnpm wallets:generate\` first.`
    )
  }

  const files = readdirSync(KEYSTORE_DIR)
    .filter((f) => f.match(/^\d+\.json$/))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))

  if (files.length === 0) {
    throw new Error(
      `No keystore files found in ${KEYSTORE_DIR}. Run \`pnpm wallets:generate\` first.`
    )
  }

  const wallets: BotWallet[] = []
  for (const file of files) {
    const index = parseInt(file.split('.')[0]!, 10)
    if (params.onlyIndex != null && index !== params.onlyIndex) continue

    const keystore = loadKeystore(join(KEYSTORE_DIR, file))
    const privateKey = decryptKeystore(keystore, params.password)
    const label = keystore.label
    logger.info({ index, label, address: keystore.address }, 'loading wallet')
    const wallet = await buildBotWallet({
      index,
      label,
      privateKey,
      rpcUrl: params.rpcUrl,
    })
    wallets.push(wallet)
  }

  logger.info({ count: wallets.length }, 'wallet pool loaded')
  return wallets
}

export async function loadTreasuryWallet(params: {
  password: string
  rpcUrl: string
}): Promise<BotWallet> {
  if (!existsSync(TREASURY_KEYSTORE_PATH)) {
    throw new Error(
      `Treasury keystore ${TREASURY_KEYSTORE_PATH} does not exist. Run \`pnpm treasury:generate\` first.`
    )
  }
  const keystore = loadKeystore(TREASURY_KEYSTORE_PATH)
  const privateKey = decryptKeystore(keystore, params.password)
  return buildBotWallet({
    index: -1,
    label: 'treasury',
    privateKey,
    rpcUrl: params.rpcUrl,
  })
}
