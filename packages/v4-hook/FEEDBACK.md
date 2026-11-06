# CompetitiveFeeHook — feedback for the Uniswap v4 hook track

Hook: `packages/v4-hook/src/CompetitiveFeeHook.sol`

## What it does

On every swap, `beforeSwap` asks `VenueReader` for the best Uniswap v3 output of that exact trade and calls `CompetitiveFee.compute` (the shared fee library). The returned LP fee is the largest fee that still pays the trader slightly more than that v3 pool. The override flag `0x400000` is set so PoolManager uses it for this swap only.

The pool is initialized with the dynamic fee flag `0x800000`. v3 pools are the competitor. This hook's own v4 pool is not one of the venues, so it does not undercut itself.

If the reader is down, or the swap is exact-output, the fee is the fallback (0.30%). The swap is not reverted because a quote is missing.

## What we would like from the hook

- A documented way to read the active position's virtual reserves during `beforeSwap` without a separate StateView call. We currently read `StateView.getSlot0` and `getLiquidity`, then treat active liquidity as constant-product reserves so the fee library can run.
- Confirmation that a fee returned with `0x400000` is applied inside the same swap on the Sepolia PoolManager `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`.

## Submission

- Repo: https://github.com/Arnab-Afk/ethglobalmumbai
- Path: `packages/v4-hook`
- Chain: Sepolia (11155111)
- PoolManager: `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543`
- StateView: `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c`
- VenueReader: `0x95B96FeE7EBfDfdCaa400B28EFb0D008cCeA7c8F`
- Hook: `0x37D80e8d8cdf01f43362B73ca58Dfb20284F0080`
- Hook deploy: https://sepolia.etherscan.io/tx/0x04d16eb7b7ca01f7c25d754921aa19f24bb30e4ea17bc8faf5dfa1b0742152a5
- Pool initialize (USDC/WETH, dynamic fee, tick spacing 60): https://sepolia.etherscan.io/tx/0x0e55ba23a95f1d58b16ba0bbe59e976bcc3e91037753e3eb64bd323145a47293
