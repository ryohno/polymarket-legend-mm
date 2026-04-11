#!/usr/bin/env tsx
/**
 * Debug helper: probe the treasury address for balances across all likely
 * stablecoins so we can tell exactly what Polymarket sent.
 *
 * Usage: pnpm --filter @polymm/scripts exec tsx src/probe-treasury.ts
 */

import { createPublicClient, http, getAddress, type Address } from 'viem'
import { polygon } from 'viem/chains'
import { loadScriptEnv } from './lib/env.js'
import { loadKeystore } from '@polymm/shared'
import { existsSync } from 'node:fs'

const TOKENS = [
  { sym: 'USDC.e (bridged)', addr: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', dec: 6 },
  { sym: 'USDC (native)', addr: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', dec: 6 },
  { sym: 'USDT', addr: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F', dec: 6 },
  { sym: 'DAI', addr: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', dec: 18 },
] as const

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

async function main() {
  const env = loadScriptEnv()

  if (!existsSync('data/treasury.json')) {
    console.error('❌ No treasury keystore at data/treasury.json')
    process.exit(1)
  }
  const ks = loadKeystore('data/treasury.json')
  const owner = getAddress(ks.address) as Address

  const client = createPublicClient({
    chain: polygon,
    transport: http(env.POLYGON_RPC_URL),
  })

  console.log('')
  console.log(`Treasury: ${owner}`)
  console.log('')

  const matic = await client.getBalance({ address: owner })
  console.log(`  MATIC:                 ${(Number(matic) / 1e18).toFixed(6)}`)
  console.log('')

  console.log('  ERC-20 balances:')
  for (const t of TOKENS) {
    try {
      const bal = (await client.readContract({
        address: getAddress(t.addr),
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [owner],
      })) as bigint
      const human = Number(bal) / 10 ** t.dec
      const flag = human > 0 ? ' ✓' : '  '
      console.log(
        `  ${flag}${t.sym.padEnd(22)} ${human.toFixed(4).padStart(14)}   ${t.addr}`
      )
    } catch {
      console.log(`     ${t.sym.padEnd(22)} (read error)   ${t.addr}`)
    }
  }
  console.log('')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
