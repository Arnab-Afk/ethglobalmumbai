# Saish — Chainlink CRE setup (ETH Mumbai)

## Goal
CRE workflow that quotes competing venues and feeds the fee-last AMM. Can start **without** on-chain deploy.

## Already done (Koa / Arnab)
- Chainlink Platform account: `arnab.b@somaiya.edu` (vault login on Koa)
- CRE org: **My Org** / `org_BDWz8ob6BRQMXSYs`
- Confidential Workflows waitlist form submitted
- Hackathon deployer funded: `0x0a8B68Dc2A2338B9d86dd82624af3832d8969C6D` (0.05 Sepolia ETH)
- Secrets folder (Victus): `C:\\Users\\arnab\\ethglobal-mumbai-secrets\\`
- Live repo: `C:\\Users\\arnab\\projects\\ethglobalmumbai` → see `docs/06-chainlink-cre.md`

## Your steps
1. Install CRE CLI (Windows): follow https://docs.chain.link/cre/getting-started/cli-installation or use the install script for your OS from https://docs.chain.link/cre
2. Load env (from PowerShell):
   ```powershell
   . C:\\Users\\arnab\\ethglobal-mumbai-secrets\\saish\\load-cre-env.ps1
   ```
   That sets `CRE_ETH_PRIVATE_KEY` (64 hex, **no** 0x), `SEPOLIA_RPC_URL`, `DEPLOYER_ADDRESS`.
3. Login:
   ```powershell
   cre login
   ```
   Use `arnab.b@somaiya.edu` + MFA (same Chainlink Platform account).
4. Verify: `cre whoami`
5. Implement against `docs/06-chainlink-cre.md` and `.claude/agents/cre-oracle` in the repo.
6. Simulation uses `CRE_ETH_PRIVATE_KEY` — never commit `.env` or the secrets folder.

## Docs
- CRE overview / getting started: https://docs.chain.link/cre
- CLI login: https://docs.chain.link/cre/guides/cli/cli-login
- Sepolia RPC: https://ethereum-sepolia-rpc.publicnode.com

## Do not
- Paste the private key into Discord/Slack/chat
- Reuse this key for mainnet funds
- Need 1inch aggregator API key yet
