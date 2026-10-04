#!/usr/bin/env bun
/**
 * Roda antes do `vite build`: grava em `public/version.json` o commit do deploy (`build`), para
 * o aviso de "Nova versão disponível" disparar a cada deploy. Só age quando há
 * VERCEL_GIT_COMMIT_SHA (deploy); localmente não altera nenhum arquivo versionado.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const sha = (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7);
if (!sha) {
  console.log("[stamp-build] sem VERCEL_GIT_COMMIT_SHA — nada a gravar.");
  process.exit(0);
}
const file = path.resolve(import.meta.dir, "../public/version.json");
const json = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
json.build = sha;
writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
console.log(`[stamp-build] version.json build=${sha}`);
