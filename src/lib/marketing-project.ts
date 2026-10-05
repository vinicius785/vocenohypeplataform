/** ÚNICA regra para identificar o projeto Marketing da Você no Hype. Usa o marcador estável
 * `systemKey` (gravado pela migration `20261007000000_marketing_conteudos`). O nome fica só como
 * reserva TEMPORÁRIA, para projetos ainda sem o marcador (migration não aplicada) — quando o
 * marcador estiver em todo lugar, apague a linha do nome. */
export type MarketingProjectLike = { name?: string | null; systemKey?: string | null };

export function isMarketingProject(project: MarketingProjectLike | null | undefined): boolean {
  if (!project) return false;
  if (project.systemKey) return project.systemKey === "marketing";
  return (project.name ?? "").trim().toUpperCase() === "MARKETING";
}

/** Id do projeto Marketing numa lista de projetos (ou `undefined`). */
export function findMarketingProjectId(
  projects: readonly (MarketingProjectLike & { id: string })[],
): string | undefined {
  return projects.find((p) => isMarketingProject(p))?.id;
}
