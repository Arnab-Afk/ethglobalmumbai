# Sepolia swap — Saish builds it, Soham tests it

The quote screen already prices WETH → USDC from mainnet Uniswap v3 and runs that number through `GivenQuotePreview` (`0xbF488B884e7E84a6F87109FC985BbC821EF6393f`) on Sepolia. The confirm button still stops at **No pool to fill on Sepolia**. This document is the work that makes one real Sepolia transaction fill at that same number.

Chainlink CRE is not part of this. Do it after Soham's swap is on Etherscan.

## Why a new pool

`DevnetCompetitivePool` on chain 1337 (`0x9960927e3ecce8d5124db1bfad68121cdec20aa0`) already swaps, on the self-hosted devnet only.

Sepolia's real WETH (`0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`) and USDC (`0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238`) cannot be minted, and the deployer does not hold a pool's worth of either. Sepolia Uniswap v3 quotes about $26,000 per ETH, so pointing the pool at `VenueReader` would fill at the wrong price.

Deploy fresh demo tokens. Keep the symbols `WETH` and `USDC` in the UI so `frontend/lib/mainnet.ts` still reads mainnet. Only the Sepolia addresses change.

One pool has one book. A book pinned to beat selling WETH cannot also beat selling USDC. The first swap is **WETH → USDC, amount 0.1**. The reverse reverts with `CannotBeatVenue`. That is expected.

## Do not

- Print `PRIVATE_KEY`, paste it into chat, or commit `.env`.
- Redeploy the chain 1337 pool, or run `packages/private-quoting` `npm run deploy` against Sepolia. That script writes the EF devnet `deployment.json`.
- Use the real Sepolia WETH or USDC as the pool's tokens.
- Overwrite the existing `MockQuoteOracle` (`0x6F036c93B907099c0623b7312ED2AaFebB39A539`). The dashboard replay still uses its curve. Deploy a new oracle.
- Add v4 hook liquidity before Soham's swap transaction is confirmed.

Deployer: `0x0a8B68Dc2A2338B9d86dd82624af3832d8969C6D`. Key: `PRIVATE_KEY` in the repo `.env`. RPC: `https://ethereum-sepolia-rpc.publicnode.com`. Chain id: `11155111`.

---

## Saish

Work on a branch `saish/sepolia-swap` from latest `main`.

### 1. Check the deployer can pay gas

```powershell
cast balance 0x0a8B68Dc2A2338B9d86dd82624af3832d8969C6D --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

Four creates plus two mints need on the order of 0.02 ETH at the gas prices we have been using (`--legacy --gas-price 100000000`). If the balance is below that, stop and tell Arnab. Do not start the creates.

### 2. Add `packages/private-quoting/src/cli/deploy-sepolia.ts`

Copy the shape of `src/cli/deploy.ts`. Change only what is listed here.

1. Read `PRIVATE_KEY` from the repo-root `.env`. Do not log it. RPC is the Sepolia URL above. Do not call the chain 1337 faucet.
2. Deploy `DemoToken` with constructor `("Demo WETH", "dWETH", 18)`.
3. Deploy `DemoToken` with constructor `("Demo USDC", "dUSDC", 6)`.
4. Deploy `MockQuoteOracle` with constructor `(deployerAddress)`.
5. Deploy `DevnetCompetitivePool` with:
   - token0 = the new dWETH
   - token1 = the new dUSDC
   - oracle = the new MockQuoteOracle
   - config = feeFloor `500`, feeCap `10000`, fallbackFee `3000`, undercutBps `1`, maxQuoteAge `3600`
6. Gas for every create and every mint: `8000000`. A `1000000` gas limit ran out of gas on the devnet mint. Pass `--gas-limit` before `--create` if you use `cast send`.
7. Build the init code the same way `deploy.ts` does: `artifact(name)` plus `encodeDeployData`. Run the script from `packages/private-quoting` so the Solidity artifacts resolve.

### 3. Seed reserves to the same formula the screen uses

`frontend/lib/quote.ts` `inventory()` pins the book once, from a 1 WETH mainnet quote, 0.40% richer:

```
one     = 10n ** 18n
best    = best Uniswap v3 output for exactly 1 WETH → USDC on mainnet
q0      = best * 10040n / 10000n
weth    = 1000n * one
usdc    = q0 * (weth + one) / one
```

Mainnet quoter: `0x61fFE014bA17989E743c5F6cB21bF9697530B21e` on `https://ethereum-rpc.publicnode.com`.

```
quoteExactInputSingle((address,address,uint256,uint24,uint160))
  tokenIn  0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2   // mainnet WETH
  tokenOut 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48   // mainnet USDC
  amountIn 1000000000000000000
  fee      try 100, then 500, then 3000, then 10000
  sqrtPriceLimitX96 = 0
```

