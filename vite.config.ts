// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Identificador do build (commit do deploy). O mesmo valor é gravado em `public/version.json`
// por `scripts/stamp-build.ts`, então o aviso de nova versão dispara a CADA deploy, sem
// depender de alguém lembrar de subir `APP_VERSION`. Fora do Vercel (dev/local) fica vazio.
const BUILD_ID = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);

export default defineConfig({
  vite: { define: { __BUILD_ID__: JSON.stringify(BUILD_ID) } },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Without this, nitro defaults to a Cloudflare Workers build (cloudflare-module),
  // which isn't a runtime Vercel understands — the deployed page fails to load.
  nitro: {
    preset: "vercel",
  },
});
