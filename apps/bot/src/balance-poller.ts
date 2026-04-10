/**
 * Periodic on-chain balance poll.
 *
 * Reads USDC.e and MATIC balances for every wallet in the pool and writes
 * them into the `wallets` table so the dashboard shows real numbers.
 *
 * Runs every 15 seconds by default.
 */

import { getAddress, type Address, type PublicClient } from 'viem'
import type { BotWallet } from './poly/client.js'
import type { BotDb } from './db.js'
import type { ResolvedContracts } from './poly/contracts.js'
import { logger } from './log.js'

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const

export class BalancePoller {
  private timer: NodeJS.Timeout | null = null

  constructor(
    private readonly publicClient: PublicClient,
    private readonly wallets: BotWallet[],
    private readonly db: BotDb,
    private readonly contracts: ResolvedContracts,
    private readonly intervalMs: number = 15_000
  ) {}

  start(): void {
    if (this.timer) return
    void this.poll()
    this.timer = setInterval(() => void this.poll(), this.intervalMs)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private async poll(): Promise<void> {
    const collateral = getAddress(this.contracts.collateralToken)
    for (const w of this.wallets) {
      try {
        const [usdc, matic] = await Promise.all([
          this.publicClient.readContract({
            address: collateral,
            abi: ERC20_ABI,
            functionName: 'balanceOf',
            args: [w.address as Address],
          }),
          this.publicClient.getBalance({ address: w.address as Address }),
        ])
        this.db.upsertWallet({
          index: w.index,
          address: w.address,
          label: w.label,
          usdcMicro: usdc as bigint,
          maticWei: matic,
        })
      } catch (err) {
        logger.warn({ err, wallet: w.address }, 'balance poll failed')
      }
    }
  }
}
