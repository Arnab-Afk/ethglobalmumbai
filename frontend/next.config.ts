import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  /* config options here */
  devIndicators: { position: "bottom-right" },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // The SDK is a file: dependency outside frontend/. Turbopack's root is the repo, and it will
  // not read packages/sdk/dist because dist/ is gitignored, so resolve the TypeScript source.
  transpilePackages: ["neat3-sdk"],
  turbopack: {
    root: repoRoot,
    // Relative to turbopack.root. An absolute Windows path makes Turbopack throw
    // "windows imports are not implemented yet" and the swap page returns 500.
    resolveAlias: {
      // dist/ is gitignored; Turbopack must resolve the TypeScript source.
      "neat3-sdk/anon": "../packages/sdk/src/anon.ts",
      "neat3-sdk/frame": "../packages/sdk/src/frame.ts",
      "neat3-sdk": "../packages/sdk/src/index.ts",
    },
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
