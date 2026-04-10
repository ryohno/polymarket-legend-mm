#!/usr/bin/env tsx
/**
 * Generate N MM wallets (default 8) and write encrypted keystores to data/keystore/0..N-1.json.
 *
 * Usage:
 *   pnpm wallets:generate                 # 8 wallets
 *   pnpm wallets:generate --count 4       # custom count
 */

import { generateWallet, encryptKeystore } from './lib/wallet.js'
import { saveKeystore } from '@polymm/shared'
import { loadScriptEnv, getFlagValue } from './lib/env.js'
import { existsSync, readdirSync } from 'node:fs'

const KEYSTORE_DIR = 'data/keystore'

async function main() {
  const env = loadScriptEnv()
  const count = parseInt(getFlagValue('--count') ?? '8', 10)

  if (!Number.isFinite(count) || count < 1 || count > 64) {
    console.error(`❌ --count must be between 1 and 64, got ${count}`)
    process.exit(1)
  }

  if (existsSync(KEYSTORE_DIR)) {
    const existing = readdirSync(KEYSTORE_DIR).filter((f) => f.match(/^\d+\.json$/))
    if (existing.length > 0) {
      console.error(`❌ ${existing.length} keystore(s) already exist in ${KEYSTORE_DIR}`)
      console.error('   Refusing to overwrite. Move or delete them manually if you want a new set.')
      process.exit(1)
    }
  }

  console.log(`Generating ${count} MM wallets...`)
  console.log('')

  const wallets: { index: number; address: `0x${string}`; label: string }[] = []
  for (let i = 0; i < count; i++) {
    const label = `mm-${i}`
    const { privateKey, address } = generateWallet(label)
    const keystore = encryptKeystore({
      privateKey,
      address,
      password: env.KEYSTORE_PASSWORD,
      label,
    })
    saveKeystore(`${KEYSTORE_DIR}/${i}.json`, keystore)
    wallets.push({ index: i, address, label })
    console.log(`  [${i}] ${label}  ${address}`)
  }

  console.log('')
  console.log(`✅ Generated ${count} wallets, encrypted keystores in ${KEYSTORE_DIR}/`)
  console.log('')
  console.log('Next step: pnpm wallets:fund --yes  (distributes USDC.e + MATIC from treasury)')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
