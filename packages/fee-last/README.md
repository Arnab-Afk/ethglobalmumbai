# FeeLast

A Uniswap v4 pool on Base (chain 8453) that sets its fee after it has seen the best rival quote.

The pool fee is zero. A swap runs on the raw curve, then the hook takes an output fee. That fee is the largest one that still pays the trader more than the best Uniswap v3 pool for the same trade. LPs receive the fee on the next timestamp. A protocol share is split off immediately. A swap without a fresh controller signature reverts.

This is an original implementation of the public last-mover auction. It is not a copy of Fynd's contracts or router.

## Live on Base

The hook, router, and an AXIS/USDC pool are on Base mainnet. Addresses and transaction hashes are in [deployments/base.json](../../deployments/base.json).

| Piece | Address |
| --- | --- |
| Hook | `0x8efBdAed7Da3dB6250d4cD66b47aF20596C9aAC4` |
| Router | `0xE1275AbA5f2215B03CC389B6E594AC8b078Aef07` |
| Position (withdraw) | `0x93F95e100dcd0BeaB52457EF11A5C8A14F044dE4` |
| Pool | AXIS/USDC, fee 0, ticks -296999 to -296939 |

The depositing wallet is `0x2B0aEf51883f8cFD8bd618Ab959B332a093CEeB2`. That wallet is the only one that can withdraw the position.

## Evidence: Fynd BNCB/USDT

Fynd's first pool is BNCB/USDT on BNB Chain, listed at [swap.fynd.xyz/pools](https://swap.fynd.xyz/pools). The mechanics are documented at [docs.fynd.xyz/get-started/fynd-amm](https://docs.fynd.xyz/get-started/fynd-amm).

Read from Ekubo's API on 6 Nov 2026 (`/pair/56/0x4902c5eb…/0x55d39832…/pools`):

| Field | Value |
| --- | --- |
| Pool id | `0x942e8f465b349913a0a115c8f346028f549129748184d8eac4fafc7b88c863a9` |
| Core | `0x00000000000014aA86C5d3c41765bb24e11bd701` |
| Extension | `0x550cfe1292d0d9c0d28f232b3f42edb4439b1d09` (`SignedExclusiveSwap`) |
| Configured pool fee | `0` |
| Tick spacing | `1024` |
| 24h volume | 101.94 BNCB and 1,710.16 USDT |
| 24h fees donated to LPs | 0.678 BNCB and 0.102 USDT |

The pool fee field is zero, and the pool still collected fees. The fee lives in the signed swap payload, not in the pool config. Six swaps from 6 Nov 2026, decoded from router calldata (`deadline || feeQ32 || nonce || locker`):

| Time (UTC) | Signed fee | Transaction |
| --- | --- | --- |
| 15:04 | 20.1 bps (`8647504` in Q32) | `0xe369d14dd363bd8f9d10ab5c1fe7acbe446e18892af217c38db677aec14dfc1c` |
| 11:58 | 8.1 bps | `0x597f538128cc6f5ba858f29592f5875faad4c5d6dd4b0585298574807c1c9a63` |
| 11:50 | 23.8 bps | `0x8d51bef1a597d251507e622d44216bc8d4a43a5d1ff6148d15a0afe83cc96f24` |
| 09:23 | 14.6 bps | `0xb365bc32ec5d69d2f9bd0f7b33cac13290e52beec6d3ebb27adb0c9be656926e` |
| 09:17 | 39.0 bps | `0xffc89db0ce3481e9a3d2b0d1bd91c89529e81157ad73ad1d4c5b64937238fb7b` |
| 09:02 | 91.4 bps | `0x3d8a7dcb64e18e8b562d97dd82bb4983256b57ff3ad186b74083e135d477bb7f` |

Same pool, six different fees. Each one is the fee that still won that trade.

## How a bid is chosen

