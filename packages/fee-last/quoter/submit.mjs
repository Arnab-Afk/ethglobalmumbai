/**
 * Submit a signed swap to a private relay.
 * The signed fee is the bid. It stays off the public mempool so another searcher
 * cannot copy it into the rival pool before this transaction lands.
 * This does not read or reorder anyone else's transactions.
 */
export async function submitPrivate({ rpcUrl, rawTransaction }) {
  if (!rpcUrl) {
    throw new Error("Set PRIVATE_RPC_URL to a Base private relay or sequencer endpoint. Refusing to broadcast the signed bid on the public mempool.");
  }
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_sendRawTransaction",
      params: [rawTransaction],
    }),
  });
  const body = await response.json();
  if (body.error) throw new Error(body.error.message || JSON.stringify(body.error));
  return body.result;
}
