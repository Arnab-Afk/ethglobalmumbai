import { cookieStorage, createConfig, createStorage, http, type Config } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";
import { SEPOLIA } from "./deployments";

/**
 * Standard wagmi setup: EIP-6963 lists every installed wallet (MetaMask, Phantom, Rabby, …).
 * Each wallet is its own connector with its own provider: picking MetaMask does not go through Phantom.
 */
let config: Config | undefined;

export function getConfig() {
  if (config) return config;
  config = createConfig({
    chains: [sepolia],
    connectors: [
      // Fallback for browsers without EIP-6963. Named wallets from MIPD are preferred in the UI.
      injected({ shimDisconnect: true }),
    ],
    multiInjectedProviderDiscovery: true,
    ssr: true,
    // Must name a backing store: createStorage defaults to noopStorage, which persists nothing and
    // leaves reconnectOnMount with no session to restore. Cookies work on the server render too.
    storage: createStorage({ key: "neat.wagmi", storage: cookieStorage }),
    transports: {
      [sepolia.id]: http(SEPOLIA.rpcUrl),
    },
  });
  return config;
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
