#!/usr/bin/env bash
# Launch LTX Desktop (handles first-time setup automatically)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ok()   { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}!${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ── nvm + Node.js (latest) ────────────────────────────────────────
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    warn "nvm not found — installing..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck source=/dev/null
source "$NVM_DIR/nvm.sh"

if ! nvm ls node >/dev/null 2>&1; then
    warn "Installing latest Node.js via nvm..."
    nvm install node
fi
nvm use node >/dev/null
ok "node $(node -v) (via nvm)"

# ── pnpm (install via npm if missing) ─────────────────────────────
if ! command -v pnpm >/dev/null 2>&1; then
    warn "pnpm not found — installing via npm..."
    npm install -g pnpm
fi
ok "pnpm $(pnpm --version)"

# ── uv (install if missing) ───────────────────────────────────────
if ! command -v uv >/dev/null 2>&1; then
    warn "uv not found — installing..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    export PATH="$HOME/.local/bin:$PATH"
fi
ok "uv $(uv --version)"

# ── First-time setup (node_modules + backend venv) ────────────────
if [ ! -d "node_modules" ] || [ ! -x "node_modules/.bin/vite" ]; then
    warn "node_modules missing or incomplete — running pnpm install..."
    pnpm install
    ok "pnpm install complete"
fi

if [ ! -d "backend/.venv" ]; then
    warn "Python venv missing — running uv sync..."
    (cd backend && uv sync --extra dev)
    ok "uv sync complete"
fi

# ── Symlink models if not already done ─────────────────────────────
MODELS_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/LTXDesktop/models"
if [ ! -d "$MODELS_DIR" ]; then
    warn "Models directory missing — running symlink script..."
    bash scripts/symlink-models.sh
fi

# ── Launch ─────────────────────────────────────────────────────────
echo ""
echo "Launching LTX Desktop..."
pnpm dev
