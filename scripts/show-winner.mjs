/**
 * Competitor output (Uniswap v3, read on-chain) vs our fee-core output.
 * Usage: node scripts/show-winner.mjs <TradePreview> [amountEth]
 *
 * Reserves are a demo inventory priced a little above the Sepolia WETH/USDC market
 * so the fee, not the inventory, decides the winner.
 */
const board = process.argv[2];
const amountEth = process.argv[3] ?? "0.1";
if (!board) {
  console.error("usage: node scripts/show-winner.mjs <TradePreview> [amountEth]");
  process.exit(1);
}

const RPC = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const WETH = "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const amount = BigInt(Math.round(Number(amountEth) * 1e18));
const reserveIn = 1000n * 10n ** 18n;
const reserveOut = 27_000_000n * 10n ** 6n;

const selector = "74ce7cb7"; // preview(address,address,uint256,uint256,uint256)
const data =
  "0x" +
  (process.env.PREVIEW_SELECTOR ?? selector).replace(/^0x/, "") +
  WETH.slice(2).padStart(64, "0") +
  USDC.slice(2).padStart(64, "0") +
  amount.toString(16).padStart(64, "0") +
  reserveIn.toString(16).padStart(64, "0") +
  reserveOut.toString(16).padStart(64, "0");

const res = await fetch(RPC, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: board, data }, "latest"] }),
});
const body = await res.json();
if (body.error) throw new Error(body.error.message);
const hex = body.result.slice(2);
const best = BigInt("0x" + hex.slice(0, 64));
const ours = BigInt("0x" + hex.slice(64, 128));
const fee = BigInt("0x" + hex.slice(128, 192));
const ts = BigInt("0x" + hex.slice(192, 256));
const fmt = (v) => (Number(v) / 1e6).toFixed(6);
const weWin = best === 0n || ours >= best;
console.log(JSON.stringify({
  amountIn: `${amountEth} WETH`,
  competitorOut: `${fmt(best)} USDC`,
  ourOut: `${fmt(ours)} USDC`,
  feePips: fee.toString(),
  updatedAt: ts.toString(),
  reserves: "1000 WETH / 27000000 USDC (demo inventory)",
  winner: weWin ? "us" : "competitor (swap would revert)",
}, null, 2));
