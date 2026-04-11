# VPS Deployment

Running polymm from a hosted VPS outside the US so Polymarket's CLOB accepts orders.

## Provider choice

Any provider with a non-US region works. Recommended in order of value:

| Provider | Region | Price/mo | Notes |
| --- | --- | --- | --- |
| **Hetzner Cloud** | Falkenstein/Helsinki (EU) | €4.51 (CX22) | Cheapest, 2 vCPU / 4 GB RAM. EU card required, or use crypto via a reseller. |
| **DigitalOcean** | Singapore, Frankfurt, London, Toronto | $6 (basic droplet) | Easy signup, global card accepted. |
| **Vultr** | Tokyo, Singapore, Amsterdam, Frankfurt, Paris, London, Toronto | $3.50–6 | Cheapest in many regions, accepts crypto. |
| **Linode/Akamai** | Frankfurt, London, Tokyo, Singapore, Toronto | $5 | Solid, similar to DO. |

All work. Pick one. Region choice matters less than you'd think for latency to Polygon (Polygon RPC endpoints are globally distributed).

## Size

- 1 vCPU, 1–2 GB RAM, 25 GB SSD — plenty for the bot + dashboard + SQLite
- Ubuntu 22.04 or 24.04 LTS (the installer is tested on both)

## Install (~3 minutes)

After spinning up the VPS, SSH in as root (or via the provider's web console):

```bash
# Download and run the installer
curl -fsSL https://raw.githubusercontent.com/ryohno/polymarket-legend-mm/main/deploy/install.sh | sudo bash
```

This will:
1. Create a `polymm` user
2. Install Node 20, pnpm, git, ufw
3. Clone the repo into `/home/polymm/polymarket-legend-mm`
4. Install pnpm deps
5. Copy systemd unit files
6. Lock down the firewall (SSH only)

Then follow the on-screen next steps: become `polymm`, create `.env`, set up wallets, start the services.

## Moving an existing wallet set from laptop → VPS

If you've already generated wallets on your laptop and don't want to re-do the setup, just scp the encrypted keystores:

```bash
# On your laptop:
scp data/treasury.json data/keystore/*.json polymm@<VPS-IP>:~/polymarket-legend-mm/data/
```

Then on the VPS:

```bash
sudo -iu polymm
cd polymarket-legend-mm
cp .env.example .env
nano .env    # set POLYGON_RPC_URL + KEYSTORE_PASSWORD (same password used on laptop)
```

The `KEYSTORE_PASSWORD` must match what you used on the laptop to encrypt the keystores — that's how the bot decrypts them at runtime.

Finally, start the services:

```bash
sudo systemctl enable --now polymm-bot
sudo systemctl enable --now polymm-dashboard
sudo systemctl status polymm-bot
```

## Accessing the dashboard

The dashboard binds only to `127.0.0.1:3000` on the VPS — it is **not** exposed to the public internet (by design — no auth, localhost-only). Use an SSH tunnel:

```bash
# On your laptop:
ssh -L 3000:localhost:3000 polymm@<VPS-IP>
```

Leave that SSH session open, then open `http://localhost:3000` in your laptop's browser. It talks to the dashboard running on the VPS through the encrypted tunnel.

Alternative (tmux-friendly):
```bash
ssh -fN -L 3000:localhost:3000 polymm@<VPS-IP>
# -f: background, -N: no shell (just tunnel)
```

## Monitoring

```bash
# Systemd status
sudo systemctl status polymm-bot
sudo systemctl status polymm-dashboard

# Live logs (systemd)
sudo journalctl -u polymm-bot -f

# Bot's own log (pino JSON)
tail -f /home/polymm/polymarket-legend-mm/data/bot.log

# Restart
sudo systemctl restart polymm-bot
```

## Emergency kill

From anywhere with SSH access:
```bash
# Option 1: write the kill-switch file (bot polls every 500ms)
touch /home/polymm/polymarket-legend-mm/data/KILL_SWITCH

# Option 2: stop the service (cleaner, triggers graceful shutdown)
sudo systemctl stop polymm-bot
```

## Verifying you're not geoblocked

Before starting the bot:
```bash
curl -s https://ipinfo.io/json | grep country
# Should show anything except "US"
```

## Security checklist

- [ ] SSH key-only login (password disabled in `/etc/ssh/sshd_config`)
- [ ] `ufw` enabled, SSH-only (installer does this)
- [ ] `.env` has a strong `KEYSTORE_PASSWORD` (not the default test one)
- [ ] `data/` is not world-readable: `chmod 700 data/`
- [ ] `data/keystore/*.json` is owned by `polymm` only
- [ ] Dashboard never bound to 0.0.0.0 — access strictly via SSH tunnel
- [ ] Treasury + MM wallet private keys only exist inside encrypted keystores on disk
