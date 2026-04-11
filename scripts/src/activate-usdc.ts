#!/usr/bin/env tsx
/**
 * "Activate USDC" — swap native USDC → bridged USDC.e via Uniswap V3.
 *
 * Polymarket's "Activate funds" button does this under the hood. Markets on
 * Polymarket CLOB settle in USDC.e, but Polymarket withdraws (post-April-2026
 * stablecoin rollout) give the user native Circle USDC. This script bridges
 * the gap without touching any UI.
 *
 * Uses Uniswap V3 SwapRouter02 on Polygon at the 0.01% fee tier (100),
 * which is the purpose-built USDC ↔ USDC.e conversion pool with <10bp
 * slippage per Polymarket's docs.
 *
 * Usage:
 *   pnpm --filter @polymm/scripts run activate:usdc              # dry-run
 *   pnpm --filter @polymm/scripts run activate:usdc -- --yes     # execute
 *   pnpm --filter @polymm/scripts run activate:usdc -- --yes --slippage 1  # 1% slippage
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  getAddress,
  maxUint256,
  parseUnits,
  formatUnits,
  type Address,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { polygon } from 'viem/chains'
import { loadScriptEnv, hasFlag, getFlagValue } from './lib/env.js'
import { loadKeystore, decryptKeystore } from '@polymm/shared'
import { existsSync } from 'node:fs'

// ────────────────────────── constants ──────────────────────────

const USDC_NATIVE = getAddress('0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359')
const USDC_E = getAddress('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174')

/** Uniswap V3 SwapRouter02 on Polygon (mainnet) */
const SWAP_ROUTER_02 = getAddress('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45')

/** 0.01% fee tier (the USDC/USDC.e purpose-built pool) */
const POOL_FEE = 100

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

/**
 * SwapRouter02 exactInputSingle.
 *
 * NOTE: SwapRouter02's signature omits the deadline field that V3 SwapRouter01
 * had. The struct is: (tokenIn, tokenOut, fee, recipient, amountIn,
 * amountOutMinimum, sqrtPriceLimitX96).
 */
