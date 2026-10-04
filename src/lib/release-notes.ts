/** Camada de dados do aviso de "Nova versão disponível" — lê de
 * `/version.json` só o necessário pro aviso: `version` + a release MAIS
 * recente (`releases[0]`/`releasesVC[0]`, curada por módulo, em linguagem de
 * produto). Esse arquivo é baixado a cada 5 min por aba, então fica mínimo
 * (~2 KB): o histórico completo e o changelog técnico (`notes`/`notesVC`,
 * registro interno, nunca mostrado ao usuário) vivem em `/changelog.json`,
 * que o app nunca busca. Ver `VersionWatcher.tsx`.
 *
 * CRÍTICO: o toast/modal sempre mostra `releases[0]` (a MAIS recente),
 * nunca filtra por número de versão — se `releases[0]` ficar parado numa
 * versão antiga enquanto `APP_VERSION`/`version.json` seguem subindo em
 * commits só com bump técnico (`notes`), o aviso passa a anunciar
 * novidades de uma versão completamente diferente da que a pessoa está
 * de fato recebendo (já aconteceu: `releases[0]` ficou preso na 1.246.0
 * por 8 versões). Toda vez que o bump do commit incluir uma mudança
 * visível ao usuário, ATUALIZAR `releases[0]` (substituir, não
 * acumular) pra refletir só o que é novo DESSA versão em diante — nunca
 * deixar pra depois "quando acumular mais coisa". */

export type ReleaseNoteItem = { title: string; description: string };
export type ReleaseModule = { name: string; tagline?: string; items: ReleaseNoteItem[] };
export type Release = { version: string; summary: string; modules: ReleaseModule[] };

export type VersionInfo = {
  version?: string;
  /** Commit do deploy (gravado no build). */
  build?: string;
  releases?: Release[];
  releasesVC?: Release[];
};

export async function fetchVersionInfo(): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as VersionInfo;
  } catch {
    return null;
  }
}

import { compareSemver, isValidSemver } from "@/lib/semver";

/** O servidor está numa versão MAIS NOVA que a do bundle carregado? SemVer real (não
 * igualdade de texto): um `version.json` mais antigo que o bundle (rollback, CDN atrasada)
 * nunca gera aviso. Versões fora do padrão caem na comparação de igualdade. */
export function isNewerVersion(server: string | undefined, current: string): boolean {
  if (!server) return false;
  if (isValidSemver(server) && isValidSemver(current)) return compareSemver(server, current) === 1;
  return server !== current;
}

/** Até `max` linhas curtas do que mudou: os títulos dos itens da release (por módulo); sem
 * itens, cai no `summary`. */
export function releaseHighlights(release: Release | null | undefined, max = 3): string[] {
  if (!release) return [];
  const titles = release.modules.flatMap((m) => m.items.map((i) => i.title)).filter(Boolean);
  if (titles.length > 0) return titles.slice(0, max);
  return release.summary ? [release.summary] : [];
}

/** Há deploy novo? Versão SemVer maior OU `build` diferente do deste bundle (quando ambos
 * existem). `build` vazio (dev/local) nunca dispara por esse caminho. */
export function isUpdateAvailable(
  info: Pick<VersionInfo, "version" | "build"> | null | undefined,
  current: { version: string; build: string },
): boolean {
  if (!info) return false;
  if (isNewerVersion(info.version, current.version)) return true;
  // Versão do servidor MENOR que a do bundle = rollback/CDN atrasada: não avisa.
  if (info.version && isValidSemver(info.version) && isValidSemver(current.version)) {
    if (compareSemver(info.version, current.version) === -1) return false;
  }
  return !!info.build && !!current.build && info.build !== current.build;
}

const seenKey = (scope: "vi" | "vc") => `vnh:version-seen:${scope}`;

/** Última versão cujo aviso foi dispensado NESTA SESSÃO (aba). Dispensar não é uma decisão
 * permanente: em outra sessão/aba o aviso volta enquanto a pessoa seguir na versão antiga. */
export function getSeenVersion(scope: "vi" | "vc"): string | null {
  try {
    return sessionStorage.getItem(seenKey(scope));
  } catch {
    return null;
  }
}

export function markVersionSeen(scope: "vi" | "vc", version: string): void {
  try {
    sessionStorage.setItem(seenKey(scope), version);
  } catch {
    /* storage indisponível — não é crítico, o aviso só volta a aparecer */
  }
}
