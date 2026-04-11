#!/usr/bin/env bash
#
# Double-click launcher for polymarket-legend-mm.
#
# On macOS, a .command file opens in Terminal when double-clicked.
# This script installs deps if needed, starts the dashboard, and opens
# the browser. All further operations happen in the browser.
#
# Make sure this file is executable:
#   chmod +x run.command
#
set -e

# cd to this script's directory (the workspace root)
cd "$(dirname "$0")"

BLUE='\033[38;5;214m'
RESET='\033[0m'

echo -e "${BLUE}polymm${RESET} · market-maker dashboard launcher"
echo ""

# Check pnpm
if ! command -v pnpm &> /dev/null; then
  echo "❌ pnpm is not installed."
  echo "   Install with: npm install -g pnpm"
  echo ""
  read -p "Press enter to exit..."
  exit 1
fi

# .env check
if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    echo "⚠ No .env file found. Copying .env.example → .env"
    cp .env.example .env
    echo ""
    echo "   Please edit .env and set:"
    echo "     POLYGON_RPC_URL      (e.g. https://polygon.drpc.org)"
    echo "     KEYSTORE_PASSWORD    (strong random password)"
    echo ""
    read -p "   Press enter when done editing .env..."
  else
    echo "❌ No .env or .env.example found. Are you running from the right directory?"
    exit 1
  fi
fi

# Install deps if node_modules missing
if [ ! -d node_modules ]; then
  echo "📦 Installing dependencies (one-time, ~2 minutes)..."
  pnpm install
  echo ""
fi

# Start dashboard
PORT="${DASHBOARD_PORT:-3000}"
echo -e "${BLUE}→${RESET} Starting dashboard on http://localhost:${PORT}"
echo ""
echo "   Keep this window open while using the dashboard."
echo "   Press Ctrl+C in this window to stop."
echo ""

# Open the browser (macOS-specific)
(sleep 3 && open "http://localhost:${PORT}") &

# Start dashboard in the foreground so Ctrl+C works
exec pnpm --filter @polymm/dashboard exec next dev --port "${PORT}"
