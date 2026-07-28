import { defineConfig } from "vitest/config";
import path from "node:path";

// Standalone config for unit tests (pure logic only) — intentionally does not
// reuse vite.config.ts's @lovable.dev/vite-tanstack-config wrapper, since that
// pulls in the TanStack Start/SSR plugin chain which unit tests don't need.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "node",
  },
});
