# packages/cre-workflow (Chainlink track)

Off-chain **price aggregator** that builds a size-aware competing-venue curve and writes it to `QuoteOracle`.

```
Chainlink ETH/USD ─┐
venues (mock / Uni v2 / Uni v3) → drop quotes far above Chainlink fair → max per size bucket
                   → cut untrusted buckets → abi.encode(CurveUpdate[]) → QuoteOracle
```

Inspired by the *idea* behind PropellerHeads Fynd (quote against live market liquidity). **No Fynd code is used** — this package is written fresh against our frozen report ABI (`docs/03`, `docs/06`).

## Layout

| Path | Role |
|---|---|
| `src/` | Pure curve builder + venue quoters + report encoding |
| `src/sanity.ts`, `src/finalizePair.ts` | Chainlink fair-price check; one function shared by the Node and CRE paths |
| `src/venues/` | `mock-xyk` (fixed reserves), `mock-anchored` (priced from the Chainlink feed), `univ2`, `univ3` |
| `scripts/simulate-local.ts` | Node path: quote venues via RPC/mocks, print report, optional `applyReport` |
| `workflow/` | CRE TS entry (`@chainlink/cre-sdk`) for `cre workflow simulate` |
| `config.demo.json` | Node demo: Sepolia pair, anchored mocks, real Sepolia Uniswap v3, our own pool excluded |
| `workflow/config.json` | CRE config: same pair and sanity check, mock venues only |
| `logs/` | Trimmed output of both simulators (evidence for the submission) |

## Run (no CRE CLI required)

```sh
npm install
npm test
npm run simulate:local
# Owner push to Sepolia QuoteOracle (escape hatch while CRE deploy pending):
# PRIVATE_KEY=0x… npm run simulate:local -- --write
```

Sepolia `QuoteOracle`: `0xe39D6dE0689581C2e681379C206AA3492Dfd73C0` (see `deployments/sepolia.json`).

## CRE simulate (Saish / booth)

1. Install CRE CLI + bun; `cre login` (see `docs/team/saish-cre.md`).
2. `npm install` in this directory (the workflow compiles against `node_modules` here).
3. Run from **this directory** (`project.yaml` lives here; target `sepolia-settings`):

```sh
cre workflow simulate ./workflow -T sepolia-settings                # dry run, no transaction
cre workflow simulate ./workflow -T sepolia-settings --broadcast    # real Sepolia tx via the mock forwarder
```

`--broadcast` needs `CRE_ETH_PRIVATE_KEY` (a funded Sepolia key, 64 hex chars, no `0x`) in `./.env`, which is gitignored.

### Keep it running (`cre:watch`)

The workflow is not deployed to the Chainlink DON, so it only runs when someone calls `cre workflow simulate`. The Chainlink feed itself is always live; our workflow just reads it on each run. `cre:watch` re-runs the simulation on a timer, standing in for the deployed workflow's cron:

```sh
npm run cre:watch                         # dry run every 60 s, no transactions
INTERVAL=30 npm run cre:watch             # every 30 s
BROADCAST=1 npm run cre:watch             # also write each curve to QuoteOracle (Sepolia tx per run)
MAX_RUNS=3 INTERVAL=5 npm run cre:watch   # stop after 3 runs
```

The terminal shows the workflow's log lines; full output goes to `logs/live/<start time>.log` (gitignored). `BROADCAST=1` refuses to start without a valid `CRE_ETH_PRIVATE_KEY`. Stop with Ctrl-C.

The CRE handler reads the Chainlink feed through the EVM capability and quotes the mock venues (`mock-xyk`, `mock-anchored`). Uniswap v2/v3 venues are only read by the Node simulator for now; the handler logs them as "not read in CRE yet". Sample output: [`logs/cre-simulate-sanity.txt`](logs/cre-simulate-sanity.txt).

## Chainlink sanity check

The curve takes the **highest** quote per size, so one venue with a wrong high price wins every bucket and pins our fee at the floor. Sepolia shows this for real: its Uniswap v3 WETH/USDC pool quotes ~25,800 USDC per ETH while Chainlink ETH/USD reads ~2,219.

With a `sanity` block on a pair, both paths:

1. read the Chainlink feed (`latestRoundData`); if it is older than `maxFeedAgeSec`, publish nothing for the pair,
2. compute fair output per size (`amountIn × price`, adjusted for decimals),
3. reject any quote more than `maxAboveBps` above fair (shown as `REJECTED +x% vs fair`),
4. stop the curve at the first size whose best accepted quote is missing, more than `maxBelowBps` below fair, or lower than the previous size (`QuoteOracle` returns 0 above the last point, so those sizes use the pool's fallback fee),
5. skip `writeReport` entirely when no pair is trustworthy.

```json
"sanity": {
  "feed": "0x694AA1769357215DE4FAC081bf1f309aDC325306",
  "maxAboveBps": 200,
  "maxBelowBps": 2000,
  "maxFeedAgeSec": 4200
}
```

`sanity` needs `decimalsIn` and `decimalsOut` on the pair. Low quotes are not filtered per venue: the max rule already ignores them while one honest venue exists.

### Anchored mock venues

`mock-anchored` venues are demo competitors rebuilt on every run from the same feed: an x·y=k pool with `reserveIn` of tokenIn against its fair value in tokenOut, quoted with `feeBps`. They follow the real ETH price and always pass the check, so the demo shows realistic numbers while the bad Uniswap quote is rejected ([`logs/node-simulate-sanity.txt`](logs/node-simulate-sanity.txt)):

```
Chainlink feed 0x694A…5306 price=2219.7104 age=21m
  in 1 → mock-sushi-like=2208.6472 mock-univ3-like=2217.4924 univ3-sepolia=25738.7989(REJECTED +1059.55% vs fair) | best mock-univ3-like 2217.4924
```

## Self-undercut guard

Any venue with `"exclude": true` is skipped (our Aqua strategy / `DevnetCompetitivePool`). Do **not** feed 1inch aggregator HTTP quotes that include our liquidity.