1. Quote every configured rival with the same input. On Base the default rivals are Uniswap v3 WETH/USDC at 0.01%, 0.05%, 0.30% and 1%.
2. Quote this pool at a zero fee. That output is `gross`.
3. If `gross` is not above the best rival, skip the trade. A fee cannot win a trade the curve itself loses.
4. Otherwise set `minOut` to the rival output plus an edge (default 1 bps, and always at least 1 unit).
5. Charge `feePips = floor((gross - minOut) * 1_000_000 / gross)`, then bump one pip when rounding still leaves the trader above `minOut`.
6. The controller signs that fee, the input size, `minOut`, a deadline of at most 120 seconds, and a one-time nonce.
7. Submit the swap through a private relay. The signature is the bid. Publishing it on the public mempool lets someone else take the rival liquidity first.

The hook checks the signature, the deadline, the nonce, and that the trader actually receives at least `minOut`. One pip more than the signed fee fails that check.

## What "win the trades" depends on

The bid is the minimum improvement over every venue this quoter can see, so a router that picks the best output picks this pool whenever the zero-fee curve can win. That is the auction. It does not, by itself, capture 99% of Base volume. Trades are lost when the curve is worse even at zero fee, when a router never asks for a quote, or when a venue is missing from `quoter/venues.json`. Add those venues there. Deep liquidity next to the market price is what makes `gross` win.

## Layout

- `src/FeeLastHook.sol` — exclusive signed-fee hook
- `src/FeeLastRouter.sol` — exact-input router bound to the swapper in the signature
- `src/FeeLastPosition.sol` — deposit and withdraw for the wallet that added liquidity
- `src/FeeMath.sol` — the pip fee
- `quoter/cli.mjs` — reads Base rivals and prints the winning fee
- `script/Deploy.s.sol` — deploys against the Base PoolManager `0x498581fF718922c3f8e6A244956aF099B2652b2b`
- `script/OpenAxisPool.s.sol` — buys AXIS and opens the narrow AXIS/USDC pool

## Tests

```
forge test
node --test quoter/test/fee.test.mjs
```

## Deploy and rank on a Base fork

`test/ForkRank.t.sol` deploys the hook, the router, and a WETH/USDC pool onto a fork of Base, against the live PoolManager. The pool price is the Uniswap v3 0.01% price. Its in-range liquidity is copied from the Uniswap v3 0.05% pool, across a band of 10 tick spacings on either side of the active tick. It then requests eight swaps, four WETH to USDC and four USDC to WETH, and ranks the signed quote against the four Uniswap v3 fee tiers.

A swap is quoted only when the zero-fee curve can clear the best rival by the 1 bps edge. Quoted swaps are rank 1. The report is written to `benchmark/rank.txt`.

```
$env:BASE_RPC_URL = "https://mainnet.base.org"
forge test --match-contract ForkRankTest -vv
```

`forge test` skips this file when `BASE_RPC_URL` is unset. This is a fork deployment used to measure ranking. It is not a mainnet broadcast.

`forge test` checks the fee math and a full pool: the charged fee is the largest pip that still beats a 0.30% rival, a higher fee reverts, an unsigned swap reverts, and LP fees are donated on the next timestamp.

## Quote Base

```
node quoter/cli.mjs --amount 0.01 --token-in WETH --token-out USDC --gross <raw zero-fee output>
node quoter/max-bid.mjs --amount 0.3
```

### Future-price bid from live Base flow (off-chain)

Same-direction Uniswap flow → reprice the FeeLast bid against the post-flow rival.

**One-shot:**

```
node quoter/mempool-preview.mjs --amount 0.3 --source preconf
node quoter/mempool-preview.mjs --amount 0.3 --inject 2
```

**Realtime in-memory context** (local CLI):

```
node quoter/mempool-watch.mjs --amount 0.3 --window-ms 30000 --poll-ms 1500
```

**24/7 bot** (HTTP + rolling context, observe only — no broadcast):

```
cd bot && npm start
# GET /health  /bid  /snapshot
```

Deploy: see [bot/README.md](bot/README.md) (Docker / Railway / Fly / VPS). Dockerfile context is `packages/fee-last`.

Denim note: Flashblocks retired Nov 5 2026; preconf `pending` is the latest ~200 ms block (real trades), not a classic mempool peek.

Does not sign or broadcast. Wire fees into `sign.mjs` only when you explicitly want an on-chain bid.

Signing and private submission use `cast` plus `PRIVATE_RPC_URL`. The submitter refuses the public mempool. Re-quote when the block changes before you sign. The deadline window is 120 seconds.
