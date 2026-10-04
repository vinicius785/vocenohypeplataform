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

const seenKey = (scope: "vi" | "vc") => `vnh:version-seen:${scope}`;

/** Última versão que o usuário já dispensou/visualizou o aviso — evita
 * reabrir o toast de forma invasiva pra uma versão que ele já viu. */
export function getSeenVersion(scope: "vi" | "vc"): string | null {
  try {
    return localStorage.getItem(seenKey(scope));
  } catch {
    return null;
  }
}

export function markVersionSeen(scope: "vi" | "vc", version: string): void {
  try {
    localStorage.setItem(seenKey(scope), version);
  } catch {
    /* localStorage indisponível — não é crítico, só reaparece o toast */
  }
}
