// Create (or load) the throwaway devnet key and fund it from the node faucet (1 ETH, once per address per hour).
import { formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { faucet, loadState, rpc } from "../devnet.js";

const me = privateKeyToAccount(loadState().privateKey).address;
const hash = await faucet(me);
console.log(JSON.stringify({ address: me, faucetTx: hash, balanceEth: formatEther(BigInt(await rpc("eth_getBalance", [me, "latest"]))) }));
