#!/usr/bin/env tsx
/**
 * Show on-chain approval state for every MM wallet.
 * Quick diagnostic for "is the approve script actually making progress".
 */

import { readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createPublicClient, http, getAddress, maxUint256, type Address } from 'viem'
import { polygon } from 'viem/chains'
import { getContractConfig } from '@polymarket/clob-client'
import { loadKeystore } from '@polymm/shared'
import { loadScriptEnv } from './lib/env.js'

const KEYSTORE_DIR = 'data/keystore'
const THRESHOLD = maxUint256 / 2n

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
] as const

async function main() {
  const env = loadScriptEnv()
  const client = createPublicClient({ chain: polygon, transport: http(env.POLYGON_RPC_URL) })
  const contracts = getContractConfig(137)
  const collateral = getAddress(contracts.collateral)
  const ctf = getAddress(contracts.conditionalTokens)
  const exch = getAddress(contracts.negRiskExchange)
  const adap = getAddress(contracts.negRiskAdapter)

  const files = readdirSync(KEYSTORE_DIR)
    .filter((f) => f.match(/^\d+\.json$/))
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))

  console.log('')
  console.log('Wallet    addr              USDC→exch  USDC→adap  CTF→exch   CTF→adap')
  console.log('────────  ────────────────  ─────────  ─────────  ─────────  ─────────')

  let totalDone = 0
  let totalNeeded = 0
  for (const file of files) {
    const ks = loadKeystore(join(KEYSTORE_DIR, file))
    const owner = getAddress(ks.address) as Address

    const [usdcExch, usdcAdap, ctfExch, ctfAdap] = await Promise.all([
      client.readContract({ address: collateral, abi: ERC20_ABI, functionName: 'allowance', args: [owner, exch] }),
      client.readContract({ address: collateral, abi: ERC20_ABI, functionName: 'allowance', args: [owner, adap] }),
      client.readContract({ address: ctf, abi: CTF_ABI, functionName: 'isApprovedForAll', args: [owner, exch] }),
      client.readContract({ address: ctf, abi: CTF_ABI, functionName: 'isApprovedForAll', args: [owner, adap] }),
    ])
    const a = (usdcExch as bigint) > THRESHOLD ? '✓' : '·'
    const b = (usdcAdap as bigint) > THRESHOLD ? '✓' : '·'
    const c = (ctfExch as boolean) ? '✓' : '·'
    const d = (ctfAdap as boolean) ? '✓' : '·'
    const done = [a, b, c, d].filter((x) => x === '✓').length
    totalDone += done
    totalNeeded += 4
    console.log(`${ks.label.padEnd(8)}  ${owner.slice(0, 16)}  ${a.padStart(9)}  ${b.padStart(9)}  ${c.padStart(9)}  ${d.padStart(9)}`)
  }
  console.log('')
  console.log(`Progress: ${totalDone}/${totalNeeded}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
