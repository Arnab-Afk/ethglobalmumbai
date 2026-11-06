#!/usr/bin/env bash
# Anvil fork -> price against live Uniswap (VenueReader) -> ship a CompetitiveFeeExtruction strategy to the
# live Aqua registry -> swap through the deployed AquaSwapVMRouter. Prints every tx hash and the swap's
# ERC-20 Transfer events. Nothing about the market is fixed: see script/AquaForkConfig.sol for the env.
#
#   npm run aqua:fork                                         # mainnet fork, WETH -> USDC
#   FORK_RPC=https://base-rpc.publicnode.com npm run aqua:fork  # Base fork (same Aqua router)
#   AQUA_AMOUNT_IN=5000000000000000000 npm run aqua:fork      # any size / pair / depth via env
#   KEEP=1 npm run aqua:fork                                  # leave Anvil running on :8545
set -euo pipefail
cd "$(dirname "$0")/.."

FORK_RPC="${FORK_RPC:-https://ethereum-rpc.publicnode.com}"
RPC=http://127.0.0.1:8545
SCRIPT=script/AquaForkDemo.s.sol:AquaForkDemo
# Anvil's public dev keys (accounts 0 and 1). Fork-only; never use them on a real chain.
export MAKER_KEY="${MAKER_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
export TAKER_KEY="${TAKER_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}"

echo "Forking $FORK_RPC ..."
anvil --fork-url "$FORK_RPC" --port 8545 --silent &
ANVIL=$!
[[ "${KEEP:-}" == 1 ]] || trap 'kill $ANVIL 2>/dev/null' EXIT
for _ in $(seq 1 30); do cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 1; done
CHAIN_ID=$(cast chain-id --rpc-url $RPC)

bal() { cast call "$1" "balanceOf(address)(uint256)" "$2" --rpc-url $RPC | cut -d' ' -f1; }
sym() { cast call "$1" "symbol()(string)" --rpc-url $RPC | tr -d '"'; }

# Give `holder` exactly `amount` of `token`. Tries anvil_dealERC20, then finds the balance mapping slot
# by probing (writes a candidate slot, checks balanceOf, restores it if wrong). Works behind proxies.
fund() {
  local token=$1 holder=$2 amount=$3 key old
  cast rpc anvil_dealERC20 "$token" "$holder" "$(cast to-hex "$amount")" --rpc-url $RPC >/dev/null 2>&1 || true
  [[ "$(bal "$token" "$holder")" == "$amount" ]] && return 0
  for slot in $(seq 0 100); do
    key=$(cast index address "$holder" "$slot")
    old=$(cast storage "$token" "$key" --rpc-url $RPC)
    cast rpc anvil_setStorageAt "$token" "$key" "$(cast to-uint256 "$amount")" --rpc-url $RPC >/dev/null
    [[ "$(bal "$token" "$holder")" == "$amount" ]] && return 0
    cast rpc anvil_setStorageAt "$token" "$key" "$old" --rpc-url $RPC >/dev/null
  done
  echo "Could not find the balance slot of $token"; exit 1
}

# 1. Ask the script what to fund (sizes come from the live mid price), then fund it.
while read -r _ token holder amount; do
  fund "$token" "$holder" "$amount"
  echo "funded $(sym "$token") $holder $amount"
done < <(forge script $SCRIPT --sig "plan()" --rpc-url $RPC 2>&1 | grep -oE "FUND 0x[0-9a-fA-F]{40} 0x[0-9a-fA-F]{40} [0-9]+")

# 2. Deploy, ship, quote, swap.
forge script $SCRIPT --rpc-url $RPC --broadcast --slow 2>&1 | sed -n '/== Logs ==/,/^$/p'

RUN=broadcast/AquaForkDemo.s.sol/$CHAIN_ID/run-latest.json
echo "== Transactions (chain $CHAIN_ID fork) =="
python3 - "$RUN" <<'PY'
import json, sys
for r in json.load(open(sys.argv[1]))["transactions"]:
    what = r.get("function") or ("deploy " + (r.get("contractName") or ""))
    print(f'{r["hash"]}  {what}')
PY

SWAP_TX=$(python3 -c 'import json,sys;print([t["hash"] for t in json.load(open(sys.argv[1]))["transactions"] if (t.get("function") or "").startswith("swap")][-1])' "$RUN")
echo
echo "== ERC-20 Transfer events in the swap tx $SWAP_TX =="
cast receipt "$SWAP_TX" --rpc-url $RPC --json | python3 -c '
import json, sys
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
for l in json.load(sys.stdin)["logs"]:
    if l["topics"][0] == TRANSFER:
        frm, to = "0x" + l["topics"][1][-40:], "0x" + l["topics"][2][-40:]
        print(l["address"], frm, "->", to, int(l["data"], 16))
' | while read -r token frm _ to amount; do echo "$(sym "$token") $frm -> $to $amount"; done

[[ "${KEEP:-}" == 1 ]] && echo && echo "Anvil still running on :8545 (pid $ANVIL)."
exit 0
