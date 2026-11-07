# Observe-only FeeLast bid-context bot (Base).
FROM node:22-alpine
WORKDIR /app

# Quoter modules live next to bot/ in the fee-last package.
COPY quoter/ /app/quoter/
COPY bot/ /app/bot/

WORKDIR /app/bot
ENV NODE_ENV=production
ENV PORT=8787
ENV BASE_RPC_URL=https://base.publicnode.com
ENV BASE_PRECONF_RPC=https://mainnet-preconf.base.org
ENV AMOUNT_USDC=0.3
ENV WINDOW_MS=30000
ENV POLL_MS=1500
ENV BID_EVERY_MS=5000

EXPOSE 8787
# Absolute path: some hosts (e.g. swdc) override WORKDIR to /vm-storage.
CMD ["node", "/app/bot/server.mjs"]
