/**
 * Detects where the user is in the setup flow so the wizard can show
 * the right next step.
 *
 * Steps:
 *   0. env:       .env file exists and has required keys
 *   1. treasury:  data/treasury.json exists
 *   2. wallets:   data/keystore/*.json exists (>= 1 file)
 *   3. funding:   treasury + all MM wallets have nonzero USDC.e
 *   4. approvals: all MM wallets have NegRisk Exchange + Adapter approvals
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { getAddress, type Address } from 'viem'
import { findWorkspaceRoot, loadKeystore } from '@polymm/shared'
import { createPublicClient, http } from 'viem'
import { polygon } from 'viem/chains'
import { getContractConfig } from '@polymarket/clob-client'

function root(): string {
  const r = findWorkspaceRoot()
  if (!r) throw new Error('workspace root not found')
  return r
}

export interface SetupStatus {
  envReady: boolean
  envMissing: string[]
  treasuryReady: boolean
  treasuryAddress: string | null
  walletsReady: boolean
  walletAddresses: string[]
  fundingReady: boolean
  treasuryUsdc: number | null
  treasuryMatic: number | null
  walletFunding: Array<{ label: string; address: string; usdc: number; matic: number }>
  approvalsReady: boolean
  approvalsMissing: Array<{ label: string; address: string; missing: string[] }>
}

const REQUIRED_ENV = ['POLYGON_RPC_URL', 'KEYSTORE_PASSWORD']

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

function checkEnv(): { ready: boolean; missing: string[]; rpc: string | null } {
  const envPath = resolve(root(), '.env')
  if (!existsSync(envPath)) return { ready: false, missing: REQUIRED_ENV, rpc: null }

  const raw = readFileSync(envPath, 'utf8')
  const lines = raw.split('\n')
  const entries: Record<string, string> = {}
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)=(?:"([^"]*)"|(.*))/i)
    if (!m) continue
    entries[m[1]!] = (m[2] ?? m[3] ?? '').trim()
  }
  const missing = REQUIRED_ENV.filter((k) => !entries[k] || entries[k]!.includes('change-me'))
  return {
    ready: missing.length === 0,
    missing,
    rpc: entries.POLYGON_RPC_URL ?? null,
  }
}

function readTreasury(): string | null {
  const path = resolve(root(), 'data/treasury.json')
  if (!existsSync(path)) return null
  try {
    const ks = loadKeystore(path)
    return ks.address
  } catch {
    return null
  }
}

interface WalletEntry {
  label: string
  address: `0x${string}`
}

function readWallets(): WalletEntry[] {
  const dir = resolve(root(), 'data/keystore')
  if (!existsSync(dir)) return []
  const files = readdirSync(dir).filter((f) => f.match(/^\d+\.json$/))
  const out: WalletEntry[] = []
  for (const file of files.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))) {
    try {
      const ks = loadKeystore(resolve(dir, file))
      out.push({ label: ks.label, address: ks.address })
    } catch {
      // ignore unreadable files
    }
  }
  return out
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const envCheck = checkEnv()
  const treasuryAddress = readTreasury()
  const wallets = readWallets()

  const status: SetupStatus = {
    envReady: envCheck.ready,
    envMissing: envCheck.missing,
    treasuryReady: treasuryAddress != null,
    treasuryAddress,
    walletsReady: wallets.length > 0,
    walletAddresses: wallets.map((w) => w.address),
    fundingReady: false,
    treasuryUsdc: null,
    treasuryMatic: null,
    walletFunding: [],
    approvalsReady: false,
    approvalsMissing: [],
  }

  // Without a valid RPC we can't check on-chain state
  if (!envCheck.rpc) return status

  let publicClient
  try {
    publicClient = createPublicClient({
      chain: polygon,
      transport: http(envCheck.rpc),
    })
  } catch {
    return status
  }

  const contracts = getContractConfig(137)
  const collateral = getAddress(contracts.collateral)

  // Check treasury balance
  if (treasuryAddress) {
    try {
      const [usdc, matic] = await Promise.all([
        publicClient.readContract({
          address: collateral,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [getAddress(treasuryAddress) as Address],
        }),
        publicClient.getBalance({ address: getAddress(treasuryAddress) as Address }),
      ])
      status.treasuryUsdc = Number(usdc) / 1e6
      status.treasuryMatic = Number(matic) / 1e18
    } catch {
      // ignore
    }
  }

  // Check wallet balances
  if (wallets.length > 0) {
    const walletStates = await Promise.all(
      wallets.map(async (w) => {
        try {
          const [usdc, matic] = await Promise.all([
            publicClient.readContract({
              address: collateral,
              abi: ERC20_ABI,
              functionName: 'balanceOf',
              args: [getAddress(w.address) as Address],
            }),
            publicClient.getBalance({ address: getAddress(w.address) as Address }),
          ])
          return {
            label: w.label,
            address: w.address,
            usdc: Number(usdc) / 1e6,
            matic: Number(matic) / 1e18,
          }
        } catch {
          return { label: w.label, address: w.address, usdc: 0, matic: 0 }
        }
      })
    )
    status.walletFunding = walletStates
    status.fundingReady = walletStates.every((w) => w.usdc > 0 && w.matic > 0)
  }

  // Check approvals (only if wallets are funded)
  if (status.fundingReady) {
    const negRiskExchange = getAddress(contracts.negRiskExchange)
    const negRiskAdapter = getAddress(contracts.negRiskAdapter)
    const ctf = getAddress(contracts.conditionalTokens)

    const missing: SetupStatus['approvalsMissing'] = []
    await Promise.all(
      wallets.map(async (w) => {
        try {
          const owner = getAddress(w.address) as Address
          const [allowExch, allowAdap, approveExch, approveAdap] = await Promise.all([
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
          const walletMissing: string[] = []
          const THRESHOLD = BigInt('1000000000000000000000000000000') // 1e30, huge but < maxUint256/2
          if ((allowExch as bigint) < THRESHOLD) walletMissing.push('USDC→Exchange')
          if ((allowAdap as bigint) < THRESHOLD) walletMissing.push('USDC→Adapter')
          if (!(approveExch as boolean)) walletMissing.push('CTF→Exchange')
          if (!(approveAdap as boolean)) walletMissing.push('CTF→Adapter')
          if (walletMissing.length > 0) {
            missing.push({ label: w.label, address: w.address, missing: walletMissing })
          }
        } catch {
          missing.push({ label: w.label, address: w.address, missing: ['unknown'] })
        }
      })
    )
    status.approvalsMissing = missing
    status.approvalsReady = missing.length === 0
  }

  return status
}
