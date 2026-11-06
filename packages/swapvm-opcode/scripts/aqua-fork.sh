#!/usr/bin/env bash
# Anvil mainnet fork -> deploy CompetitiveFeeExtruction -> ship to the live Aqua registry
# -> swap 1 WETH for USDC through the deployed AquaSwapVMRouter. Prints every tx hash.
#
#   npm run aqua:fork                      # uses a public mainnet RPC
#   FORK_RPC=<url> npm run aqua:fork       # your own RPC (Base works too: same Aqua addresses,
#                                          #   but WETH/USDC in the script are mainnet addresses)
#   KEEP=1 npm run aqua:fork               # leave Anvil running on :8545 to poke at with cast
set -euo pipefail
cd "$(dirname "$0")/.."

FORK_RPC="${FORK_RPC:-https://ethereum-rpc.publicnode.com}"
RPC=http://127.0.0.1:8545
USDC=0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
WETH=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
# Anvil's public dev keys (accounts 0 and 1). Fork-only; never use them on a real chain.
export MAKER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
export TAKER_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
MAKER=$(cast wallet address "$MAKER_KEY")
TAKER=$(cast wallet address "$TAKER_KEY")

echo "Forking $FORK_RPC ..."
anvil --fork-url "$FORK_RPC" --port 8545 --silent &
ANVIL=$!
[[ "${KEEP:-}" == 1 ]] || trap 'kill $ANVIL 2>/dev/null' EXIT
for _ in $(seq 1 30); do cast chain-id --rpc-url $RPC >/dev/null 2>&1 && break; sleep 1; done

# The maker needs USDC inventory; WETH it wraps itself inside the script.
# USDC (FiatTokenV2_2) keeps balances in mapping slot 9; anvil_dealERC20 can't find it behind the proxy.
cast rpc anvil_setStorageAt "$USDC" "$(cast index address "$MAKER" 9)" \
  "$(cast to-uint256 300000000000)" --rpc-url $RPC >/dev/null
[[ "$(cast call $USDC 'balanceOf(address)(uint256)' "$MAKER" --rpc-url $RPC | cut -d' ' -f1)" == 300000000000 ]] \
  || { echo "USDC funding failed (storage layout changed?)"; exit 1; }

bal() { cast call "$1" "balanceOf(address)(uint256)" "$2" --rpc-url $RPC | cut -d' ' -f1; }
T_USDC0=$(bal $USDC "$TAKER")

forge script script/AquaForkDemo.s.sol:AquaForkDemo --rpc-url $RPC --broadcast --slow 2>&1 \
  | sed -n '/== Logs ==/,/^$/p'

echo "== Transactions (chain 1 fork) =="
python3 - broadcast/AquaForkDemo.s.sol/1/run-latest.json <<'PY'
import json, sys
for r in json.load(open(sys.argv[1]))["transactions"]:
    what = r.get("function") or ("deploy " + (r.get("contractName") or ""))
    print(f'{r["hash"]}  {what}')
PY

echo
echo "== Taker USDC balance =="
echo "before: $T_USDC0"
echo "after:  $(bal $USDC "$TAKER")"
SWAP_TX=$(python3 -c 'import json,sys;print([t["hash"] for t in json.load(open(sys.argv[1]))["transactions"] if (t.get("function") or "").startswith("swap")][-1])' broadcast/AquaForkDemo.s.sol/1/run-latest.json)
echo
echo "== ERC-20 Transfer events in the swap tx $SWAP_TX =="
cast receipt "$SWAP_TX" --rpc-url $RPC --json | python3 -c '
import json, sys
TRANSFER = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef"
names = {"0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2": "WETH", "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48": "USDC"}
for l in json.load(sys.stdin)["logs"]:
    if l["topics"][0] == TRANSFER:
        frm, to = "0x" + l["topics"][1][-40:], "0x" + l["topics"][2][-40:]
        print(names.get(l["address"].lower(), l["address"]), frm, "->", to, int(l["data"], 16))
'

[[ "${KEEP:-}" == 1 ]] && echo && echo "Anvil still running on :8545 (pid $ANVIL)."
exit 0
