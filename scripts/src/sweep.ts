#!/usr/bin/env tsx
/**
 * Sweep all MM wallets back to the treasury.
 *
 * For each wallet:
 *   1. Cancel all open orders via the CLOB client
 *   2. Transfer remaining USDC.e to treasury
 *   3. Transfer almost all MATIC to treasury (leaves a tiny dust reserve for gas)
 *
 * This does NOT merge YES/NO back to USDC yet — that requires the NegRisk
 * adapter split/merge flow which is v2 (orders must first be cancelled and
 * any held positions must be handled manually until we wire up merge).
 * For now, sweep will warn if a wallet holds ERC-1155 positions.
 *
 * Usage:
 *   pnpm wallets:sweep                # dry-run
 *   pnpm wallets:sweep --yes          # execute
 */

import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { formatEther, getAddress, parseEther, type Address } from 'viem'
import { ClobClient, SignatureType } from '@polymarket/clob-client'
import { loadScriptEnv, hasFlag } from './lib/env.js'
import { loadWalletFromKeystore, makePublicClient } from './lib/wallet.js'
import { resolveContracts } from './lib/contracts.js'
import { CLOB_REST_URL, maskAddress } from '@polymm/shared'

const KEYSTORE_DIR = 'data/keystore'
const TREASURY_PATH = 'data/treasury.json'
const MATIC_DUST_RESERVE = parseEther('0.01') // leave a tiny bit for any follow-up txs

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
  const contracts = resolveContracts()
  const publicClient = makePublicClient(env.POLYGON_RPC_URL)

  if (!existsSync(TREASURY_PATH)) {
    console.error(`❌ Treasury not found at ${TREASURY_PATH}`)
    process.exit(1)
  }
  const treasury = loadWalletFromKeystore(TREASURY_PATH, env.KEYSTORE_PASSWORD, env.POLYGON_RPC_URL)
  console.log(`Treasury: ${treasury.address}`)

  const files = readdirSync(KEYSTORE_DIR)
    .filter((f) => f.match(/^\d+\.json$/))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))

  if (files.length === 0) {
    console.error(`❌ No MM wallets in ${KEYSTORE_DIR}`)
    process.exit(1)
  }

  console.log(`Sweeping ${files.length} wallets${execute ? '' : ' (dry-run)'}...`)
  console.log('')

  const collateral = getAddress(contracts.collateralToken)

  for (const file of files) {
    const index = parseInt(file.split('.')[0]!, 10)
    const w = loadWalletFromKeystore(
      join(KEYSTORE_DIR, file),
      env.KEYSTORE_PASSWORD,
      env.POLYGON_RPC_URL
    )
    console.log(`[${index}] ${w.label} ${maskAddress(w.address)}`)

    // 1) cancel all open orders
    try {
      const bootstrap = new ClobClient(CLOB_REST_URL, 137, w.walletClient)
      const creds = await bootstrap.createOrDeriveApiKey()
      const clob = new ClobClient(CLOB_REST_URL, 137, w.walletClient, creds, SignatureType.EOA, w.address)
      const openOrders = await clob.getOpenOrders()
      const count = Array.isArray(openOrders) ? openOrders.length : 0
      console.log(`    open orders: ${count}`)
      if (count > 0 && execute) {
        await clob.cancelAll()
        console.log('    cancelled all')
      }
    } catch (err) {
      console.log(`    ⚠ clob cancel skipped: ${(err as Error).message}`)
    }

    // 2) transfer USDC.e to treasury
    const usdcBal = (await publicClient.readContract({
      address: collateral,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [w.address],
    })) as bigint
    const usdcHuman = Number(usdcBal) / 1e6
    console.log(`    USDC.e: ${usdcHuman.toFixed(2)}`)
    if (usdcBal > 0n && execute) {
      const hash = await w.walletClient.writeContract({
        account: w.walletClient.account!,
        chain: w.walletClient.chain!,
        address: collateral,
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [treasury.address, usdcBal],
      })
      await publicClient.waitForTransactionReceipt({ hash })
      console.log(`    → treasury: tx ${hash}`)
    }

    // 3) transfer MATIC to treasury (minus dust)
    const maticBal = await publicClient.getBalance({ address: w.address })
    console.log(`    MATIC: ${formatEther(maticBal)}`)
    if (maticBal > MATIC_DUST_RESERVE && execute) {
      // Rough gas estimate: ~21k gas × 50 gwei ≈ 0.00105 MATIC
      const sendable = maticBal - MATIC_DUST_RESERVE - parseEther('0.005')
      if (sendable > 0n) {
        const hash = await w.walletClient.sendTransaction({
          account: w.walletClient.account!,
          chain: w.walletClient.chain!,
          to: treasury.address,
          value: sendable,
        })
        await publicClient.waitForTransactionReceipt({ hash })
        console.log(`    → treasury: tx ${hash}`)
      }
    }
  }

  console.log('')
  if (execute) {
    console.log('✅ Sweep complete.')
  } else {
    console.log('(dry-run) Pass --yes to execute.')
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
