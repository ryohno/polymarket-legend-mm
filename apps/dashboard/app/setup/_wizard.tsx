'use client'

import { useState, useTransition } from 'react'
import type { SetupStatus } from '../../lib/setup-status'
import {
  generateTreasuryAction,
  generateWalletsAction,
  fundWalletsAction,
  grantApprovalsAction,
  sweepWalletsAction,
} from '../actions'

function StepCard({
  num,
  title,
  done,
  disabled,
  children,
}: {
  num: number
  title: string
  done: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`tile ${disabled ? 'opacity-50' : ''} border-l-4 ${done ? 'border-l-confirm' : 'border-l-gold'}`}
    >
      <div className="flex items-center gap-3 mb-3">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
            done ? 'bg-confirm text-bg' : 'bg-gold text-bg'
          }`}
        >
          {done ? '✓' : num}
        </div>
        <h2 className="text-lg font-bold">{title}</h2>
        {done && <span className="text-xs text-confirm ml-auto">DONE</span>}
      </div>
      <div className="text-sm space-y-2">{children}</div>
    </div>
  )
}

function Button({
  onClick,
  disabled,
  children,
  variant = 'primary',
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
  variant?: 'primary' | 'secondary' | 'danger'
}) {
  const styles = {
    primary: 'bg-gold text-bg hover:brightness-110',
    secondary: 'bg-trans-2 text-fg hover:bg-trans-3',
    danger: 'bg-alert text-fg hover:brightness-110',
  }[variant]
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-md text-sm font-bold ${styles} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  )
}

function OutputBox({ output, error }: { output?: string | null; error?: string | null }) {
  if (!output && !error) return null
  return (
    <pre className="mt-3 p-3 bg-background border border-border rounded-md text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto">
      {error && <span className="text-alert">{error}</span>}
      {error && output ? '\n' : null}
      {output && <span className="text-muted-3">{output}</span>}
    </pre>
  )
}

export function SetupWizard({ status }: { status: SetupStatus }) {
  const [pending, startTransition] = useTransition()
  const [runningStep, setRunningStep] = useState<string | null>(null)
  const [outputs, setOutputs] = useState<
    Record<string, { output: string; error: string | null }>
  >({})
  const [fundingUsd, setFundingUsd] = useState('625')
  const [fundingMatic, setFundingMatic] = useState('0.5')

  const run = (step: string, fn: () => Promise<{ output: string; error: string | null }>) => {
    setRunningStep(step)
    startTransition(async () => {
      const res = await fn()
      setOutputs((prev) => ({ ...prev, [step]: res }))
      setRunningStep(null)
    })
  }

  return (
    <div className="space-y-4">
      {/* Step 0: Env check */}
      {!status.envReady && (
        <div className="tile border-l-4 border-l-alert">
          <h2 className="text-lg font-bold mb-2 text-alert">Environment not ready</h2>
          <p className="text-sm text-muted-3 mb-2">
            Required env vars missing or set to default values:
          </p>
          <ul className="text-sm text-muted-3 list-disc ml-6">
            {status.envMissing.map((k) => (
              <li key={k} className="font-mono">{k}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-2 mt-3">
            Edit the <code className="font-mono">.env</code> file at the workspace root
            before continuing. A template is in <code className="font-mono">.env.example</code>.
          </p>
        </div>
      )}

      {/* Step 1: Treasury */}
      <StepCard
        num={1}
        title="Generate treasury wallet"
        done={status.treasuryReady}
        disabled={!status.envReady}
      >
        <p className="text-muted-3">
          Creates a fresh Polygon EOA locally, encrypted with your{' '}
          <code className="font-mono">KEYSTORE_PASSWORD</code>.
        </p>
        {status.treasuryAddress ? (
          <div className="mt-2 p-3 bg-background rounded-md">
            <div className="text-xs text-muted-2 mb-1">Treasury address:</div>
            <div className="font-mono text-sm text-gold select-all break-all">
              {status.treasuryAddress}
            </div>
            {status.treasuryUsdc != null && (
              <div className="mt-2 text-xs text-muted-3 num">
                Balance:{' '}
                <span className="text-fg">${status.treasuryUsdc.toFixed(2)} USDC.e</span>
                {' · '}
                <span className="text-fg">{status.treasuryMatic?.toFixed(4)} MATIC</span>
              </div>
            )}
          </div>
        ) : (
          <Button
            disabled={!status.envReady || pending}
            onClick={() =>
              run('treasury', async () => {
                const r = await generateTreasuryAction()
                return { output: r.output, error: r.error }
              })
            }
          >
            {runningStep === 'treasury' ? 'Generating…' : 'Generate treasury'}
          </Button>
        )}
        {outputs.treasury && <OutputBox {...outputs.treasury} />}
      </StepCard>

      {/* Step 2: Withdraw (instruction only) */}
      {status.treasuryReady && (
        <div className="tile border-l-4 border-l-gold">
          <h2 className="text-lg font-bold mb-2">Step 2: Fund treasury from Polymarket</h2>
          <ol className="text-sm text-muted-3 space-y-1 list-decimal ml-5">
            <li>
              Open{' '}
              <a
                href="https://polymarket.com"
                target="_blank"
                rel="noreferrer"
                className="text-gold hover:underline"
              >
                polymarket.com
              </a>{' '}
              in a new tab
            </li>
            <li>Click Withdraw</li>
            <li>
              Send your MM capital (USDC.e) to the treasury address above on <b>Polygon</b>
            </li>
            <li>
              Send ~0.2 MATIC to the same address from any exchange (gas for distribution)
            </li>
            <li>Wait a few seconds and this page will refresh automatically</li>
          </ol>
          {status.treasuryUsdc != null && status.treasuryUsdc < 1 && (
            <p className="text-xs text-muted-2 mt-3">
              Waiting for treasury to receive funds… currently{' '}
              <span className="text-fg num">${status.treasuryUsdc.toFixed(2)}</span>
            </p>
          )}
        </div>
      )}

      {/* Step 3: MM wallets */}
      <StepCard
        num={3}
        title="Generate MM wallets"
        done={status.walletsReady}
        disabled={!status.treasuryReady}
      >
        <p className="text-muted-3">
          Creates 8 market-making wallets locally, encrypted with the same keystore password.
        </p>
        {status.walletsReady ? (
          <div className="mt-2">
            <div className="text-xs text-muted-2 mb-1">{status.walletAddresses.length} wallets generated:</div>
            <ul className="text-xs font-mono space-y-0.5">
              {status.walletAddresses.map((a) => (
                <li key={a} className="text-muted-3">{a}</li>
              ))}
            </ul>
          </div>
        ) : (
          <Button
            disabled={!status.treasuryReady || pending}
            onClick={() =>
              run('wallets', async () => {
                const r = await generateWalletsAction(8)
                return { output: r.output, error: r.error }
              })
            }
          >
            {runningStep === 'wallets' ? 'Generating…' : 'Generate 8 wallets'}
          </Button>
        )}
        {outputs.wallets && <OutputBox {...outputs.wallets} />}
      </StepCard>

      {/* Step 4: Fund wallets */}
      <StepCard
        num={4}
        title="Distribute funds from treasury"
        done={status.fundingReady}
        disabled={
          !status.walletsReady ||
          !status.treasuryUsdc ||
          status.treasuryUsdc < 1
        }
      >
        <p className="text-muted-3">
          Sends USDC.e + MATIC from the treasury to each MM wallet.
        </p>
        {status.walletFunding.length > 0 && (
          <div className="mt-2 p-3 bg-background rounded-md">
            <div className="text-xs text-muted-2 mb-2 uppercase tracking-wide">Current balances</div>
            <div className="space-y-1">
              {status.walletFunding.map((w) => (
                <div
                  key={w.address}
                  className="flex justify-between font-mono text-xs"
                >
                  <span className="text-muted-3">{w.label}</span>
                  <span className="num text-fg">
                    ${w.usdc.toFixed(2)}{' '}
                    <span className="text-muted">· {w.matic.toFixed(3)} MATIC</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!status.fundingReady && status.walletsReady && (
          <div className="mt-3 flex items-end gap-3">
            <label className="flex flex-col text-xs text-muted-2">
              USD per wallet
              <input
                type="number"
                value={fundingUsd}
                onChange={(e) => setFundingUsd(e.target.value)}
                className="mt-1 px-2 py-1 bg-background border border-border rounded-md text-sm text-fg w-28"
                step="1"
                min="1"
              />
            </label>
            <label className="flex flex-col text-xs text-muted-2">
              MATIC per wallet
              <input
                type="number"
                value={fundingMatic}
                onChange={(e) => setFundingMatic(e.target.value)}
                className="mt-1 px-2 py-1 bg-background border border-border rounded-md text-sm text-fg w-28"
                step="0.1"
                min="0.1"
              />
            </label>
            <Button
              disabled={
                !status.walletsReady ||
                !status.treasuryUsdc ||
                status.treasuryUsdc < 1 ||
                pending
              }
              onClick={() =>
                run('fund', async () => {
                  const r = await fundWalletsAction({
                    usdPerWallet: parseFloat(fundingUsd),
                    maticPerWallet: parseFloat(fundingMatic),
                  })
                  return { output: r.output, error: r.error }
                })
              }
            >
              {runningStep === 'fund' ? 'Distributing…' : 'Distribute funds'}
            </Button>
          </div>
        )}
        {outputs.fund && <OutputBox {...outputs.fund} />}
      </StepCard>

      {/* Step 5: Approvals */}
      <StepCard
        num={5}
        title="Grant Polymarket approvals"
        done={status.approvalsReady}
        disabled={!status.fundingReady}
      >
        <p className="text-muted-3">
          Allows the NegRisk Exchange + Adapter to settle orders for each wallet (4 txs per
          wallet, one-time, ~$0.01 each).
        </p>
        {status.approvalsMissing.length > 0 && (
          <div className="mt-2 space-y-1 text-xs">
            {status.approvalsMissing.map((w) => (
              <div key={w.address} className="font-mono text-muted-3">
                <span className="text-gold">{w.label}</span>: missing{' '}
                <span className="text-alert">{w.missing.join(', ')}</span>
              </div>
            ))}
          </div>
        )}
        {!status.approvalsReady && (
          <Button
            disabled={!status.fundingReady || pending}
            onClick={() =>
              run('approvals', async () => {
                const r = await grantApprovalsAction()
                return { output: r.output, error: r.error }
              })
            }
          >
            {runningStep === 'approvals' ? 'Granting…' : 'Grant approvals'}
          </Button>
        )}
        {outputs.approvals && <OutputBox {...outputs.approvals} />}
      </StepCard>

      {/* Final */}
      {status.envReady && status.approvalsReady && (
        <div className="tile border-l-4 border-l-confirm">
          <h2 className="text-lg font-bold text-confirm mb-2">✓ Ready to trade</h2>
          <p className="text-sm text-muted-3 mb-3">
            All setup steps complete. Go to <a href="/control" className="text-gold hover:underline">Control</a> to start the bot.
          </p>
          <details className="text-xs text-muted-2">
            <summary className="cursor-pointer hover:text-fg">Advanced: sweep funds back to treasury</summary>
            <div className="mt-3">
              <p className="mb-2">
                Cancels all orders, transfers USDC.e + MATIC from every MM wallet back to the
                treasury. Use before shutting down the operation.
              </p>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() =>
                  run('sweep', async () => {
                    const r = await sweepWalletsAction()
                    return { output: r.output, error: r.error }
                  })
                }
              >
                {runningStep === 'sweep' ? 'Sweeping…' : 'Sweep all wallets'}
              </Button>
              {outputs.sweep && <OutputBox {...outputs.sweep} />}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
