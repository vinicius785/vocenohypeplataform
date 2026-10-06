import type { CronogramaItem, CronogramaTipo } from "@/lib/campanha-scoped-store";
import type { PublicCronogramaItem } from "@/lib/portal-types";

/** Regras puras do calendário da campanha (V2): um evento, uma fonte, uma propriedade de visibilidade. */

export const EVENTO_TIPOS: CronogramaTipo[] = [
  "cronograma",
  "prazo",
  "postagem",
  "pagamento",
  "outro",
];
export const EVENTO_TIPO_LABEL: Record<CronogramaTipo, string> = {
  cronograma: "Cronograma",
  prazo: "Prazo",
  postagem: "Postagem",
  pagamento: "Pagamento",
  outro: "Outro",
};
export const tipoDe = (i: Pick<CronogramaItem, "tipo">): CronogramaTipo => i.tipo ?? "cronograma";

/** Evento antigo (sem a propriedade) sempre foi visível ao cliente; só `false` o esconde. */
export const visivelAoCliente = (i: Pick<CronogramaItem, "visivelCliente">): boolean =>
  i.visivelCliente !== false;

export const iso = (y: number, m0: number, d: number) =>
  `${y}-${String(m0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export type Ocorrencia = { item: CronogramaItem; date: string };

/** Ocorrências do mês (m0 = 0..11). Evento recorrente repete no mesmo dia do mês (ajustado ao
 * último dia quando o mês é mais curto), todo mês. */
export function ocorrenciasDoMes(items: CronogramaItem[], year: number, m0: number): Ocorrencia[] {
  const dias = new Date(year, m0 + 1, 0).getDate();
  const out: Ocorrencia[] = [];
  for (const item of items) {
    if (item.recurring) {
      out.push({ item, date: iso(year, m0, Math.min(Number(item.date.slice(8, 10)), dias)) });
    } else if (item.date.startsWith(`${year}-${String(m0 + 1).padStart(2, "0")}-`)) {
      out.push({ item, date: item.date });
    }
  }
  return out;
}

const byHoraTitulo = (a: Ocorrencia, b: Ocorrencia) =>
  (a.item.hora ?? "99:99").localeCompare(b.item.hora ?? "99:99") ||
  a.item.title.localeCompare(b.item.title, "pt-BR");

export function agruparPorDia(occ: Ocorrencia[]): Map<string, Ocorrencia[]> {
  const map = new Map<string, Ocorrencia[]>();
  for (const o of occ) map.set(o.date, [...(map.get(o.date) ?? []), o]);
  for (const [k, v] of map) map.set(k, v.sort(byHoraTitulo));
  return map;
}

export type FiltroVisibilidade = "todos" | "internos" | "cliente";
export function filtrarOcorrencias(
  occ: Ocorrencia[],
  f: { busca?: string; visibilidade?: FiltroVisibilidade; tipo?: CronogramaTipo | "" },
): Ocorrencia[] {
  const q = (f.busca ?? "").trim().toLowerCase();
  return occ.filter(({ item }) => {
    if (q && !`${item.title} ${item.description ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.visibilidade === "internos" && visivelAoCliente(item)) return false;
    if (f.visibilidade === "cliente" && !visivelAoCliente(item)) return false;
    if (f.tipo && tipoDe(item) !== f.tipo) return false;
    return true;
  });
}

/** Mostra até `max` eventos no dia; o resto vira "+N eventos". */
export function limitarDia<T>(list: T[], max = 3): { shown: T[]; rest: number } {
  return { shown: list.slice(0, max), rest: Math.max(0, list.length - max) };
}

/** As 42 células (6 semanas) do mês, começando no domingo. */
export function celulasDoMes(year: number, m0: number): { date: string; inMonth: boolean }[] {
  const first = new Date(year, m0, 1);
  const start = new Date(year, m0, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    return { date: iso(d.getFullYear(), d.getMonth(), d.getDate()), inMonth: d.getMonth() === m0 };
  });
}

export function novoEvento(
  input: {
    title: string;
    date: string;
    hora?: string;
    tipo?: CronogramaTipo;
    description?: string;
    visivelCliente?: boolean;
    recurring?: boolean;
  },
  autor: string,
  now: Date = new Date(),
): CronogramaItem {
  return {
    id: crypto.randomUUID(),
    date: input.date,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    hora: input.hora || undefined,
    tipo: input.tipo ?? "cronograma",
    recurring: input.recurring ? true : undefined,
    visivelCliente: input.visivelCliente === true,
    criadoPor: autor,
    criadoEm: now.toISOString(),
    atualizadoEm: now.toISOString(),
  };
}

export function duplicarEvento(
  item: CronogramaItem,
  autor: string,
  now: Date = new Date(),
): CronogramaItem {
  // A cópia nasce interna: compartilhar com o cliente é sempre uma escolha explícita.
  return {
    ...item,
    id: crypto.randomUUID(),
    title: `${item.title} (cópia)`,
    visivelCliente: false,
    criadoPor: autor,
    criadoEm: now.toISOString(),
    atualizadoEm: now.toISOString(),
  };
}

/** Projeção PÚBLICA (Portal do Cliente): só eventos compartilhados e só os campos permitidos —
 * nada de visibilidade, autor ou datas internas. Aplicada no servidor. */
export function cronogramaPublico(items: CronogramaItem[]): PublicCronogramaItem[] {
  return items
    .filter(visivelAoCliente)
    .map((i) => ({
      id: i.id,
      date: i.date,
      title: i.title,
      ...(i.description ? { description: i.description } : {}),
      ...(i.recurring ? { recurring: true } : {}),
      ...(i.hora ? { hora: i.hora } : {}),
      ...(i.tipo ? { tipo: i.tipo } : {}),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
