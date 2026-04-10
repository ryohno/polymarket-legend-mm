#!/usr/bin/env tsx
/**
 * Generate a dedicated treasury EOA and write it to data/treasury.json.
 * This wallet holds all capital before distribution to MM wallets.
 *
 * Usage:
 *   pnpm treasury:generate
 *
 * After running, you must:
 *   1. Log into polymarket.com
 *   2. Withdraw USDC.e to the printed address
 *   3. Send ~$5 MATIC to the same address for gas
 */

import { generateWallet, encryptKeystore } from './lib/wallet.js'
import { saveKeystore } from '@polymm/shared'
import { loadScriptEnv } from './lib/env.js'
import { existsSync } from 'node:fs'

const TREASURY_PATH = 'data/treasury.json'

async function main() {
  const env = loadScriptEnv()

  if (existsSync(TREASURY_PATH)) {
    console.error(`❌ Treasury keystore already exists at ${TREASURY_PATH}`)
    console.error('   Refusing to overwrite. Delete the file manually if you really want a new one.')
    process.exit(1)
  }

  const { privateKey, address, label } = generateWallet('treasury')
  const keystore = encryptKeystore({
    privateKey,
    address,
    password: env.KEYSTORE_PASSWORD,
    label,
  })
  saveKeystore(TREASURY_PATH, keystore)

  console.log('')
  console.log('✅ Treasury wallet generated and encrypted.')
  console.log('')
  console.log(`   Address: ${address}`)
  console.log(`   Keystore: ${TREASURY_PATH}`)
  console.log('')
  console.log('Next steps:')
  console.log('  1. Log into https://polymarket.com')
  console.log('  2. Withdraw your MM capital (USDC.e) to the address above')
  console.log('  3. Send ~$5 of MATIC to the same address (for gas)')
  console.log('  4. Run: pnpm wallets:generate')
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
