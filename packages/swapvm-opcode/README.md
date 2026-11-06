# packages/swapvm-opcode

1inch Aqua / SwapVM surface for the competitive fee (1inch "Build an Aqua App" track).

## What it is

`CompetitiveFeeExtruction` is a non-upgradeable target for the SwapVM **Extruction** instruction (opcode **32** on the deployed `AquaSwapVMRouter` v1.0.2). A maker program of one instruction, `[32][20][target]`, prices every swap like this:

1. Read `IQuoteOracle.getBestOut(tokenIn, tokenOut, amountIn)`, the best competing venue for this exact trade.
2. `CompetitiveFee.compute` (fee-core, pips): the largest fee that still beats that venue by `undercutBps`. Stale or missing quote → `fallbackFee`.
3. Convert to SwapVM fee units (`×1000`) and apply `_flatFeeAmountInXD` exact-in math, then constant product on the Aqua balances.
4. **If we lose, we lose.** When a fresh competitor quote pays more than we can, quote and swap revert with `CannotBeatVenue`, so the trade goes elsewhere. With a stale or missing quote, or an oracle that reverts, we fill at `fallbackFee` instead, because a broken oracle must not block swaps.

Quote and swap call the same `view` function, so the router's `quote` equals what `swap` pays.

## Proof: a swap through the official Aqua contracts, against the live market

Runs on a local fork against the **deployed** `AquaSwapVMRouter`. The Aqua registry address is read from the router (`AQUA()`), so nothing of 1inch's is redeployed or configured. Nothing about the market is fixed either:

- **The competitor** is `VenueReader` over every Uniswap v3 pool and the v2 pair for the pair, found through the Uniswap factories at fork time.
- **Our pool's price** is the live mid from the deepest v3 pool (`slot0`), plus the maker's edge.
- **Trade size** is one whole token (decimals read on-chain); depth and edge come from the env.

```bash
cd packages/swapvm-opcode
npm run aqua:fork     # fork → deploy → ship → swap; prints the live venue quote, our output, tx hashes, Transfer events
npm run test:fork     # 6 fork tests (invariants against the live venue)
forge test            # offline unit tests; the fork suite skips without FORK_RPC

FORK_RPC=https://base-rpc.publicnode.com npm run aqua:fork   # same on Base
```

Needs Foundry and Python 3. `FORK_RPC` defaults to a public mainnet RPC. The runner funds the fork accounts by finding each token's balance slot, so any ERC-20 pair works.

On Windows: `npm run aqua:fork:win` (`scripts/run-aqua-fork.ps1`) forks, deploys and ships through the TS SDK, but stops before the swap. `npm run test:fork` runs the full ship + swap on any OS, and so does `aqua:fork` under Git Bash or WSL.

### Config (`script/AquaForkConfig.sol`, all optional)

| Env | Default | Meaning |
|---|---|---|
| `FORK_RPC` | public mainnet RPC | Chain to fork (mainnet and Base have defaults) |
| `AQUA_TOKEN_IN`, `AQUA_TOKEN_OUT` | WETH, USDC of the forked chain | Pair to trade |
| `AQUA_UNI_V3_FACTORY`, `AQUA_UNI_V2_FACTORY` | Uniswap factories of the forked chain | Where competitor pools are discovered |
| `AQUA_AMOUNT_IN` | 1 whole `tokenIn` | Trade size, raw units |
| `AQUA_DEPTH_MULTIPLE` | 10000 | Our pool holds this × trade size of `tokenIn` |
| `AQUA_MAKER_EDGE_BPS` | 10 | Maker prices `tokenIn` this far above the live mid |
| `FEE_FLOOR`, `FEE_CAP`, `FALLBACK_FEE`, `UNDERCUT_BPS`, `MAX_QUOTE_AGE` | 500, 10000, 3000, 1, 120 | Fee config, same names as `script/Deploy.s.sol` |
| `AQUA_ROUTER` | the canonical 1inch router | Router under test |

### What the fork tests check, on whatever the market is at fork time

| Test | Invariant |
|---|---|
| `shipQuoteSwap_movesTokensThroughAqua` | Our output beats the live venue; swap == quote; exact ERC-20 and Aqua balance changes on both sides |
| `competitiveVsFlat_sameCapital` | Flat-fallback and flat-floor programs (opcodes 21 + 17) on the same capital: whenever a flat fee also wins, the competitive fee keeps at least as much for the LP |
| `cannotBeatVenue_reverts` | A pool that pays 1 unit less than the live venue even at zero fee reverts, and no tokens move |
| `swapRevertsBelowMinOut` | `minOut` above the quote reverts |
| `swapUntilWeLose_everyFillBeatsVenue` | Keep swapping: every fill beats the live venue, and the first one we can't win reverts |
| `oracleDown_fillsAtFallback` | Venue reader reverts → fill at the fallback fee, same as the flat-fallback strategy |

## Files

| File | Role |
|---|---|
| `src/CompetitiveFeeExtruction.sol` | The pricing target |
| `src/ProgramCodec.sol` | Program bytes: competitive (32), flat fee + XYC (21, 17) |
| `src/swapvm/Aqua.sol` | Router / Aqua interfaces, `Order` and taker-traits encoders |
| `script/AquaForkConfig.sol` | Fork config: chain defaults, env, venue discovery, live mid price, inventory |
| `test/AquaFork.t.sol` | Fork tests against the deployed router and live Uniswap |
| `script/AquaForkDemo.s.sol`, `scripts/aqua-fork.sh` | Broadcast demo |
| `scripts/aqua-ship-quote.ts` | Same order through `@1inch/swap-vm-sdk` (ship + quote only) |

## Version notes

- Built against **swap-vm v1.0.2**, the deployed router. `main` of `1inch/swap-vm` renumbers opcodes (Extruction 4, XYCSwap 50), so these program bytes only fit a v1.0.2 router.
- Sepolia has the Aqua registry but **no `AquaSwapVMRouter`**, so settlement runs on a mainnet fork. Base has both at the same addresses.
- Exact-out swaps revert (`ExactOutNotSupported`). The MVP is exact-in only.
- Each fill moves our pool's price, so after enough swaps we stop beating the venue and further swaps revert (`swapUntilWeLose_everyFillBeatsVenue` reports how many fills that took).
- The Sepolia `CompetitiveFeeExtruction` instances in `deployments/sepolia.json` were deployed before the `CannotBeatVenue` check and the oracle `try`/`catch`, and they are immutable. A redeploy picks both up.

## Not done: Path A

A native `CompetitiveFee` opcode in a forked `AquaOpcodes` that wraps the next curve instruction, like `_flatFeeAmountInXD` does. It would make the fee composable with any curve. Path B owns the whole price, including its own constant-product math. The prize allows a redeployed, modified SwapVM, but Path A is not needed to qualify.
