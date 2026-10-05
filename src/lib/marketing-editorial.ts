import { formatDateToIso, parseIsoDateLocal } from "@/lib/utils";

/** Calendário Editorial do projeto Marketing — regras PURAS (sem UI, sem banco). Datas são sempre
 * "YYYY-MM-DD" locais (nunca UTC); atraso é DERIVADO de data + status, nunca gravado. */

export const EDITORIAL_STATUSES = [
  "ideia",
  "planejado",
  "em_producao",
  "em_aprovacao",
  "ajustes",
  "aprovado",
  "publicado",
  "cancelado",
] as const;
export type EditorialStatus = (typeof EDITORIAL_STATUSES)[number];

export const EDITORIAL_STATUS_LABEL: Record<EditorialStatus, string> = {
  ideia: "Ideia",
  planejado: "Planejado",
  em_producao: "Em produção",
  em_aprovacao: "Em aprovação",
  ajustes: "Ajustes",
  aprovado: "Aprovado",
  publicado: "Publicado",
  cancelado: "Cancelado",
};

/** Cor discreta: só um pontinho/linha lateral. Neutro para ideia/planejado. */
export const EDITORIAL_STATUS_DOT: Record<EditorialStatus, string> = {
  ideia: "bg-muted-foreground/50",
  planejado: "bg-muted-foreground/50",
  em_producao: "bg-sky-500",
  em_aprovacao: "bg-amber-500",
  ajustes: "bg-orange-500",
  aprovado: "bg-emerald-500",
  publicado: "bg-emerald-500",
  cancelado: "bg-red-500",
};

export const EDITORIAL_CHANNELS = [
  "instagram",
  "tiktok",
  "youtube",
  "linkedin",
  "x",
  "facebook",
  "blog",
  "outro",
] as const;
export type EditorialChannel = (typeof EDITORIAL_CHANNELS)[number];
export const EDITORIAL_CHANNEL_LABEL: Record<EditorialChannel, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  facebook: "Facebook",
  blog: "Blog",
  outro: "Outro",
};

export const EDITORIAL_FORMATS = [
  "reels",
  "stories",
  "post",
  "carrossel",
  "video",
  "short",
  "artigo",
  "live",
  "outro",
] as const;
export type EditorialFormat = (typeof EDITORIAL_FORMATS)[number];
export const EDITORIAL_FORMAT_LABEL: Record<EditorialFormat, string> = {
  reels: "Reels",
  stories: "Stories",
  post: "Post",
  carrossel: "Carrossel",
  video: "Vídeo",
  short: "Short",
  artigo: "Artigo",
  live: "Live",
  outro: "Outro",
};

/** Formatos que fazem sentido em cada canal (o formulário só oferece estes; "Outro" sempre). */
const FORMATS_BY_CHANNEL: Record<EditorialChannel, EditorialFormat[]> = {
  instagram: ["reels", "stories", "post", "carrossel", "live", "outro"],
  tiktok: ["video", "live", "outro"],
  youtube: ["video", "short", "live", "outro"],
  linkedin: ["post", "carrossel", "artigo", "video", "live", "outro"],
  x: ["post", "video", "outro"],
  facebook: ["post", "reels", "stories", "video", "live", "outro"],
  blog: ["artigo", "outro"],
  outro: [...EDITORIAL_FORMATS],
};
export function formatsForChannel(channel: EditorialChannel): EditorialFormat[] {
  return FORMATS_BY_CHANNEL[channel];
}
/** Mantém o formato se ele vale para o canal; senão devolve o primeiro formato do canal. */
export function coerceFormat(channel: EditorialChannel, format: EditorialFormat): EditorialFormat {
  const list = FORMATS_BY_CHANNEL[channel];
  return list.includes(format) ? format : list[0];
}

export type EditorialItem = {
  id: string;
  projetoId: string;
  titulo: string;
  /** YYYY-MM-DD */
  data: string;
  /** HH:MM ou null */
  hora: string | null;
  canal: EditorialChannel;
  formato: EditorialFormat;
  status: EditorialStatus;
  responsavelId: string | null;
  descricao: string | null;
  /** Id da tarefa no diretório de tarefas (referência, nunca cópia). */
  tarefaId: string | null;
};

export type EditorialDraft = Omit<EditorialItem, "id" | "projetoId">;

export function channelFormatLabel(it: Pick<EditorialItem, "canal" | "formato">): string {
  return `${EDITORIAL_CHANNEL_LABEL[it.canal]} · ${EDITORIAL_FORMAT_LABEL[it.formato]}`;
}

/* ---------------- Mês ---------------- */

export type MonthKey = string; // "YYYY-MM"

export function monthKeyOf(iso: string): MonthKey {
  return iso.slice(0, 7);
}
export function currentMonthKey(now: Date = new Date()): MonthKey {
  return formatDateToIso(now).slice(0, 7);
}
export function addMonths(key: MonthKey, delta: number): MonthKey {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return formatDateToIso(d).slice(0, 7);
}
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
export function monthLabel(key: MonthKey): string {
  const [y, m] = key.split("-").map(Number);
  return `${MONTHS[m - 1]} de ${y}`;
}

export type MonthCell = { date: string; inMonth: boolean };

