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
  // The SDK is a file: dependency whose build lives outside frontend/. Turbopack's root is the
  // repo, so the package name does not resolve from frontend/node_modules.
  transpilePackages: ["neat3-sdk"],
  turbopack: {
    root: repoRoot,
    // Relative to turbopack.root. An absolute Windows path makes Turbopack throw
    // "windows imports are not implemented yet" and the swap page returns 500.
    resolveAlias: {
      "neat3-sdk/anon": "../packages/sdk/dist/anon.js",
      "neat3-sdk/frame": "../packages/sdk/dist/frame.js",
      "neat3-sdk": "../packages/sdk/dist/index.js",
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
