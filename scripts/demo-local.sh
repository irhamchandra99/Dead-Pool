#!/usr/bin/env bash
# One command for the stage demo on a laptop:
#   anvil (local Monad stand-in) + DeadPool deployed + seeded pools + judge API + web app.
# The demo pool opens for judging DEMO_END seconds after seeding (default 90),
# then the challenge window is DEMO_WINDOW seconds (default 30).
#
#   pnpm demo            # then open http://127.0.0.1:3100
#   Offline by default: 8 fixture repos + recorded Claude verdicts (instant, free, same every time).
#   JUDGE_ENGINE=claude-cli DEMO_REPOS=https://github.com/foundry-rs/foundry,... pnpm demo   # live judge
set -euo pipefail
cd "$(dirname "$0")/.."

RPC="http://127.0.0.1:8545"
export MONAD_RPC_URL="$RPC"
export JUDGE_ALLOW_FIXTURES=1
# Local runs always use anvil dev keys, even if .env holds testnet keys.
export DEPLOYER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" # anvil dev account #0
export JUDGE_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" # anvil dev account #1
unset DEAD_POOL_ADDRESS
export JUDGE_ENGINE="${JUDGE_ENGINE:-recorded}"
END="${DEMO_END:-90}"
WINDOW="${DEMO_WINDOW:-30}"

pids=()
cleanup() { for p in "${pids[@]:-}"; do kill "$p" 2>/dev/null || true; done; }
trap cleanup EXIT INT TERM

rpc_up() { curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' "$RPC" >/dev/null 2>&1; }

if rpc_up; then
  echo "• anvil already running on :8545 (reusing it)"
  # The demo needs 20 funded dev accounts (anvil --accounts 20).
  if [ "$(cast balance 0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199 --rpc-url "$RPC" 2>/dev/null || echo 0)" = "0" ]; then
    echo "  ✗ that anvil was started without --accounts 20. Stop it and run pnpm demo again."; exit 1
  fi
else
  echo "• starting anvil"
  anvil --silent --block-time 1 --accounts 20 & pids+=($!)
  for _ in $(seq 1 40); do rpc_up && break; sleep 0.25; done
fi

echo "• building, deploying, seeding"
(cd contracts && forge build --silent)
pnpm -s abi >/dev/null
pnpm -s --filter @deadpool/scripts run deploy
pnpm -s --filter @deadpool/scripts run seed --join 30 --end "$END" --window "$WINDOW"

ADDR=$(node -e "console.log(require('./.deployments/31337.json').address)")
POOL=$(node -e "console.log(require('./.deployments/31337.json').demoPoolId)")

echo "• starting judge API on :8787"
JUDGE_API_PORT=8787 pnpm -s --filter @deadpool/judge serve & pids+=($!)

echo "• starting web on :3100"
cat > web/.env.local <<EOF
NEXT_PUBLIC_CHAIN_ID=31337
NEXT_PUBLIC_MONAD_RPC_URL=$RPC
NEXT_PUBLIC_DEAD_POOL_ADDRESS=$ADDR
NEXT_PUBLIC_JUDGE_API_URL=http://127.0.0.1:8787
NEXT_PUBLIC_DEMO_MODE=1
EOF
pnpm -s --filter @deadpool/web dev & pids+=($!)

cat <<EOF

  Dead Pool demo is up
  ─────────────────────────────────────────────
  Landing     http://127.0.0.1:3100
  Demo pool   http://127.0.0.1:3100/pool/$POOL   (judging opens in ${END}s)
  Judge API   http://127.0.0.1:8787/health
  Contract    $ADDR on anvil (chain 31337)

  Wallet: add network RPC $RPC, chain id 31337, and import an anvil dev key
  (e.g. account #4, a team: 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a).
  Skip the wait locally:  pnpm --filter @deadpool/scripts run warp ${END}
  Ctrl+C stops everything.
EOF
wait
