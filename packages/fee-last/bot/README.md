# FeeLast bid-context bot (24/7)

Long-running Node process that keeps the Base FeeLast + Uniswap flow context **in memory** and exposes it over HTTP.

**Observe only.** It does not sign quotes or submit swaps. That matches the fynd hold (no buy/seed/swap).

## Local

```sh
cd packages/fee-last/bot
npm start
# → http://127.0.0.1:8787/bid
```

| Env | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | HTTP port |
| `BASE_RPC_URL` | `https://base.publicnode.com` | Canonical + logs |
| `BASE_PRECONF_RPC` | `https://mainnet-preconf.base.org` | Tip polling |
| `AMOUNT_USDC` | `0.3` | Bid size |
| `WINDOW_MS` | `30000` | Flow window |
| `POLL_MS` | `1500` | Loop interval |
| `BID_EVERY_MS` | `5000` | Max quote refresh gap |

## Endpoints

- `GET /health` — liveness + last error
- `GET /bid` — compact live vs flow-adjusted fee
- `GET /snapshot` — full in-memory context

## Deploy (Railway)

Install CLI: `npm i -g @railway/cli`, then login. From `packages/fee-last` (Docker context must include `quoter/` + `bot/`):

```sh
cd packages/fee-last
railway init   # once, link a project
railway up
railway domain
```

`railway.toml` at the package root points at `bot/Dockerfile`. Set env in the dashboard if you want a private RPC later. Keep broadcast off.

## Deploy (Fly.io)

```sh
cd packages/fee-last
fly launch --dockerfile bot/Dockerfile --no-deploy
fly secrets set BASE_RPC_URL=https://base.publicnode.com
fly deploy --dockerfile bot/Dockerfile
```

## Deploy (any VPS)

```sh
docker build -f bot/Dockerfile -t fee-last-bot .
docker run -d --restart unless-stopped -p 8787:8787 --name fee-last-bot fee-last-bot
```

Or `node bot/server.mjs` under systemd/`pm2 start bot/server.mjs --name fee-last-bot`.
