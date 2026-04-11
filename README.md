# polymarket-legend-mm

Multi-wallet market-making bot for Polymarket, with a browser dashboard for everything — setup, control, and monitoring. No terminal needed for ongoing operations.

Built initially for the **Legend Trade Series** event (8 binary YES/NO markets, NegRisk CTF on Polygon), but generalizable to any Polymarket event.

> **Not wash trading.** The bot provides legitimate two-sided liquidity and includes hard cross-wallet self-trade prevention. Wash trading is prohibited by Polymarket's ToS and US commodity law.

## Quickstart

### Prerequisites (one-time, in terminal)

```bash
# Install pnpm if you don't have it
npm install -g pnpm

# Clone the repo
git clone https://github.com/ryohno/polymarket-legend-mm.git
cd polymarket-legend-mm

# Edit .env (copy from .env.example on first run)
cp .env.example .env
# Open .env and set:
#   POLYGON_RPC_URL="https://polygon.drpc.org" (or your Alchemy/QuickNode URL)
#   KEYSTORE_PASSWORD="a strong random password"
```

### Start the dashboard

**macOS**: double-click `run.command` in Finder.

Or in terminal:
```bash
./run.command
# or
pnpm install && pnpm dashboard
```

The dashboard opens at **http://localhost:3000** and auto-refreshes. Keep the terminal window running in the background.

### Everything else happens in the browser

1. **Setup tab** — walks you through:
   - Generate treasury wallet (creates a fresh Polygon EOA locally)
   - Withdraw from Polymarket: copy the treasury address and withdraw your MM capital from polymarket.com to it. The dashboard auto-detects when funds arrive.
   - Generate 8 MM wallets
   - Distribute funds from treasury to MM wallets (configurable USD + MATIC per wallet)
   - Grant Polymarket approvals (4 txs per wallet, idempotent)

2. **Control tab** — start / stop / restart the bot. Shows live heartbeat, open orders count, uptime, and a tail of `data/bot.log`. Big red "Stop" button when running; big gold "Start" button when stopped.

3. **Wallets / Markets / Events tabs** — live monitoring. Wallet balances (USDC.e + MATIC), market books with your quotes overlaid, and a scrolling event log.

4. **Kill Switch** — big red button on the Overview page that writes `data/KILL_SWITCH`, which the bot polls every 500ms and triggers a full `cancelAll` + graceful shutdown.

5. **Sweep** — on the Setup page under "Advanced", sweeps all MM wallet funds back to the treasury.

## Safety features (encoded in code, not convention)

- **DRY_RUN=true by default** — live trading requires setting `DRY_RUN=false` in .env explicitly
- **Cross-wallet self-trade prevention** — every order passes through `wouldSelfCross()` before placement; hard block
- **Heartbeat** — the bot pings the CLOB every 5s (live mode); Polymarket auto-cancels all orders on missed beats
- **Kill switch** — `data/KILL_SWITCH` file triggers full shutdown in <500ms
- **Drawdown cutoff** — aggregate P&L < −`MAX_DAILY_DRAWDOWN_USD` halts + cancels everything
- **Tick snapping** — every price is snapped to the market's valid tick size before submission
- **Encrypted keystores** — scrypt (N=131072) + AES-256-GCM, private keys never touch disk in plaintext
- **Pino log redaction** — `privateKey` / `secret` / `passphrase` / `password` are always redacted

## Architecture

- `apps/dashboard` — Next.js 15. The single entry point for ops. Spawns the bot as a detached child process and reads SQLite for state. All server actions: treasury/wallet gen, fund, approve, start/stop bot, kill switch.
- `apps/bot` — long-lived Node.js process. CLOB REST + WS, strategy loop, risk monitor, heartbeat. Writes state to `data/state.sqlite` and logs to `data/bot.log`. Spawned by the dashboard.
- `packages/shared` — types, SQLite schema, market constants, contract addresses, keystore, workspace-root resolution.
- `scripts` — setup CLIs that the dashboard invokes under the hood. Can also be run directly from terminal if you prefer.

## Collateral note

As of April 2026 the bot targets **USDC.e** (`0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174`). Polymarket announced a migration to Polymarket USD on 2026-04-06 with a 2–3 week rollout. Contract addresses are abstracted via `@polymarket/clob-client`'s `getContractConfig` for an easy swap when the new token ships — bump the dep and the bot picks up the new addresses.

## Running end-to-end for the first time

1. Clone repo, set up `.env` with your RPC + keystore password
2. Double-click `run.command` (or `./run.command` in terminal)
3. In the browser:
   1. **Setup** → Generate treasury → copy address
   2. Go to polymarket.com → Withdraw → send USDC.e + a few $ of MATIC to the treasury
   3. Back in **Setup** (auto-refreshes): Generate 8 wallets → Distribute funds → Grant approvals
   4. **Control** → Start bot (paper mode by default)
4. Watch the **Control** / **Wallets** / **Markets** / **Events** / **Logs** tabs
5. When happy, edit `.env`: `DRY_RUN=false` and restart from the Control tab
6. To shut down: hit Kill Switch (for emergency) or Stop Bot (clean), then Setup → Advanced → Sweep to return funds

## Keyboard-free operation confirmed

After the one-time `pnpm install` + `.env` setup, every ongoing action — including generating wallets, funding, approvals, starting/stopping the bot, monitoring, and emergency kill — is a click in the browser.
