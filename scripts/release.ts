#!/usr/bin/env bun
/**
 * Script de release local — não há CI/CD neste projeto (deploy é via
 * Lovable Cloud observando o branch git, ver CLAUDE.md), então este
 * script substitui um pipeline automatizado por 2 fases explícitas:
 *
 *   bun scripts/release.ts bump <patch|minor|major>
 *   bun scripts/release.ts publish --title "..." --summary "..." \
 *       [--changes-file changes.json] [--environment production]
 *       [--requires-reload]
 *
 * `bump` só prepara o código (SemVer a partir de `APP_VERSION` atual,
 * NUNCA reinicia a numeração) — roda TypeScript/ESLint/testes e cria o
 * commit, mas NÃO publica (não insere linha nenhuma, não dispara
 * evento). `publish` é o passo separado que efetivamente insere a
 * release na tabela `platform_releases` — e isso é o que dispara o
 * aviso em tempo real pros usuários conectados. Rodar `publish` só
 * DEPOIS de confirmar que o novo bundle já está no ar (o time decide
 * manualmente quando isso aconteceu, já que não há CI pra automatizar
 * essa confirmação) — nunca antes, senão o Hypito anuncia uma versão
 * que ninguém ainda consegue carregar.
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(import.meta.dir, "..");
const APP_VERSION_PATH = path.join(ROOT, "src/lib/app-version.ts");

function readAppVersion(): string {
  const src = readFileSync(APP_VERSION_PATH, "utf8");
  const m = /APP_VERSION\s*=\s*"([^"]+)"/.exec(src);
  if (!m) throw new Error(`Não achei APP_VERSION em ${APP_VERSION_PATH}`);
  return m[1];
}

function writeAppVersion(next: string) {
  const src = readFileSync(APP_VERSION_PATH, "utf8");
  const updated = src.replace(/APP_VERSION\s*=\s*"[^"]+"/, `APP_VERSION = "${next}"`);
  writeFileSync(APP_VERSION_PATH, updated);
}

function parseSemver(v: string): { major: number; minor: number; patch: number } {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  if (!m) throw new Error(`Versão inválida: "${v}"`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function bumpVersion(current: string, kind: "patch" | "minor" | "major"): string {
  const p = parseSemver(current);
  if (kind === "major") return `${p.major + 1}.0.0`;
  if (kind === "minor") return `${p.major}.${p.minor + 1}.0`;
  return `${p.major}.${p.minor}.${p.patch + 1}`;
}

function run(cmd: string) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

async function cmdBump(kind: string) {
  if (kind !== "patch" && kind !== "minor" && kind !== "major") {
    throw new Error("Uso: bun scripts/release.ts bump <patch|minor|major>");
  }
  const current = readAppVersion();
  const next = bumpVersion(current, kind);
  console.log(`Versão: ${current} → ${next}`);
  writeAppVersion(next);

  run("bunx tsc --noEmit");
  run("bun run lint");
  run("bun run test");

  run(`git add ${path.relative(ROOT, APP_VERSION_PATH)}`);
  run(`git commit -m "Bump de versão: ${current} → ${next}"`);

  console.log(
    `\nPronto — código em ${next}, ainda NÃO publicado. Push/deploy o commit, confirme que o` +
      ` novo bundle está no ar, e só então rode:\n` +
      `  bun scripts/release.ts publish --title "..." --summary "..."\n`,
  );
}

async function cmdPublish(argv: string[]) {
  const args = parseArgs(argv);
  const title = typeof args.title === "string" ? args.title : undefined;
  if (!title) throw new Error('--title é obrigatório (ex.: --title "PORTAL DO CLIENTE")');
  const summary = typeof args.summary === "string" ? args.summary : "";
  const environment = typeof args.environment === "string" ? args.environment : "production";
  if (!["production", "preview", "development"].includes(environment)) {
    throw new Error(`--environment inválido: "${environment}"`);
  }
  const requiresReload = args["requires-reload"] === true;
  const minimumSupportedVersion =
    typeof args["minimum-supported-version"] === "string"
      ? args["minimum-supported-version"]
      : undefined;

  let changes: { title: string; description: string }[] = [];
  if (typeof args["changes-file"] === "string") {
    changes = JSON.parse(readFileSync(path.resolve(ROOT, args["changes-file"]), "utf8"));
  }

  const version = readAppVersion();

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Faltam SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY no ambiente — pegue no cofre do" +
        " Lovable Cloud (nunca commitar essa chave, nunca usar no bundle do cliente).",
    );
  }

  // Service-role só aqui, num script local — nunca no bundle do
  // cliente (mesma regra de `client.server.ts`). Publica direto na
  // tabela em vez de passar por `publishRelease` (server function
  // autenticada por usuário) porque este script roda fora de uma
  // sessão de navegador — a validação de SemVer/duplicata é replicada
  // aqui em vez de reimportar o server function (que depende do
  // middleware de request HTTP).
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const { data: latest } = await supabase
    .from("platform_releases")
    .select("version")
    .order("released_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest) {
    const a = parseSemver(version);
    const b = parseSemver(latest.version);
    const cmp =
      a.major !== b.major
        ? a.major - b.major
        : a.minor !== b.minor
          ? a.minor - b.minor
          : a.patch - b.patch;
    if (cmp <= 0) {
      throw new Error(
        `Versão ${version} (em app-version.ts) não é maior que a última publicada` +
          ` (${latest.version}). Rode "bump" antes de "publish".`,
      );
    }
  }

  console.log(`Publicando release ${version} (${environment})...`);
  const { error } = await supabase.from("platform_releases").insert({
    version,
    title,
    summary: summary || null,
    changes,
    environment,
    requires_reload: requiresReload,
    minimum_supported_version: minimumSupportedVersion || null,
  });
  if (error) throw new Error(error.message);

  console.log(
    environment === "production"
      ? `\nPublicado! Usuários conectados vão receber o aviso do Hypito em instantes.`
      : `\nPublicado como "${environment}" — não dispara aviso pra produção.`,
  );
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  if (cmd === "bump") return cmdBump(rest[0]);
  if (cmd === "publish") return cmdPublish(rest);
  console.error(
    'Uso:\n  bun scripts/release.ts bump <patch|minor|major>\n  bun scripts/release.ts publish --title "..." [--summary "..."] [--changes-file changes.json] [--environment production] [--requires-reload]',
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
