# apps/demo

Sepolia dashboard: reads `MockQuoteOracle` through `CompetitiveFeeExtruction.previewFeePips`.

```sh
npm install
npm run dev
```

Open http://localhost:5173 and click **Quote on Sepolia**.

This is a quote, not a token fill. A fill is `packages/private-quoting` (`fund` → `deploy` → `swap --mode frame`) once the EF faucet has ETH, or the Aqua Anvil fork script.
