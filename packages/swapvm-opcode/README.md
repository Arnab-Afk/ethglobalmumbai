# packages/swapvm-opcode

1inch Aqua / SwapVM surface for the competitive fee (1inch "Build an Aqua App" track).

## What it is

`CompetitiveFeeExtruction` is a non-upgradeable target for the SwapVM **Extruction** instruction (opcode **32** on the deployed `AquaSwapVMRouter` v1.0.2). A maker program of one instruction, `[32][20][target]`, prices every swap like this:

1. Read `IQuoteOracle.getBestOut(tokenIn, tokenOut, amountIn)`, the best competing venue for this exact trade.
2. `CompetitiveFee.compute` (fee-core, pips): the largest fee that still beats that venue by `undercutBps`. Stale or missing quote → `fallbackFee`.
3. Convert to SwapVM fee units (`×1000`) and apply `_flatFeeAmountInXD` exact-in math, then constant product on the Aqua balances.
4. **If we lose, we lose.** When a fresh competitor quote pays more than we can, quote and swap revert with `CannotBeatVenue`, so the trade goes elsewhere. With a stale or missing quote, or an oracle that reverts, we fill at `fallbackFee` instead, because a broken oracle must not block swaps.

Quote and swap call the same `view` function, so the router's `quote` equals what `swap` pays.

## Proof: a swap through the official Aqua contracts

Runs against the **deployed** Aqua registry (`0x1111113C…a90a`) and `AquaSwapVMRouter` (`0x11111133…C0De`) on a local mainnet fork. Nothing is redeployed.

```bash
cd packages/swapvm-opcode
npm run aqua:fork     # Anvil fork → deploy → ship strategy → swap 1 WETH → USDC; prints tx hashes + Transfer events
npm run test:fork     # same flow as Foundry assertions (6 tests)
forge test            # offline unit tests; the fork suite skips without FORK_RPC
```

Needs Foundry and Python 3. `FORK_RPC` defaults to a public mainnet RPC.

On Windows: `npm run aqua:fork:win` (`scripts/run-aqua-fork.ps1`) forks, deploys and ships through the TS SDK, but stops before the swap. `npm run test:fork` runs the full ship + swap on any OS, and so does `aqua:fork` under Git Bash or WSL.

What `aqua:fork` prints (Nov 7 run, competitor quote 2,965 USDC for 1 WETH):

```
competitor out (USDC 6d) 2965000000
neat out       (USDC 6d) 2965297435
fee (pips, 1e6 = 100%)   1700            # 17 bp, set by the market, not a fixed tier
...  ship(address,bytes,address[],uint256[])
...  swap((address,uint256,bytes),address,address,uint256,bytes)
== ERC-20 Transfer events in the swap tx ==
USDC maker  -> taker   2965297435
WETH taker  -> router  1000000000000000000
WETH router -> maker   1000000000000000000
```

`test:fork` also ships flat 30 bp and flat 5 bp XYC programs (opcodes 21 + 17) on the **same capital**, since Aqua balances are virtual:

| Strategy (1 WETH in, 100 WETH / 300k USDC) | USDC out | Result |
|---|---|---|
| zero fee | 2970.30 | — |
| flat 30 bp | 2961.47 | loses to the venue (2965.00) |
| flat 5 bp | 2968.83 | wins, gives away 3.83 USDC |
| **competitive** | **2965.30** | wins by 1 bp, LP keeps 3.53 USDC more than flat 5 bp |

The competitor price comes from `MockQuoteOracle`, so the demo can move it. The same contract reads `VenueReader` (live Uniswap v3) on Sepolia: `CompetitiveFeeExtructionVenueReader` in `deployments/sepolia.json`.

## Files

| File | Role |
|---|---|
| `src/CompetitiveFeeExtruction.sol` | The pricing target |
| `src/ProgramCodec.sol` | Program bytes: competitive (32), flat fee + XYC (21, 17) |
| `src/swapvm/Aqua.sol` | Router / Aqua interfaces, `Order` and taker-traits encoders |
| `test/AquaFork.t.sol` | Fork test against the deployed router |
| `script/AquaForkDemo.s.sol`, `scripts/aqua-fork.sh` | Broadcast demo |
| `scripts/aqua-ship-quote.ts` | Same order through `@1inch/swap-vm-sdk` (ship + quote only) |

## Version notes

- Built against **swap-vm v1.0.2**, the deployed router. `main` of `1inch/swap-vm` renumbers opcodes (Extruction 4, XYCSwap 50), so these program bytes only fit a v1.0.2 router.
- Sepolia has the Aqua registry but **no `AquaSwapVMRouter`**, so settlement runs on a mainnet fork. Base has both at the same addresses.
- Exact-out swaps revert (`ExactOutNotSupported`). The MVP is exact-in only.
- The demo pool is shallow (100 WETH), so each 1 WETH swap moves our price about 1.8% while the mock venue stays put. A second identical swap loses and reverts (`test_Fork_secondSwapLosesToVenue_reverts`). On stage, swap once or move the venue with `setCurve`.
- The Sepolia `CompetitiveFeeExtruction` instances in `deployments/sepolia.json` were deployed before the `CannotBeatVenue` check and the oracle `try`/`catch`, and they are immutable. A redeploy picks both up.

## Not done: Path A

A native `CompetitiveFee` opcode in a forked `AquaOpcodes` that wraps the next curve instruction, like `_flatFeeAmountInXD` does. It would make the fee composable with any curve. Path B owns the whole price, including its own constant-product math. The prize allows a redeployed, modified SwapVM, but Path A is not needed to qualify.
