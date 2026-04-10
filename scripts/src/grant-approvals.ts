#!/usr/bin/env tsx
/**
 * Grant required Polymarket contract approvals for every MM wallet.
 *
 * Per wallet:
 *   1. USDC.e .approve(negRiskExchange, max)
 *   2. USDC.e .approve(negRiskAdapter, max)    (for split/merge)
 *   3. CTF .setApprovalForAll(negRiskExchange, true)
 *   4. CTF .setApprovalForAll(negRiskAdapter, true)
 *
 * Idempotent — skips approvals that are already in place.
 *
 * Usage:
 *   pnpm wallets:approve
 */

import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { getAddress, maxUint256, type Address, type PublicClient, type WalletClient } from 'viem'
import { loadScriptEnv } from './lib/env.js'
import { loadWalletFromKeystore, makePublicClient } from './lib/wallet.js'
import { resolveContracts } from './lib/contracts.js'

const KEYSTORE_DIR = 'data/keystore'

const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ type: 'bool' }],
  },
] as const

const CTF_ABI = [
  {
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
] as const

const FULLY_APPROVED_THRESHOLD = maxUint256 / 2n

async function grantForWallet(params: {
  publicClient: PublicClient
  walletClient: WalletClient
  owner: Address
  collateral: Address
  ctf: Address
  negRiskExchange: Address
  negRiskAdapter: Address
}): Promise<{ granted: string[]; skipped: string[] }> {
  const { publicClient, walletClient, owner, collateral, ctf, negRiskExchange, negRiskAdapter } =
    params
  const granted: string[] = []
  const skipped: string[] = []

  const [usdcExchAllowance, usdcAdapterAllowance, ctfExch, ctfAdapter] = await Promise.all([
    publicClient.readContract({
      address: collateral,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, negRiskExchange],
    }),
    publicClient.readContract({
      address: collateral,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, negRiskAdapter],
    }),
    publicClient.readContract({
      address: ctf,
      abi: CTF_ABI,
      functionName: 'isApprovedForAll',
      args: [owner, negRiskExchange],
    }),
    publicClient.readContract({
      address: ctf,
      abi: CTF_ABI,
      functionName: 'isApprovedForAll',
      args: [owner, negRiskAdapter],
    }),
  ])

  if ((usdcExchAllowance as bigint) <= FULLY_APPROVED_THRESHOLD) {
    const hash = await walletClient.writeContract({
      account: walletClient.account!,
      chain: walletClient.chain!,
      address: collateral,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [negRiskExchange, maxUint256],
    })
    await publicClient.waitForTransactionReceipt({ hash })
    granted.push('USDC→Exchange')
  } else {
    skipped.push('USDC→Exchange')
  }

  if ((usdcAdapterAllowance as bigint) <= FULLY_APPROVED_THRESHOLD) {
    const hash = await walletClient.writeContract({
      account: walletClient.account!,
      chain: walletClient.chain!,
      address: collateral,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [negRiskAdapter, maxUint256],
    })
    await publicClient.waitForTransactionReceipt({ hash })
    granted.push('USDC→Adapter')
  } else {
    skipped.push('USDC→Adapter')
  }

  if (!(ctfExch as boolean)) {
    const hash = await walletClient.writeContract({
      account: walletClient.account!,
      chain: walletClient.chain!,
      address: ctf,
      abi: CTF_ABI,
      functionName: 'setApprovalForAll',
      args: [negRiskExchange, true],
    })
    await publicClient.waitForTransactionReceipt({ hash })
    granted.push('CTF→Exchange')
  } else {
    skipped.push('CTF→Exchange')
  }

  if (!(ctfAdapter as boolean)) {
    const hash = await walletClient.writeContract({
      account: walletClient.account!,
      chain: walletClient.chain!,
      address: ctf,
      abi: CTF_ABI,
      functionName: 'setApprovalForAll',
      args: [negRiskAdapter, true],
    })
    await publicClient.waitForTransactionReceipt({ hash })
    granted.push('CTF→Adapter')
  } else {
    skipped.push('CTF→Adapter')
  }

  return { granted, skipped }
}

async function main() {
  const env = loadScriptEnv()
  const contracts = resolveContracts()
  const publicClient = makePublicClient(env.POLYGON_RPC_URL)

  const files = readdirSync(KEYSTORE_DIR)
    .filter((f) => f.match(/^\d+\.json$/))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))

  if (files.length === 0) {
    console.error(`❌ No keystores in ${KEYSTORE_DIR}`)
    process.exit(1)
  }

  console.log(`Granting approvals for ${files.length} wallets...`)
  console.log('')

  const collateral = getAddress(contracts.collateralToken)
  const ctf = getAddress(contracts.conditionalTokens)
  const negRiskExchange = getAddress(contracts.negRiskExchange)
  const negRiskAdapter = getAddress(contracts.negRiskAdapter)

  for (const file of files) {
    const index = parseInt(file.split('.')[0]!, 10)
    const w = loadWalletFromKeystore(
      join(KEYSTORE_DIR, file),
      env.KEYSTORE_PASSWORD,
      env.POLYGON_RPC_URL
    )
    console.log(`[${index}] ${w.label} ${w.address}`)
    const { granted, skipped } = await grantForWallet({
      publicClient,
      walletClient: w.walletClient,
      owner: w.address,
      collateral,
      ctf,
      negRiskExchange,
      negRiskAdapter,
    })
    if (granted.length > 0) console.log(`    granted: ${granted.join(', ')}`)
    if (skipped.length > 0) console.log(`    already: ${skipped.join(', ')}`)
  }

  console.log('')
  console.log('✅ Approvals complete.')
  console.log('')
  console.log('Next: MODE=paper DRY_RUN=true pnpm bot')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