Take the highest `amountOut` that does not revert. That is `best`. A missing fee tier reverts; skip it.

Then mint onto the **pool**, not the deployer:

- dWETH: `weth` (1000 × 10^18)
- dUSDC: `usdc` from the formula above

`DemoToken.mint(address,uint256)` is public. That is intentional for this demo.

### 4. Write the competitor curve from mainnet, for this direction only

Call `setCurve` on the **new** oracle:

```
setCurve(address tokenIn, address tokenOut, uint256[] amountsIn, uint256[] bestOuts, uint64 updatedAt)
```

- `tokenIn` = dWETH, `tokenOut` = dUSDC, `updatedAt` = `0` (the contract stores `block.timestamp`).
- `amountsIn` in wei, strictly increasing, at most 16 points: `0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10` WETH.
- `bestOuts[i]` = the best mainnet quoter output for that exact `amountsIn[i]`, same fee tiers as step 3.
- `bestOuts` must be non-decreasing. Mainnet output grows with size, so this holds. If a point comes back `0`, drop that size and every size above it. A `0` in the middle makes `setCurve` revert (`BestOutsNotNonDecreasing` or a later fallback).

Do not call `setCurve` for USDC → WETH in this pass.

### 5. Prove quote == the screen before touching the UI

```powershell
cast call <pool> "quote(address,uint256)(uint256,uint24,uint256,uint256)" <dWETH> 100000000000000000 --rpc-url https://ethereum-sepolia-rpc.publicnode.com
```

The four return values are `amountOut`, `feePips`, `bestOut`, `zeroFeeOut`.

Pass:

- `bestOut` is within a few cents of the mainnet quote for 0.1 WETH (about 22.3 USDC, 6 decimals, so around `22300000`). It must not be near `2600000000` (the dead Sepolia pool).
- `feePips` is between `500` and `10000`, and it is not `3000` unless you have checked that 3000 is the real competitive fee rather than the fallback. Fallback means the curve is missing or older than `maxQuoteAge`.
- `amountOut` > `bestOut`.

If this call fails, do not start the button. Fix the curve or the reserves and call `quote` again.

### 6. Record the addresses

Add the four addresses and their tx hashes to `deployments/sepolia.json` and to `frontend/lib/deployments.ts` under `SEPOLIA.contracts`:

- `DemoWETH`
- `DemoUSDC`
- `SepoliaSwapOracle` (the new MockQuoteOracle)
- `SepoliaSwapPool`

### 7. Point the picker at the demo tokens

In `frontend/lib/tokens.ts`, change only the `WETH` and `USDC` rows:

- `symbol` stays `"WETH"` and `"USDC"`. `mainnet.ts` keys off the symbol. Renaming them to `dWETH` makes the screen fall through to Sepolia `VenueReader` and show the $26k price.
- `address` becomes the new demo token.
- `name` becomes `"Demo WETH"` and `"Demo USDC"` so a tester can see these are not the canonical tokens.
- `decimals` stay `18` and `6`. `USDC` keeps `usd: true`.

Leave USDT, DAI, LINK, UNI, EURC, WBTC on their current Sepolia addresses. They stay quote-only.

### 8. Make the screen use the pool's balances as inventory

`inventory()` in `frontend/lib/quote.ts` pins reserves in the browser. The fill uses the pool's real balances. Those drift apart as soon as mainnet moves after seeding.

For the pair whose symbols are `WETH` and `USDC`, read `balanceOf(pool)` on `DemoWETH` and `DemoUSDC` and use those as `reserveIn` / `reserveOut`. Keep the in-memory pin for every other pair.

The fee call stays `GivenQuotePreview.preview`. Same `CompetitiveFee.compute` the pool runs inside `quote` / `swap`.

### 9. Send the swap from the confirm button

`frontend/components/quote/swap-review.tsx` lines 58–59 set the label to `No pool to fill on Sepolia` and pass no click handler. `frontend/components/wallet/wallet-provider.tsx` can connect and switch chain. It cannot send.

Add a `send` on the wallet context that calls `window.ethereum.request({ method: "eth_sendTransaction", params: [{ from, to, data }] })` and returns the hash. Then wait for the receipt with the existing Sepolia client in `frontend/lib/quote.ts`.

Replace the disabled branch with this sequence, only when `sell.symbol === "WETH"` and `buy.symbol === "USDC"`:

