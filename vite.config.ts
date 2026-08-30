import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

const shim = (name: string) =>
  fileURLToPath(new URL(`./src/shims/${name}.ts`, import.meta.url));

// type-ai-sdk ships a CommonJS Node bundle. It pulls in `fs`/`os`/`path`/`crypto`
// (via its bundled dotenv) and reads `process.env`. None of that is meaningful in a
// browser, so we alias those to inert shims and provide a minimal `process`.
export default defineConfig({
  base: "/TypeAItest/",
  plugins: [react()],
  resolve: {
    alias: {
      fs: shim("fs"),
      "node:fs": shim("fs"),
      os: shim("os"),
      "node:os": shim("os"),
      path: shim("path"),
      "node:path": shim("path"),
      crypto: shim("crypto"),
      "node:crypto": shim("crypto"),
      buffer: "buffer",
    },
  },
  define: {
    global: "globalThis",
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV ?? "production",
    ),
  },
  optimizeDeps: {
    include: ["type-ai-sdk", "buffer"],
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 2000,
  },
});
