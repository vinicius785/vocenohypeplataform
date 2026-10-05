/** Mês de referência ("YYYY-MM") da PARTICIPAÇÃO de um influenciador numa campanha recorrente.
 * O mês é decidido pela campanha no momento em que o influenciador é adicionado — nunca escolhido
 * no detalhe do influenciador. Aqui só leitura/apresentação (puro, sem I/O). */
const MESES = [
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

export function parseCicloMes(
  mes: string | null | undefined,
): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes ?? "");
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  return month >= 1 && month <= 12 ? { year, month } : null;
}

/** "Outubro de 2026" ou `null` quando o valor não é um "YYYY-MM" válido. */
export function cicloMesLabel(mes: string | null | undefined): string | null {
  const p = parseCicloMes(mes);
  return p ? `${MESES[p.month - 1]} de ${p.year}` : null;
}

/** Mês da participação: o `cicloMes` gravado; para registros antigos sem ele, o mês de criação
 * (mesma regra que o filtro da campanha já usa para decidir em que mês o registro aparece). */
export function participationMonth(influ: {
  cicloMes?: string | null;
  createdAt?: string | null;
}): string | null {
  if (parseCicloMes(influ.cicloMes)) return influ.cicloMes as string;
  const fromCreated = (influ.createdAt ?? "").slice(0, 7);
  return parseCicloMes(fromCreated) ? fromCreated : null;
}
