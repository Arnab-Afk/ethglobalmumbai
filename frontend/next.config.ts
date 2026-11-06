import path from "node:path";
import type { NextConfig } from "next";

const repoRoot = path.join(__dirname, "..");
const sdkDist = path.join(repoRoot, "packages/sdk/dist");

const nextConfig: NextConfig = {
  /* config options here */
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  // The SDK is a file: dependency whose build lives outside frontend/. Turbopack's root is the
  // repo, so the package name does not resolve from frontend/node_modules.
  transpilePackages: ["@hairline/sdk"],
  turbopack: {
    root: repoRoot,
    resolveAlias: {
      "@hairline/sdk/anon": path.join(sdkDist, "anon.js"),
      "@hairline/sdk/frame": path.join(sdkDist, "frame.js"),
      "@hairline/sdk": path.join(sdkDist, "index.js"),
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
