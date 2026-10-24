#!/usr/bin/env bash
# End-to-end proof on a local anvil chain:
# build → deploy → seed → judging opens → AI judge → challenge window → finalize → claims.
# Usage: pnpm e2e:local            (starts and stops its own anvil on :8545)
#        KEEP_ANVIL=1 pnpm e2e:local   (leave anvil running, e.g. for the web app)
set -euo pipefail
cd "$(dirname "$0")/.."

export MONAD_RPC_URL="http://127.0.0.1:8545"
export JUDGE_ALLOW_FIXTURES=1
export JUDGE_ENGINE="${JUDGE_ENGINE:-recorded}"
# Anvil dev account #1 is the judge (public, local-only key).
# Local runs always use anvil dev keys, even if .env holds testnet keys.
export DEPLOYER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" # anvil dev account #0
export JUDGE_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
unset DEAD_POOL_ADDRESS

if curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' "$MONAD_RPC_URL" >/dev/null 2>&1; then
  echo "• Using the anvil already running on :8545"
  STARTED=0
else
  echo "• Starting anvil"
  anvil --silent --block-time 1 --accounts 20 &
  ANVIL_PID=$!
  STARTED=1
  trap '[ "$STARTED" = 1 ] && [ "${KEEP_ANVIL:-0}" != 1 ] && kill $ANVIL_PID 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    curl -s -X POST -H 'content-type: application/json' --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId"}' "$MONAD_RPC_URL" >/dev/null 2>&1 && break
    sleep 0.5
  done
fi

echo "• Building contract and syncing ABI"
(cd contracts && forge build --silent)
pnpm -s abi

echo "• Deploying"
pnpm -s --filter @deadpool/scripts run deploy

echo "• Seeding pools"
pnpm -s --filter @deadpool/scripts run seed --join 30 --end 60 --window 20

POOL=$(node -e "console.log(require('./.deployments/31337.json').demoPoolId)")

echo "• Fast-forwarding to judging time"
pnpm -s --filter @deadpool/scripts run warp 61

echo "• Running the AI judge on pool #$POOL"
pnpm -s judge "$POOL"

echo "• Fast-forwarding past the challenge window"
pnpm -s --filter @deadpool/scripts run warp 21

echo "• Finalizing and claiming"
pnpm -s --filter @deadpool/scripts run settle "$POOL"

echo "✓ End-to-end proof finished"
