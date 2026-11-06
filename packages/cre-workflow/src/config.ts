import { getAddress } from "viem";
import { z } from "zod";
import type { WorkflowConfig } from "./types.js";

const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((a) => getAddress(a));

const venueSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["mock-xyk", "univ2", "univ3", "http"]),
  exclude: z.boolean().optional(),
  reserveIn: z.string().optional(),
  reserveOut: z.string().optional(),
  feeBps: z.number().int().nonnegative().optional(),
  router: address.optional(),
  path: z.array(address).optional(),
  quoter: address.optional(),
  fee: z.number().int().positive().optional(),
  url: z.string().url().optional(),
});

const sanitySchema = z.object({
  feed: address,
  maxAboveBps: z.number().int().min(0).max(10_000),
  maxBelowBps: z.number().int().min(0).max(10_000),
  maxFeedAgeSec: z.number().int().positive(),
});

const pairSchema = z
  .object({
    tokenIn: address,
    tokenOut: address,
    amountsIn: z.array(z.string()).min(1).max(16),
    venues: z.array(venueSchema).min(1),
    decimalsIn: z.number().int().min(0).max(36).optional(),
    decimalsOut: z.number().int().min(0).max(36).optional(),
    sanity: sanitySchema.optional(),
  })
  .refine((p) => !p.sanity || (p.decimalsIn !== undefined && p.decimalsOut !== undefined), {
    message: "sanity needs decimalsIn and decimalsOut to compute fair output",
  });

export const workflowConfigSchema = z.object({
  schedule: z.string(),
  chainSelectorName: z.string(),
  rpcUrl: z.string().optional(),
  quoteOracle: address,
  gasLimit: z.string().optional(),
  pairs: z.array(pairSchema).min(1),
});

export function parseWorkflowConfig(raw: unknown): WorkflowConfig {
  return workflowConfigSchema.parse(raw) as WorkflowConfig;
}