/** Grade do mês: semanas completas, domingo a sábado (4 a 6 semanas). */
export function buildMonthCells(key: MonthKey): MonthCell[] {
  const [y, m] = key.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const start = new Date(y, m - 1, 1 - first.getDay());
  const end = new Date(y, m - 1, last.getDate() + (6 - last.getDay()));
  const cells: MonthCell[] = [];
  for (
    let d = new Date(start);
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    const iso = formatDateToIso(d);
    cells.push({ date: iso, inMonth: iso.slice(0, 7) === key });
  }
  return cells;
}
/** Intervalo a buscar no banco para desenhar o mês (inclui os dias de borda da grade). */
export function monthFetchRange(key: MonthKey): { from: string; to: string } {
  const cells = buildMonthCells(key);
  return { from: cells[0].date, to: cells[cells.length - 1].date };
}

/* ---------------- Atraso ---------------- */

const DONE_STATUSES: EditorialStatus[] = ["publicado", "cancelado"];

export function daysBetween(fromIso: string, toIso: string): number {
  const a = parseIsoDateLocal(fromIso);
  const b = parseIsoDateLocal(toIso);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}
/** Dias de atraso (>0) ou 0. Só atrasa quem tem data passada e NÃO está publicado/cancelado. */
export function overdueDays(
  item: Pick<EditorialItem, "data" | "status">,
  todayIso: string,
): number {
  if (DONE_STATUSES.includes(item.status)) return 0;
  const d = daysBetween(item.data, todayIso);
  return d > 0 ? d : 0;
}
export function overdueLabel(days: number): string {
  return `Atrasado · ${days} ${days === 1 ? "dia" : "dias"}`;
}

/* ---------------- Ordenação, filtro, agrupamento ---------------- */

/** Por data; no mesmo dia, quem tem horário vem antes (em ordem), depois os sem horário; título desempata. */
export function compareItems(a: EditorialItem, b: EditorialItem): number {
  if (a.data !== b.data) return a.data < b.data ? -1 : 1;
  if (a.hora !== b.hora) {
    if (!a.hora) return 1;
    if (!b.hora) return -1;
    return a.hora < b.hora ? -1 : 1;
  }
  return a.titulo.localeCompare(b.titulo, "pt-BR");
}
export function sortItems(items: readonly EditorialItem[]): EditorialItem[] {
  return [...items].sort(compareItems);
}

export type EditorialFilters = {
  status: EditorialStatus | "";
  canal: EditorialChannel | "";
  responsavelId: string;
  query: string;
};
export const EMPTY_FILTERS: EditorialFilters = {
  status: "",
  canal: "",
  responsavelId: "",
  query: "",
};
export function hasActiveFilters(f: EditorialFilters): boolean {
  return !!(f.status || f.canal || f.responsavelId || f.query.trim());
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Busca por título, canal e responsável (nome vem de `nameOf`). */
export function filterItems(
  items: readonly EditorialItem[],
  f: EditorialFilters,
  nameOf: (memberId: string) => string | undefined,
): EditorialItem[] {
  const q = norm(f.query.trim());
  return items.filter((it) => {
    if (f.status && it.status !== f.status) return false;
    if (f.canal && it.canal !== f.canal) return false;
    if (f.responsavelId && it.responsavelId !== f.responsavelId) return false;
    if (q) {
      const hay = norm(
        [
          it.titulo,
          EDITORIAL_CHANNEL_LABEL[it.canal],
          it.responsavelId ? (nameOf(it.responsavelId) ?? "") : "",
        ].join(" "),
      );
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export function groupByDay(items: readonly EditorialItem[]): Map<string, EditorialItem[]> {
  const map = new Map<string, EditorialItem[]>();
  for (const it of sortItems(items)) {
    const list = map.get(it.data);
    if (list) list.push(it);
    else map.set(it.data, [it]);
  }
  return map;
}

const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MONTH_SHORT = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];
/** "SEG • 05 OUT" */
export function dayHeading(iso: string): string {
  const d = parseIsoDateLocal(iso);
  return `${WEEKDAYS[d.getDay()]} • ${String(d.getDate()).padStart(2, "0")} ${MONTH_SHORT[d.getMonth()]}`;
}

/* ---------------- Rascunhos ---------------- */

export function newDraft(dateIso: string): EditorialDraft {
  return {
    titulo: "",
    data: dateIso,
    hora: null,
    canal: "instagram",
    formato: "reels",
    status: "planejado",
    responsavelId: null,
    descricao: null,
    tarefaId: null,
  };
}
/** Duplicar: mesmos dados, volta para "Planejado" e sem a tarefa (a tarefa é do original). */
export function duplicateDraft(item: EditorialItem): EditorialDraft {
  return {
    titulo: `${item.titulo} (cópia)`,
    data: item.data,
    hora: item.hora,
    canal: item.canal,
    formato: item.formato,
    status: "planejado",
    responsavelId: item.responsavelId,
    descricao: item.descricao,
    tarefaId: null,
  };
}
export function validateDraft(d: EditorialDraft): string | null {
  if (!d.titulo.trim()) return "Informe o título.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.data)) return "Informe a data.";
  if (d.hora && !/^\d{2}:\d{2}$/.test(d.hora)) return "Horário inválido.";
  return null;
}
