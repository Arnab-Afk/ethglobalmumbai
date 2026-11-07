import { resolve } from "node:path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  root,
  publicDir: resolve(root, "public"),
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(root, "index.html"),
        diff: resolve(root, "diff.html"),
      },
    },
  },
  server: {
    port: 5174,
  },
});
