#!/usr/bin/env bash
#
# One-shot installer for a fresh Ubuntu 22.04 / 24.04 VPS.
# Run as root (or with sudo):
#
#   curl -fsSL https://raw.githubusercontent.com/ryohno/polymarket-legend-mm/main/deploy/install.sh | sudo bash
#
# Or clone first and run:
#
#   git clone https://github.com/ryohno/polymarket-legend-mm.git
#   sudo bash polymarket-legend-mm/deploy/install.sh
#
# What this does:
#   1. Creates a dedicated `polymm` user
#   2. Installs Node.js 20 LTS + pnpm + git + curl + ufw
#   3. Configures ufw to only allow SSH
#   4. Clones the repo into /home/polymm/polymarket-legend-mm
#   5. Installs pnpm deps
#   6. Copies systemd unit files (but does NOT start them — you need .env first)
#   7. Prints the next steps for you to do manually
#

set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "❌ Run this as root (or with sudo)."
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  polymarket-legend-mm · VPS installer"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

POLYMM_USER="polymm"
POLYMM_HOME="/home/${POLYMM_USER}"
REPO_URL="${REPO_URL:-https://github.com/ryohno/polymarket-legend-mm.git}"
REPO_PATH="${POLYMM_HOME}/polymarket-legend-mm"

# --- 1. Create polymm user ---
if id "${POLYMM_USER}" &>/dev/null; then
  echo "• user ${POLYMM_USER} already exists"
else
  echo "• creating user ${POLYMM_USER}"
  useradd -m -s /bin/bash "${POLYMM_USER}"
fi

# --- 2. System packages ---
echo "• installing system packages..."
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -yqq \
  curl git build-essential python3 ca-certificates ufw >/dev/null

# --- 3. Node.js 20 (via NodeSource) ---
if ! command -v node >/dev/null 2>&1 || [[ $(node --version | sed 's/v//' | cut -d. -f1) -lt 20 ]]; then
  echo "• installing node 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -yqq nodejs >/dev/null
fi
echo "  node $(node --version)"

# --- 4. pnpm (installed for the polymm user) ---
if ! sudo -u "${POLYMM_USER}" bash -c 'command -v pnpm' >/dev/null 2>&1; then
  echo "• installing pnpm for ${POLYMM_USER}..."
  sudo -u "${POLYMM_USER}" bash -c "curl -fsSL https://get.pnpm.io/install.sh | sh -"
fi
PNPM_BIN="${POLYMM_HOME}/.local/share/pnpm/pnpm"
echo "  pnpm $(sudo -u ${POLYMM_USER} ${PNPM_BIN} --version 2>/dev/null || echo '(installed)')"

# --- 5. Clone repo ---
if [[ -d "${REPO_PATH}" ]]; then
  echo "• repo already cloned at ${REPO_PATH}, pulling latest..."
  sudo -u "${POLYMM_USER}" git -C "${REPO_PATH}" pull
else
  echo "• cloning repo..."
  sudo -u "${POLYMM_USER}" git clone "${REPO_URL}" "${REPO_PATH}"
fi

# --- 6. Install workspace deps ---
echo "• installing pnpm workspace deps (this takes ~2 min)..."
sudo -u "${POLYMM_USER}" bash -c "cd ${REPO_PATH} && ${PNPM_BIN} install --frozen-lockfile" || \
  sudo -u "${POLYMM_USER}" bash -c "cd ${REPO_PATH} && ${PNPM_BIN} install"

# --- 7. Install systemd units ---
echo "• installing systemd unit files..."
install -m 644 "${REPO_PATH}/deploy/polymm-bot.service" /etc/systemd/system/polymm-bot.service
install -m 644 "${REPO_PATH}/deploy/polymm-dashboard.service" /etc/systemd/system/polymm-dashboard.service
systemctl daemon-reload

# --- 8. Firewall ---
echo "• configuring ufw (SSH only, everything else blocked)..."
ufw --force reset >/dev/null 2>&1 || true
ufw default deny incoming >/dev/null
ufw default allow outgoing >/dev/null
ufw allow OpenSSH >/dev/null
ufw --force enable >/dev/null

# --- 9. Create data dir ---
mkdir -p "${REPO_PATH}/data"
chown -R "${POLYMM_USER}:${POLYMM_USER}" "${REPO_PATH}/data"

# --- 10. Next steps ---
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✓ Install complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo ""
echo "  1. Become the polymm user:"
echo "       sudo -iu polymm"
echo ""
echo "  2. Create .env (copy from example and fill in):"
echo "       cd polymarket-legend-mm"
echo "       cp .env.example .env"
echo "       nano .env    # set POLYGON_RPC_URL + KEYSTORE_PASSWORD"
echo ""
echo "  3. Generate treasury + wallets + fund + approvals:"
echo "       pnpm treasury:generate         # prints address, copy it"
echo "       # → withdraw MM capital to that address"
echo "       pnpm wallets:generate          # 8 MM wallets"
echo "       pnpm wallets:fund --yes        # distribute"
echo "       pnpm wallets:approve           # grant approvals"
echo ""
echo "     OR skip steps and scp existing encrypted keystores from another box:"
echo "       # on laptop:"
echo "       scp data/treasury.json data/keystore/*.json polymm@<VPS>:~/polymarket-legend-mm/data/"
echo ""
echo "  4. Start the bot (as root):"
echo "       sudo systemctl enable --now polymm-bot"
echo "       sudo systemctl enable --now polymm-dashboard"
echo ""
echo "  5. Monitor from your laptop (via SSH tunnel):"
echo "       ssh -L 3000:localhost:3000 polymm@<VPS-IP>"
echo "       # then open http://localhost:3000 in your laptop browser"
echo ""
echo "  6. Tail logs on the VPS:"
echo "       sudo journalctl -u polymm-bot -f"
echo "       tail -f ~/polymarket-legend-mm/data/bot.log"
echo ""
