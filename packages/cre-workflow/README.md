# packages/cre-workflow (Chainlink track)

Off-chain **price aggregator** that builds a size-aware competing-venue curve and writes it to `QuoteOracle`.

```
venues (mock / Uni v2 / Uni v3) → max per size bucket → abi.encode(CurveUpdate[]) → QuoteOracle
```

Inspired by the *idea* behind PropellerHeads Fynd (quote against live market liquidity). **No Fynd code is used** — this package is written fresh against our frozen report ABI (`docs/03`, `docs/06`).

## Layout

| Path | Role |
|---|---|
| `src/` | Pure curve builder + venue quoters + report encoding |
| `scripts/simulate-local.ts` | Node path: quote venues via RPC/mocks, print report, optional `applyReport` |
| `workflow/` | CRE TS entry (`@chainlink/cre-sdk`) for `cre workflow simulate` |
| `config.demo.json` | Sepolia demo pair + mock venues (excludes our own pool via `exclude: true`) |

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

The WASM handler currently aggregates **mock-xyk** venues only (deterministic across DON nodes). Live Uni reads are in the Node simulator until EVM-read wiring lands in the CRE handler.

## Self-undercut guard

Any venue with `"exclude": true` is skipped (our Aqua strategy / `DevnetCompetitivePool`). Do **not** feed 1inch aggregator HTTP quotes that include our liquidity.
