// S1: Anon-RPC transport. Browser-only: @anon-rpc/browser-harness sandboxes a hash-pinned anon-client in a
// null-origin iframe; the Node harness is unpublished (ethereum/anon-rpc impl/node-harness is `private`).
import { AnonRpcWorker } from "@anon-rpc/browser-harness";
import type { FetchFn } from "./client.js";

const MAINNET = "https://ethereum-rpc.publicnode.com";
const SEPOLIA = "https://ethereum-sepolia-rpc.publicnode.com";

/** Networks from ethereum/anon-rpc adopters.json5. `bootstrap` reads the specifier contract once (not anonymized). */
export const ANON_NETWORKS = {
  "tor-js": {
    specifier: "0x700dA3193D35fA54Cd3fBf29B66f2a2A0385659e", bootstrapRpc: MAINNET, anonymous: true,
    // Demo gateway listed upstream: limited capacity, may disappear. Pass your own via `config`.
    config: { gateways: ["152.236.3.22:12298:uEiCH0VdbhryzJcMtCfB0vLA4sOvHdQ4hq5w7CopcwU59bQ"] } as unknown,
  },
  nym: { specifier: "0x3aCD9742C68F6d993066Ae25533e09b9e1f60eD0", bootstrapRpc: MAINNET, anonymous: true, config: undefined as unknown },
  nox: { specifier: "0x35133267A8F7EC35046a83DCA0f4Ca8A6e1b7A9A", bootstrapRpc: SEPOLIA, anonymous: true, config: undefined as unknown },
  /** Sandbox + hash pinning only. Does NOT anonymize. For testing. */
  passthrough: { specifier: "0x4fd77be300f31c5fe6ab266d35d27750a3478d27", bootstrapRpc: MAINNET, anonymous: false, config: undefined as unknown },
} as const;

export type AnonNetwork = keyof typeof ANON_NETWORKS;

export interface AnonFetch {
  /** Pass as `anonFetch` to CompetitiveFeeClient. Calls made before `ready` are buffered, not dropped. */
  fetch: FetchFn;
  ready: Promise<void>;
  anonymous: boolean;
  close(): void;
}

/** One long-lived anonymized fetch. Create once per network, not per request. */
export function createAnonFetch(opts: { network?: AnonNetwork; config?: unknown; bootstrapRpc?: string } = {}): AnonFetch {
  if (typeof document === "undefined") throw new Error("Anon-RPC needs a browser (sandboxed iframe); in Node use quoteMode: \"public\"");
  const n = ANON_NETWORKS[opts.network ?? "tor-js"];
  const bootstrapRpc = opts.bootstrapRpc ?? n.bootstrapRpc;
  const worker = new AnonRpcWorker({
    address: n.specifier,
    config: (opts.config ?? n.config) as any,
    preExisting: {
      rpcProvider: {
        request: async ({ method, params }: { method: string; params?: unknown }) => {
          const res = await fetch(bootstrapRpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? [] }) });
          const body = await res.json();
          if (body.error) throw new Error(body.error.message);
          return body.result;
        },
      },
    },
  });
  return { fetch: worker.fetch as FetchFn, ready: worker.ready, anonymous: n.anonymous, close: () => worker.close() };
}
