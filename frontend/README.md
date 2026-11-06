# neat (frontend)

The demo app: quote, market and dashboard on Sepolia.

```sh
npm install
npm run dev        # builds ../packages/sdk first, then serves http://localhost:3000
```

**Private reads.** Sepolia reads (quotes, fee config, balances, the swap dry-run, receipts, market history) go through Anon-RPC via `neat3-sdk/anon` (`lib/rpc.ts`), and the footer shows which network is active. Reads fail closed: they never fall back to a plain fetch on their own.

- **Network failover.** `NEXT_PUBLIC_ANON_RPC` is an ordered, comma-separated list, default `nox,nym,tor-js`. A network that errors or times out is skipped for 45 s and the next one is tried; "Try again" resets that. Measured from Chrome on Sepolia reads (Nov 6): nox about 5 s, nym about 45 s on a cold start, tor-js times out because its demo gateway is down, so it is last.
- **RPC failover.** Behind the mixnet, `SEPOLIA_RPCS` lists four public endpoints (publicnode, Tenderly, nodies, ethpandaops), tried in order. Each answered a batched `eth_call` with browser CORS headers. They are ordinary RPC providers, not Anon-RPC services: the mixnet hides who is asking.
- **Failed reads.** The swap card says what happened and offers **Try again** and **Use a direct connection (not private)**. The direct option only happens on a click, and the footer then says "direct RPC".
- **Browser.** Use Chrome. Brave Shields can block the mixnet; turn Shields off for the site if you must use Brave.

| `NEXT_PUBLIC_ANON_RPC` | Meaning |
|---|---|
| `nox,nym,tor-js` (default) | Try Nox, then Nym, then Tor |
| any one name, or another list | `nox`, `nym`, `tor-js`; `passthrough` sandboxes but is **not** anonymous |
| `off` | Direct RPC, **not** private; the footer says so |

Not anonymized: the one startup read of the Anon-RPC specifier contract (a Sepolia read for Nox, a mainnet read for Nym and Tor), your wallet's own RPC once you connect, and the mainnet competitor-price reads in `lib/mainnet.ts` (Uniswap quoter and block polling), which are direct for now.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
