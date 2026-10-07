/** Modelo puro da página Relatórios: ordenação e agrupamento por competência (mês). */
export type ReportRow = {
  id: string;
  campanhaId: string;
  campanhaNome: string;
  nome: string;
  mes: string;
  uploadedAt: string;
  url: string | null;
};

export type ReportSort = "recentes" | "antigos" | "campanha";

const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

export function competenceLabel(mes: string): string {
  const [year, month] = mes.split("-");
  const idx = Number(month) - 1;
  return idx >= 0 && idx < 12 ? `${MONTHS[idx]} de ${year}` : mes;
}

export function filterAndSortReports(
  reports: readonly ReportRow[],
  campaignId: string,
  sortBy: ReportSort,
): ReportRow[] {
  const filtered =
    campaignId === "todas" ? [...reports] : reports.filter((r) => r.campanhaId === campaignId);
  return filtered.sort((a, b) => {
    if (sortBy === "campanha") return a.campanhaNome.localeCompare(b.campanhaNome);
    return sortBy === "recentes"
      ? b.uploadedAt.localeCompare(a.uploadedAt)
      : a.uploadedAt.localeCompare(b.uploadedAt);
  });
}

/** Agrupa por mês preservando a ordem em que os meses aparecem na lista já ordenada. */
export function groupByMonth(rows: readonly ReportRow[]): [string, ReportRow[]][] {
  const map = new Map<string, ReportRow[]>();
  for (const r of rows) {
    const list = map.get(r.mes) ?? [];
    list.push(r);
    map.set(r.mes, list);
  }
  return Array.from(map.entries());
}

export function dateBR(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d.toLocaleDateString("pt-BR");
}
