#!/usr/bin/env tsx
/**
 * Distribute USDC.e + MATIC from the treasury to each MM wallet.
 *
 * Usage:
 *   pnpm wallets:fund                     # dry-run (prints plan, does not broadcast)
 *   pnpm wallets:fund --yes               # executes
 *   pnpm wallets:fund --yes --usd 500     # custom USD per wallet
 *   pnpm wallets:fund --yes --matic 0.5   # custom MATIC per wallet
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { formatEther, getAddress, parseEther, parseUnits, type Address } from 'viem'
import { loadScriptEnv, getFlagValue, hasFlag } from './lib/env.js'
import { makePublicClient, loadWalletFromKeystore } from './lib/wallet.js'
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
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

async function main() {
  const env = loadScriptEnv()
  const execute = hasFlag('--yes')
  const usdPerWallet = parseFloat(getFlagValue('--usd') ?? '625')
  const maticPerWallet = parseFloat(getFlagValue('--matic') ?? '0.5')

  if (!Number.isFinite(usdPerWallet) || usdPerWallet <= 0) {
    console.error(`❌ Invalid --usd: ${usdPerWallet}`)
    process.exit(1)
  }
  if (!Number.isFinite(maticPerWallet) || maticPerWallet <= 0) {
    console.error(`❌ Invalid --matic: ${maticPerWallet}`)
    process.exit(1)
  }

  const contracts = resolveContracts()
  const publicClient = makePublicClient(env.POLYGON_RPC_URL)

  // Load treasury
  const treasury = loadWalletFromKeystore(TREASURY_PATH, env.KEYSTORE_PASSWORD, env.POLYGON_RPC_URL)
  console.log(`Treasury: ${treasury.address}`)

  const [treasuryUsdc, treasuryMatic] = await Promise.all([
    publicClient.readContract({
      address: getAddress(contracts.collateralToken),
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [treasury.address],
    }),
    publicClient.getBalance({ address: treasury.address }),
  ])

  const usdcHuman = Number(treasuryUsdc) / 1e6
  const maticHuman = Number(formatEther(treasuryMatic))

  console.log(`  ${contracts.collateralSymbol}: ${usdcHuman.toFixed(2)}`)
  console.log(`  MATIC: ${maticHuman.toFixed(4)}`)
  console.log('')

  // Load target wallets
  const keystoreFiles = readdirSync(KEYSTORE_DIR)
    .filter((f) => f.match(/^\d+\.json$/))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))

  if (keystoreFiles.length === 0) {
    console.error(`❌ No MM wallet keystores found in ${KEYSTORE_DIR}. Run wallets:generate first.`)
    process.exit(1)
  }

  const targets: { index: number; address: Address; label: string }[] = []
  for (const file of keystoreFiles) {
    const index = parseInt(file.split('.')[0]!, 10)
    const w = loadWalletFromKeystore(
      join(KEYSTORE_DIR, file),
      env.KEYSTORE_PASSWORD,
      env.POLYGON_RPC_URL
    )
    targets.push({ index, address: w.address, label: w.label })
  }

  const totalUsd = usdPerWallet * targets.length
  const totalMatic = maticPerWallet * targets.length

  // Check sufficient funds
  if (usdcHuman < totalUsd) {
    console.error(
      `❌ Treasury has ${usdcHuman.toFixed(2)} ${contracts.collateralSymbol}, needs ${totalUsd.toFixed(2)}`
    )
    process.exit(1)
  }
  if (maticHuman < totalMatic) {
    console.error(`❌ Treasury has ${maticHuman.toFixed(4)} MATIC, needs ${totalMatic.toFixed(4)}`)
    process.exit(1)
  }

  // Print plan
  console.log('Funding plan:')
  console.log('')
  console.log(`  ${targets.length} wallets × ${usdPerWallet} ${contracts.collateralSymbol} = ${totalUsd}`)
  console.log(`  ${targets.length} wallets × ${maticPerWallet} MATIC = ${totalMatic.toFixed(4)}`)
  console.log('')
  for (const t of targets) {
    console.log(`  [${t.index}] ${t.label.padEnd(6)} ${maskAddress(t.address)}`)
  }
  console.log('')

  if (!execute) {
    console.log('(dry-run) Pass --yes to execute.')
    return
  }

  const usdcAmount = parseUnits(usdPerWallet.toString(), contracts.collateralDecimals)
  const maticAmount = parseEther(maticPerWallet.toString())

  for (const t of targets) {
    console.log(`[${t.index}] → sending USDC.e`)
    const usdcHash = await treasury.walletClient.writeContract({
      account: treasury.walletClient.account!,
      chain: treasury.walletClient.chain!,
      address: getAddress(contracts.collateralToken),
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [t.address, usdcAmount],
    })
    console.log(`    tx ${usdcHash}`)
    await publicClient.waitForTransactionReceipt({ hash: usdcHash })

    console.log(`[${t.index}] → sending MATIC`)
    const maticHash = await treasury.walletClient.sendTransaction({
      account: treasury.walletClient.account!,
      chain: treasury.walletClient.chain!,
      to: t.address,
      value: maticAmount,
    })
    console.log(`    tx ${maticHash}`)
    await publicClient.waitForTransactionReceipt({ hash: maticHash })
  }

  console.log('')
  console.log('✅ Funding complete.')
  console.log('')
  console.log('Next: pnpm wallets:approve')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