1. Label the button `Approve`.
2. Send `approve(pool, amountIn)` to the demo WETH. Wait until the receipt status is `1`.
3. Label the button `Swap`.
4. Send `swap(tokenIn, amountIn, minOut, deadline)` to `SepoliaSwapPool`.
   - `tokenIn` = demo WETH address
   - `amountIn` = the quoted amount
   - `minOut` = `quote.ourOut * (10000 - slippageBps) / 10000`
   - `deadline` = current unix time plus 600 seconds
5. On receipt status `1`, show the tx hash as a Sepolia Etherscan link. On status `0`, show the revert. `CannotBeatVenue(amountOut, bestOut)` means the curve is stale or the reserves no longer beat mainnet: re-run step 4 and do not tell Soham to retry blindly.

Any other pair keeps the label `No pool to fill on Sepolia`.

ABI:

```
function approve(address spender, uint256 amount) returns (bool)
function swap(address tokenIn, uint256 amountIn, uint256 minOut, uint256 deadline) returns (uint256 amountOut)
```

### 10. Hand off

Commit on `saish/sepolia-swap` with scope `demo:` for the button and token rows, and `private:` for the deploy script. Push the branch and open a PR. Paste into the PR, and into chat, only:

- the four addresses
- the seed tx hashes
- the `cast call quote` output from step 5
- the PR URL

Ping Soham with that PR. Do not merge until his checklist below passes.

---

## Soham — test after the PR is up

Pull Saish's branch. Do not use `main` until the PR is merged. From `frontend/`:

```powershell
npm install
npm run dev
```

Open `http://localhost:3000/?sell=WETH&buy=USDC&amount=0.1`.

### Get demo WETH

The token is mintable by anyone. Replace the two addresses with the ones in Saish's PR. Use your own wallet address as `to`. This sends a transaction, so the wallet must be on Sepolia and hold a little ETH for gas.

```powershell
cast send <DemoWETH> "mint(address,uint256)" <yourWallet> 1000000000000000000 --rpc-url https://ethereum-sepolia-rpc.publicnode.com --private-key <your key>
```

One WETH is enough. The test spends 0.1.

### Checks, in order

1. The page loads. The sell token name is **Demo WETH**, the buy token name is **Demo USDC**. The symbols on the button still say WETH and USDC.
2. Within about a minute the price is about **223 USDC** for 0.1 WETH, not about 2,600 USDC. The line under the timer says **Uniswap v3 mainnet**.
3. The open breakdown shows **Our fee** between **0.05%** and **1.00%**, **LP keeps** greater than 0, and **Pool reserves** of **1,000 WETH** and a USDC reserve on the order of 2,000,000, not 27,000,000.
4. **You get** is larger than the **Uniswap v3 mainnet** number on the same card.
5. Connect the wallet. If it is on another chain, the button says **Switch to Sepolia**. Click it and confirm the switch in the wallet.
6. The button says **Approve**, then **Swap**. Confirm both prompts. Reject nothing unless you are testing the reject path.
7. After the second receipt, the page shows a Sepolia Etherscan link and the receipt status is success.
8. On Etherscan, the `Swap` event has `tokenIn` = Demo WETH, `amountIn` = 0.1 WETH, and `amountOut` equal to the **You get** figure within the slippage you selected (default 0.05%).
9. Your Demo WETH balance dropped by 0.1. Your Demo USDC balance rose by `amountOut`.
10. Sell USDC for WETH with amount `200`. The button may still say **No pool to fill on Sepolia**. If Saish enabled it and the wallet sends, the pool reverts `CannotBeatVenue`. Record that revert as a pass for this test. Do not file it as a broken WETH → USDC swap.

### Failures to send back to Saish, unchanged

- Price near $26,000 per ETH: the screen is on `VenueReader` or the symbols were renamed.
- Fee stuck at `0.30%` and **You get** below the venue: the curve was not set, or it is older than one hour. He re-runs step 4.
- Button stays **No pool to fill on Sepolia** on WETH → USDC: step 9 was not wired to this pair.
- Approve succeeds and Swap reverts: paste the revert name and the two uints. Do not send a second swap until he answers.
- Wallet prompts for real Sepolia WETH `0xfFf9…6B14`: stop. The picker is still on the canonical token.

When 1–9 pass, comment on the PR with the swap tx hash. Arnab merges.

---

## After that tx exists

The v4 hook `0x37D80e8d8cdf01f43362B73ca58Dfb20284F0080` is deployed and its USDC/WETH pool is initialized. It has no liquidity, so a hook swap cannot fill yet. That work starts only after the tx hash from Soham's step 7 is on Etherscan. It is a separate fill for the Uniswap track, and it reads `VenueReader`, so its price will not match the 223 USDC on the screen.

CRE login stays a separate task. It does not unblock this swap.
