/**
 * Idempotent on-chain approvals for a wallet to trade on Polymarket NegRisk CTF.
 *
 * Required approvals (per wallet):
 *   1. USDC.e .approve(negRiskExchange, max) — lets the exchange pull USDC when BUY fills
 *   2. ConditionalTokens .setApprovalForAll(negRiskExchange, true) — lets exchange move YES/NO on SELL fills
 *   3. ConditionalTokens .setApprovalForAll(negRiskAdapter, true)  — lets adapter split/merge basket positions
 *
 * We also grant USDC approval to the negRiskAdapter, which is required to use
 * split/merge functions for rebalancing.
 *
 * All approvals are granted as `MaxUint256` so they only need to be set once per wallet.
 */

import { maxUint256, getAddress, type PublicClient, type WalletClient, type Address } from 'viem'
import type { ResolvedContracts } from './contracts.js'

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

export interface ApprovalStatus {
  usdcExchange: boolean
  usdcAdapter: boolean
  ctfExchange: boolean
  ctfAdapter: boolean
}

export async function checkApprovals(params: {
  publicClient: PublicClient
  owner: Address
  contracts: ResolvedContracts
}): Promise<ApprovalStatus> {
  const { publicClient, owner, contracts } = params
  const [usdcExchangeAllowance, usdcAdapterAllowance, ctfExchange, ctfAdapter] = await Promise.all([
    publicClient.readContract({
      address: getAddress(contracts.collateralToken),
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, getAddress(contracts.negRiskExchange)],
    }),
    publicClient.readContract({
      address: getAddress(contracts.collateralToken),
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [owner, getAddress(contracts.negRiskAdapter)],
    }),
    publicClient.readContract({
      address: getAddress(contracts.conditionalTokens),
      abi: CTF_ABI,
      functionName: 'isApprovedForAll',
      args: [owner, getAddress(contracts.negRiskExchange)],
    }),
    publicClient.readContract({
      address: getAddress(contracts.conditionalTokens),
      abi: CTF_ABI,
      functionName: 'isApprovedForAll',
      args: [owner, getAddress(contracts.negRiskAdapter)],
    }),
  ])

  const FULLY_APPROVED_THRESHOLD = maxUint256 / 2n
  return {
    usdcExchange: (usdcExchangeAllowance as bigint) > FULLY_APPROVED_THRESHOLD,
    usdcAdapter: (usdcAdapterAllowance as bigint) > FULLY_APPROVED_THRESHOLD,
    ctfExchange: ctfExchange as boolean,
    ctfAdapter: ctfAdapter as boolean,
  }
}

export async function grantMissingApprovals(params: {
  publicClient: PublicClient
  walletClient: WalletClient
  contracts: ResolvedContracts
  onTx?: (label: string, hash: `0x${string}`) => void
}): Promise<{ granted: string[]; alreadyGranted: string[] }> {
  const { publicClient, walletClient, contracts, onTx } = params
  const account = walletClient.account
  if (!account) throw new Error('walletClient has no account')

  const status = await checkApprovals({
    publicClient,
    owner: account.address,
    contracts,
  })

  const granted: string[] = []
  const alreadyGranted: string[] = []

  // USDC → NegRisk Exchange
  if (!status.usdcExchange) {
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain!,
      address: getAddress(contracts.collateralToken),
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [getAddress(contracts.negRiskExchange), maxUint256],
    })
    onTx?.('USDC→NegRiskExchange', hash)
    await publicClient.waitForTransactionReceipt({ hash })
    granted.push('usdcExchange')
  } else {
    alreadyGranted.push('usdcExchange')
  }

  // USDC → NegRisk Adapter
  if (!status.usdcAdapter) {
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain!,
      address: getAddress(contracts.collateralToken),
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [getAddress(contracts.negRiskAdapter), maxUint256],
    })
    onTx?.('USDC→NegRiskAdapter', hash)
    await publicClient.waitForTransactionReceipt({ hash })
    granted.push('usdcAdapter')
  } else {
    alreadyGranted.push('usdcAdapter')
  }

  // CTF → NegRisk Exchange
  if (!status.ctfExchange) {
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain!,
      address: getAddress(contracts.conditionalTokens),
      abi: CTF_ABI,
      functionName: 'setApprovalForAll',
      args: [getAddress(contracts.negRiskExchange), true],
    })
    onTx?.('CTF→NegRiskExchange', hash)
    await publicClient.waitForTransactionReceipt({ hash })
    granted.push('ctfExchange')
  } else {
    alreadyGranted.push('ctfExchange')
  }

  // CTF → NegRisk Adapter
  if (!status.ctfAdapter) {
    const hash = await walletClient.writeContract({
      account,
      chain: walletClient.chain!,
      address: getAddress(contracts.conditionalTokens),
      abi: CTF_ABI,
      functionName: 'setApprovalForAll',
      args: [getAddress(contracts.negRiskAdapter), true],
    })
    onTx?.('CTF→NegRiskAdapter', hash)
    await publicClient.waitForTransactionReceipt({ hash })
    granted.push('ctfAdapter')
  } else {
    alreadyGranted.push('ctfAdapter')
  }

  return { granted, alreadyGranted }
}
