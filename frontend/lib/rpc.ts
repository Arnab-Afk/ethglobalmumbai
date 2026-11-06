import { ANON_NETWORKS, createAnonFetch, type AnonFetch, type AnonNetwork } from "@hairline/sdk/anon";

/**
 * Every app read (quotes, balances, market history) goes through this one fetch, and by default that is
 * Anon-RPC over the Nox mixnet: the RPC sees an exit node, not who asked for which pair or size.
 * NEXT_PUBLIC_ANON_RPC picks the network ("nox" | "tor-js" | "nym" | "passthrough"), or "off" for direct reads.
 * Nox is the default because it was the one that answered on Nov 6: the tor-js demo gateway failed to build
 * circuits and Nym returned nothing within 2 min.
 */
const setting = process.env.NEXT_PUBLIC_ANON_RPC ?? "nox";
if (setting !== "off" && !(setting in ANON_NETWORKS)) {
  throw new Error(`NEXT_PUBLIC_ANON_RPC="${setting}": use off or one of ${Object.keys(ANON_NETWORKS).join(", ")}`);
}

export const anonNetwork: AnonNetwork | undefined = setting === "off" ? undefined : (setting as AnonNetwork);

/** True only when reads really are anonymized ("passthrough" sandboxes but does not anonymize). */
export const readsAnonymized = anonNetwork ? ANON_NETWORKS[anonNetwork].anonymous : false;

let anon: AnonFetch | undefined;

/** The shared Anon-RPC worker, started on first use (browser only). Undefined when reads are direct. */
export function getAnon(): AnonFetch | undefined {
  if (!anonNetwork) return undefined;
  return (anon ??= createAnonFetch({ network: anonNetwork }));
}

/** fetch for viem's http transport. With Anon-RPC on there is no fallback to a plain fetch: it fails closed. */
export const rpcFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const a = getAnon();
  return a ? a.fetch(input, init) : fetch(input, init);
};

/** Tor and mixnets add seconds per request; direct reads keep viem's default. */
export const rpcTimeoutMs = anonNetwork ? 120_000 : 10_000;
