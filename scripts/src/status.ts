#!/usr/bin/env tsx
/**
 * Print a snapshot of all wallets: balances, open orders, positions.
 *
 * Usage:
 *   pnpm status
 */

import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { formatEther, getAddress, type Address } from 'viem'
import { loadScriptEnv } from './lib/env.js'
import { loadWalletFromKeystore, makePublicClient } from './lib/wallet.js'
import { resolveContracts } from './lib/contracts.js'
import { maskAddress } from '@polymm/shared'

const KEYSTORE_DIR = 'data/keystore'
const TREASURY_PATH = 'data/treasury.json'

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

async function main() {
  const env = loadScriptEnv()
  const contracts = resolveContracts()
  const publicClient = makePublicClient(env.POLYGON_RPC_URL)

  const wallets: { label: string; address: Address; isTreasury: boolean }[] = []

  if (existsSync(TREASURY_PATH)) {
    const t = loadWalletFromKeystore(TREASURY_PATH, env.KEYSTORE_PASSWORD, env.POLYGON_RPC_URL)
    wallets.push({ label: 'treasury', address: t.address, isTreasury: true })
  }

  if (existsSync(KEYSTORE_DIR)) {
    const files = readdirSync(KEYSTORE_DIR)
      .filter((f) => f.match(/^\d+\.json$/))
      .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    for (const file of files) {
      const index = parseInt(file.split('.')[0]!, 10)
      const w = loadWalletFromKeystore(
        join(KEYSTORE_DIR, file),
        env.KEYSTORE_PASSWORD,
        env.POLYGON_RPC_URL
      )
      wallets.push({ label: `mm-${index}`, address: w.address, isTreasury: false })
    }
  }

  if (wallets.length === 0) {
    console.error('❌ No treasury or MM wallets found. Run generate-treasury / wallets:generate.')
    process.exit(1)
  }

  console.log('')
  console.log('Wallet Status')
  console.log('─────────────────────────────────────────────────────────────')
  console.log('  label       address           USDC.e         MATIC')
  console.log('  ─────────   ───────────────   ─────────────  ─────────────')

  let totalUsdc = 0
  let totalMatic = 0
  const collateral = getAddress(contracts.collateralToken)

  for (const w of wallets) {
    const [usdc, matic] = await Promise.all([
      publicClient.readContract({
        address: collateral,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [w.address],
      }),
      publicClient.getBalance({ address: w.address }),
    ])
    const usdcHuman = Number(usdc) / 1e6
    const maticHuman = Number(formatEther(matic))
    totalUsdc += usdcHuman
    totalMatic += maticHuman
    console.log(
      `  ${w.label.padEnd(10)}  ${maskAddress(w.address).padEnd(16)}  ${usdcHuman.toFixed(2).padStart(12)}  ${maticHuman.toFixed(4).padStart(12)}`
    )
  }

  console.log('  ─────────   ───────────────   ─────────────  ─────────────')
  console.log(
    `  TOTAL                          ${totalUsdc.toFixed(2).padStart(12)}  ${totalMatic.toFixed(4).padStart(12)}`
  )
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
