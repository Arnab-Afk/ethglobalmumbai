import { fallback, http } from "viem";
import { ANON_NETWORKS, createAnonFetch, type AnonFetch, type AnonNetwork } from "@hairline/sdk/anon";

/**
 * Every app read (quotes, balances, market history) goes through this one fetch, and by default that is
 * Anon-RPC: the RPC sees an exit node, not who asked for which pair or size.
 * NEXT_PUBLIC_ANON_RPC is a comma-separated list tried in order ("nox,nym,tor-js" by default), or "off" for direct reads.
 * Measured from Chrome on Nov 6: nox answers in ~5 s, nym in ~45 s on a cold start, and the tor-js demo gateway
 * times out, so it goes last. A network that fails is skipped for COOLDOWN_MS, then tried again.
 */
const setting = process.env.NEXT_PUBLIC_ANON_RPC ?? "nox,nym,tor-js";
export const anonNetworks: AnonNetwork[] = setting === "off" ? [] : setting.split(",").map((s) => s.trim() as AnonNetwork);
for (const n of anonNetworks) {
  if (!(n in ANON_NETWORKS)) throw new Error(`NEXT_PUBLIC_ANON_RPC="${setting}": use off or a comma list of ${Object.keys(ANON_NETWORKS).join(", ")}`);
}

/** The preferred network (first in the list); undefined when reads are direct. */
export const anonNetwork: AnonNetwork | undefined = anonNetworks[0];

/** True only when reads really are anonymized ("passthrough" sandboxes but does not anonymize). */
export const readsAnonymized = anonNetworks.length > 0 && anonNetworks.every((n) => ANON_NETWORKS[n].anonymous);

/** How long one network gets to answer before the next is tried. Nym needs the longest: it bootstraps on first use. */
const ATTEMPT_MS: Record<AnonNetwork, number> = { nox: 30_000, nym: 60_000, "tor-js": 30_000, passthrough: 20_000 };
const COOLDOWN_MS = 45_000;

const workers: Partial<Record<AnonNetwork, AnonFetch>> = {};
const downUntil: Partial<Record<AnonNetwork, number>> = {};

/** The worker for one network, started on first use (browser only). Undefined when reads are direct. */
export function getAnon(net: AnonNetwork | undefined = activeNetwork()): AnonFetch | undefined {
  if (!net) return undefined;
  return (workers[net] ??= createAnonFetch({ network: net }));
}

const usable = () => anonNetworks.filter((n) => (downUntil[n] ?? 0) <= Date.now());
/** The network reads currently go to: the first one not cooling down after a failure. */
export const activeNetwork = (): AnonNetwork | undefined => usable()[0] ?? anonNetwork;

// Direct reads are never chosen for the user: only an explicit click (setDirectReads) turns Anon-RPC off.
let direct = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());
export const isDirectReads = () => direct;
/** Fires when reads switch to direct, or when the active Anon-RPC network changes. */
export const subscribeRpcState = (fn: () => void) => (listeners.add(fn), () => void listeners.delete(fn));
export function setDirectReads() {
  direct = true;
  notify();
}
/** "Try again": forget which networks failed, so the preferred one is tried first. */
export function retryNetworks() {
  for (const n of anonNetworks) delete downUntil[n];
  notify();
}

function withTimeout<T>(p: Promise<T>, ms: number, net: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${net} timed out after ${ms / 1000}s`)), ms);
    p.then(resolve, reject).finally(() => clearTimeout(t));
  });
}

async function viaAnon(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const nets = usable();
  if (nets.length === 0) throw new Error("No private network answered recently and the last attempts timed out. Try again in a moment.");
  let last: unknown;
  for (const net of nets) {
    try {
      return await withTimeout(getAnon(net)!.fetch(input, init), ATTEMPT_MS[net], net);
    } catch (e) {
      if (init?.signal?.aborted) throw e; // the caller gave up; that says nothing about the network
      downUntil[net] = Date.now() + COOLDOWN_MS;
      notify();
      last = e;
    }
  }
  throw last;
}

/** fetch for viem's http transport. With Anon-RPC on there is no silent fallback to a plain fetch: it fails closed. */
export const rpcFetch = (input: string | URL | Request, init?: RequestInit): Promise<Response> =>
  anonNetworks.length > 0 && !direct ? viaAnon(input, init) : fetch(input, init);

/** Per-attempt time is ATTEMPT_MS; this outer limit covers all networks tried in turn. Direct reads keep a short one. */
export const rpcTimeoutMs = anonNetworks.length > 0 ? anonNetworks.reduce((t, n) => t + ATTEMPT_MS[n], 0) + 10_000 : 10_000;

/**
 * Sepolia endpoints, tried in order (they all go through rpcFetch, so a fallback stays anonymous).
 * Each one answered a batched eth_call with browser CORS headers on Nov 6; drpc, 1rpc, ankr, zan and tatum did not
 * (paid plan, no batching or no eth_call), so they are left out.
 */
export const SEPOLIA_RPCS = [
  "https://ethereum-sepolia-rpc.publicnode.com",
  "https://gateway.tenderly.co/public/sepolia",
  "https://ethereum-sepolia-public.nodies.app",
  "https://rpc.sepolia.ethpandaops.io",
] as const;

export const sepoliaTransport = () =>
  fallback(
    SEPOLIA_RPCS.map((url) => http(url, { batch: { wait: 20 }, retryCount: 0, fetchFn: rpcFetch, timeout: rpcTimeoutMs })),
    { retryCount: 0 },
  );
