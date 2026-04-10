# polymarket-legend-mm

Multi-wallet market-making bot for Polymarket, with a local monitoring dashboard.

Built initially for the **Legend Trade Series** event (8 binary YES/NO markets, NegRisk CTF on Polygon), but generalizable to any Polymarket event.

> **Not wash trading.** The bot provides legitimate two-sided liquidity and includes hard cross-wallet self-trade prevention. Wash trading is prohibited by Polymarket's ToS and US commodity law.

## Architecture

- `apps/bot` — long-lived Node.js process. Connects to Polymarket CLOB (REST + WS). Runs the strategy loop. Writes state to SQLite.
- `apps/dashboard` — Next.js 15 local dashboard. Read-only SQLite view + kill-switch.
- `packages/shared` — types, SQLite schema, market constants, contract addresses, format helpers.
- `scripts` — one-off CLIs for treasury, wallet generation, funding, approvals, sweep, status.

See [`/Users/ryanho/.claude/plans/federated-drifting-charm.md`](../.claude/plans/federated-drifting-charm.md) for the full build plan.

## Quickstart

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template
cp .env.example .env
# Edit .env: set POLYGON_RPC_URL and a strong KEYSTORE_PASSWORD

# 3. Generate dedicated treasury EOA
pnpm treasury:generate
# → prints a Polygon address; manually withdraw ~$5000 USDC.e from your Polymarket UI to this address

# 4. Generate 8 MM wallets
pnpm wallets:generate

# 5. Fund MM wallets from treasury (requires --yes)
pnpm wallets:fund --yes

# 6. Grant approvals (USDC.e + CTF setApprovalForAll to NegRisk Exchange/Adapter)
pnpm wallets:approve

# 7. Paper-trade first
MODE=paper DRY_RUN=true pnpm bot
# In another terminal:
pnpm dashboard   # → http://localhost:3000

# 8. Canary live (one wallet, tiny size)
MODE=live DRY_RUN=false CANARY_ONLY=0 ORDER_SIZE_USD=5 pnpm bot

# 9. Full live
MODE=live DRY_RUN=false pnpm bot
```

## Safety features

- **Heartbeat** — the bot pings the CLOB every 5s. If the bot dies, Polymarket auto-cancels all orders.
- **Cross-wallet self-trade prevention** — hard block on any order that would cross another of our wallets.
- **Drawdown kill** — aggregate P&L monitored; halts on breach.
- **Kill-switch file** — `data/KILL_SWITCH` presence triggers full cancel + exit. The dashboard button creates this file.
- **Dry-run default** — `.env.example` ships with `DRY_RUN=true`. You must explicitly opt into live trading.

## Collateral note

As of April 2026 the bot targets **USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`). Polymarket announced a migration to Polymarket USD on 2026-04-06 with a 2–3 week rollout. Contract addresses are abstracted behind env overrides in `.env` for an easy swap when the new token ships.
