#!/usr/bin/env bash
# The stage demo on Monad testnet: DeadPool deployed once, a fresh demo pool, judge API + web on this laptop.
#
#   pnpm demo:testnet               # then open http://127.0.0.1:3100
#   REDEPLOY=1 pnpm demo:testnet    # deploy a new DeadPool first
#
# Needs .env with DEPLOYER_PRIVATE_KEY (funded from faucet.monad.xyz) and JUDGE_PRIVATE_KEY.
# The seed tops up the judge and the 8 team wallets from the deployer; stakes circulate between runs.
# Teams are fixture repos judged from recorded Claude verdicts (same as the local demo), on a real chain.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a; [ -f .env ] && . ./.env; set +a
export MONAD_RPC_URL="${MONAD_RPC_URL:-https://testnet-rpc.monad.xyz}"
: "${DEPLOYER_PRIVATE_KEY:?set DEPLOYER_PRIVATE_KEY in .env}"
: "${JUDGE_PRIVATE_KEY:?set JUDGE_PRIVATE_KEY in .env}"
unset DEAD_POOL_ADDRESS
export JUDGE_ALLOW_FIXTURES=1
export JUDGE_ENGINE="${JUDGE_ENGINE:-recorded}"
export DEMO_MODE=1
# A tenth of a cent per team instead of the pitch's 50 MON: 0.05 stake, 0.3 bonus, same ratios.
export DEMO_STAKE="${DEMO_STAKE:-0.05}" DEMO_BONUS="${DEMO_BONUS:-0.3}"
# Reset timings (seconds of real chain time; testnet can't fast-forward).
export DEMO_RESET_JOIN="${DEMO_RESET_JOIN:-25}" DEMO_RESET_END="${DEMO_RESET_END:-35}" DEMO_RESET_WINDOW="${DEMO_RESET_WINDOW:-20}"

CHAIN=$(cast chain-id --rpc-url "$MONAD_RPC_URL")
[ "$CHAIN" = "10143" ] || { echo "✗ $MONAD_RPC_URL is chain $CHAIN, expected Monad testnet (10143)"; exit 1; }
DEPLOYER=$(cast wallet address "$DEPLOYER_PRIVATE_KEY")
echo "• deployer $DEPLOYER has $(cast balance "$DEPLOYER" -e --rpc-url "$MONAD_RPC_URL") MON"

for port in 8787 3100; do
  if lsof -iTCP:$port -sTCP:LISTEN >/dev/null 2>&1; then echo "✗ port $port is in use (stop the local demo first)"; exit 1; fi
done

pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

(cd contracts && forge build --silent)
pnpm -s abi >/dev/null
if [ ! -f .deployments/10143.json ] || [ "${REDEPLOY:-}" = "1" ]; then
  echo "• deploying DeadPool to Monad testnet"
  pnpm -s --filter @deadpool/scripts run deploy
fi
echo "• seeding a demo pool"
pnpm -s --filter @deadpool/scripts run seed --stake "$DEMO_STAKE" --bonus "$DEMO_BONUS" --join "$DEMO_RESET_JOIN" --end "$DEMO_RESET_END" --window "$DEMO_RESET_WINDOW"

ADDR=$(node -e "console.log(require('./.deployments/10143.json').address)")
POOL=$(node -e "console.log(require('./.deployments/10143.json').demoPoolId)")

echo "• starting judge API on :8787"
JUDGE_API_PORT=8787 pnpm -s --filter @deadpool/judge serve & pids+=($!)

echo "• starting web on :3100"
cat > web/.env.local <<ENV
NEXT_PUBLIC_CHAIN_ID=10143
NEXT_PUBLIC_MONAD_RPC_URL=$MONAD_RPC_URL
NEXT_PUBLIC_DEAD_POOL_ADDRESS=$ADDR
NEXT_PUBLIC_JUDGE_API_URL=http://127.0.0.1:8787
NEXT_PUBLIC_DEMO_MODE=1
ENV
pnpm -s --filter @deadpool/web dev & pids+=($!)

cat <<MSG

  Dead Pool demo is up on Monad testnet
  ─────────────────────────────────────────────
  Landing     http://127.0.0.1:3100
  Demo pool   http://127.0.0.1:3100/pool/$POOL   (judging opens in ${DEMO_RESET_END}s)
  Contract    https://testnet.monadvision.com/address/$ADDR
  Ctrl+C stops everything.
MSG
wait
