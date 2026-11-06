# Hairline (frontend)

The demo app: quote, market and dashboard on Sepolia.

```sh
npm install
npm run dev        # builds ../packages/sdk first, then serves http://localhost:3000
```

**Private reads.** Every RPC read the app makes (quotes, balances, market history) goes through Anon-RPC via `@lastlook/sdk/anon` (`lib/rpc.ts`), and the footer shows the state. There is no fallback to a plain fetch. Set `NEXT_PUBLIC_ANON_RPC` to pick the network:

| Value | Meaning |
|---|---|
| `nox` (default) | Nox mixnet; the network that answered on Nov 6 |
| `tor-js`, `nym` | Other Anon-RPC networks (see `docs/05b-ef-endpoints.md` for their state) |
| `passthrough` | Sandbox only, **not** anonymous |
| `off` | Direct RPC, **not** private; the footer says so |

Not anonymized: the one startup read of the Anon-RPC specifier contract, and your wallet's own RPC once you connect.

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