const SWAP_ROUTER_ABI = [
  {
    type: 'function',
    name: 'exactInputSingle',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const

// ────────────────────────── main ──────────────────────────

async function main() {
  const env = loadScriptEnv()
  const execute = hasFlag('--yes')
  const slippagePct = parseFloat(getFlagValue('--slippage') ?? '0.5')

  if (slippagePct <= 0 || slippagePct > 5) {
    console.error(`❌ --slippage must be between 0 and 5 (percent); got ${slippagePct}`)
    process.exit(1)
  }

  if (!existsSync(TREASURY_PATH)) {
    console.error(`❌ Treasury keystore not found at ${TREASURY_PATH}`)
    console.error('   Run: pnpm treasury:generate')
    process.exit(1)
  }

  const ks = loadKeystore(TREASURY_PATH)
  const privateKey = decryptKeystore(ks, env.KEYSTORE_PASSWORD)
  const account = privateKeyToAccount(privateKey)
  const owner = account.address

  const publicClient = createPublicClient({
    chain: polygon,
    transport: http(env.POLYGON_RPC_URL),
  })
  const walletClient = createWalletClient({
    account,
    chain: polygon,
    transport: http(env.POLYGON_RPC_URL),
  })

  console.log('')
  console.log('Activate USDC → USDC.e')
  console.log('─────────────────────────────────────────')
  console.log(`Treasury: ${owner}`)
  console.log(`Router:   ${SWAP_ROUTER_02}`)
  console.log(`Pool fee: ${POOL_FEE} (0.01%)`)
  console.log(`Slippage: ${slippagePct}%`)
  console.log('')

  // --- read balances & state ---
  const [usdcBal, usdcEBal, matic, allowance] = await Promise.all([
    publicClient.readContract({
      address: USDC_NATIVE,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner],
    }),
    publicClient.readContract({
      address: USDC_E,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner],
    }),
    publicClient.getBalance({ address: owner }),
    publicClient.readContract({
      address: USDC_NATIVE,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, SWAP_ROUTER_02],
    }),
  ])

  const usdcHuman = Number(formatUnits(usdcBal as bigint, 6))
  const usdcEHuman = Number(formatUnits(usdcEBal as bigint, 6))
  const maticHuman = Number(formatUnits(matic, 18))

  console.log(`Balances:`)
  console.log(`  USDC (native):  ${usdcHuman.toFixed(4)}`)
  console.log(`  USDC.e:         ${usdcEHuman.toFixed(4)}`)
  console.log(`  MATIC:          ${maticHuman.toFixed(4)}`)
  console.log('')

  if ((usdcBal as bigint) === 0n) {
    console.log('✅ No native USDC to swap. Nothing to do.')
    return
  }

  if (maticHuman < 0.02) {
    console.error(
      `❌ Treasury has only ${maticHuman.toFixed(4)} MATIC. Need at least ~0.02 for gas.`
    )
    console.error('   Send a few $ of MATIC to the treasury address first.')
    process.exit(1)
  }

  // --- swap plan ---
  const amountIn = usdcBal as bigint
  // amountOutMinimum: amountIn * (1 - slippage)
  // USDC and USDC.e are both 6 decimals, so 1:1 is the expected rate.
  const slippageBps = Math.round(slippagePct * 100)
  const amountOutMinimum = (amountIn * BigInt(10_000 - slippageBps)) / 10_000n

  console.log('Plan:')
  console.log(`  Swap in:   ${formatUnits(amountIn, 6)} USDC`)
  console.log(`  Min out:   ${formatUnits(amountOutMinimum, 6)} USDC.e`)
  console.log('')

  if (!execute) {
    console.log('(dry-run) Pass --yes to execute.')
    return
  }

  // --- approve router if needed ---
  const FULLY_APPROVED = maxUint256 / 2n
  if ((allowance as bigint) < FULLY_APPROVED) {
    console.log('→ Approving USDC for SwapRouter02...')
    const approveHash = await walletClient.writeContract({
      account,
      chain: polygon,
      address: USDC_NATIVE,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [SWAP_ROUTER_02, maxUint256],
    })
    console.log(`  tx ${approveHash}`)
    const receipt = await publicClient.waitForTransactionReceipt({ hash: approveHash })
    if (receipt.status !== 'success') {
      console.error('❌ Approval tx reverted')
      process.exit(1)
    }
    console.log('  ✓ approved')
    console.log('')
  }

  // --- execute swap ---
  console.log('→ Swapping USDC → USDC.e via Uniswap V3...')
  let swapHash: `0x${string}`
  try {
    swapHash = await walletClient.writeContract({
      account,
      chain: polygon,
      address: SWAP_ROUTER_02,
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [
        {
          tokenIn: USDC_NATIVE,
          tokenOut: USDC_E,
          fee: POOL_FEE,
          recipient: owner,
          amountIn,
          amountOutMinimum,
          sqrtPriceLimitX96: 0n,
        },
      ],
    })
  } catch (err) {
    console.error(`❌ Swap failed: ${(err as Error).message}`)
    process.exit(1)
  }
  console.log(`  tx ${swapHash}`)
  const swapReceipt = await publicClient.waitForTransactionReceipt({ hash: swapHash })
  if (swapReceipt.status !== 'success') {
    console.error('❌ Swap tx reverted. Try increasing --slippage.')
    process.exit(1)
  }

  // --- verify new balances ---
  const [usdcAfter, usdcEAfter] = await Promise.all([
    publicClient.readContract({
      address: USDC_NATIVE,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner],
    }),
    publicClient.readContract({
      address: USDC_E,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner],
    }),
  ])

  const gotUsdcE = (usdcEAfter as bigint) - (usdcEBal as bigint)

  console.log('')
  console.log('✅ Swap complete.')
  console.log(`  Received:  ${formatUnits(gotUsdcE, 6)} USDC.e`)
  console.log(`  New USDC.e balance:  ${formatUnits(usdcEAfter as bigint, 6)}`)
  console.log(`  Remaining USDC:      ${formatUnits(usdcAfter as bigint, 6)}`)
  console.log('')
  console.log('Next: pnpm wallets:fund --yes')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
