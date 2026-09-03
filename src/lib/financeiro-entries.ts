import { useEffect, useMemo, useState } from "react";
import { useClientes, type Cliente } from "@/lib/clientes-store";
import { supabase } from "@/integrations/supabase/client";
import type { BankInfo } from "@/components/CampanhasSection";
import {
  pagamentoCashValue,
  normalizePagamento,
  type Entrega,
  type PagamentoEntrega,
} from "@/components/influenciadores/InfluencerBoard";

export type Kind = "receita" | "despesa";
export type Source = "manual" | "influenciador" | "salario" | "campanha";

/** @deprecated substituído por `anexos` (Supabase Storage, suporta mais de
 * um arquivo) — mantido só pra lançamentos antigos que já tinham uma nota
 * fiscal salva como base64 direto na linha. */
export type InvoiceFile = { name: string; dataUrl: string };

export const FINANCEIRO_ANEXO_CATEGORIAS = ["Comprovante", "Nota fiscal"] as const;
export type FinanceiroAnexoCategoria = (typeof FINANCEIRO_ANEXO_CATEGORIAS)[number];

export type FinanceiroAnexo = {
  id: string;
  categoria: FinanceiroAnexoCategoria;
  nome: string;
  url: string;
  criadoEm?: string;
};

/** Anexos antigos (pré-categoria) caem em "Comprovante" — não tinham
 * distinção nenhuma antes, e comprovante é a categoria mais comum. */
export function legacyFinanceiroAnexoCategoria(raw: string): FinanceiroAnexoCategoria {
  return (FINANCEIRO_ANEXO_CATEGORIAS as readonly string[]).includes(raw)
    ? (raw as FinanceiroAnexoCategoria)
    : "Comprovante";
}

/** Receita: a_receber → recebido (ou vencido, se passou do vencimento sem
 * receber). Despesa: a_pagar → pago (ou vencido). `cancelado` é comum aos
 * dois tipos. Substitui o antigo `PaidMap` (localStorage, só despesa) —
 * ver `reconcilePaidMapOnce`. */
export type EntryStatus = "a_receber" | "recebido" | "a_pagar" | "pago" | "vencido" | "cancelado";

/** Grava os dados de uma confirmação de pagamento/recebimento — a data em
 * si (`pagamento`) nunca é a mesma coisa que o vencimento: o vencimento é
 * quando DEVERIA acontecer, isso aqui é quando de fato aconteceu. */
export type PaymentConfirmation = {
  pagamento: string; // YYYY-MM-DD
  paidAmount: number;
  paymentMethod: string;
  paymentNote?: string;
  paymentAnexoId?: string; // referencia um item de anexos[]
};

export type RecurrenceFrequency = "semanal" | "mensal" | "trimestral" | "anual" | "personalizado";

export type EntryRecurrence = {
  frequency: RecurrenceFrequency;
  intervalDays?: number; // só p/ "personalizado"
  seriesId: string; // constante em toda a série (= id da 1ª ocorrência)
  parentId?: string; // id da ocorrência anterior (ausente na 1ª)
  occurrenceIndex: number; // 0, 1, 2...
};

export type Entry = {
  id: string;
  date: string; // YYYY-MM-DD — vencimento (nome legado do campo, ver `vencimento`)
  vencimento: string; // mesmo valor de `date` — nome semanticamente correto
  competencia: string; // YYYY-MM-DD — período contábil (default = vencimento)
  description: string;
  category: string;
  amount: number;
  kind: Kind;
  source: Source;
  status: EntryStatus;
  payment?: PaymentConfirmation;
  clienteId?: string;
  clienteNome?: string;
  campanhaId?: string;
  campanhaNome?: string;
  influenciadorId?: string;
  responsavelId?: string;
  formaPagamento?: string; // prevista/planejada
  observacoes?: string;
  recurrence?: EntryRecurrence;
  meta?: string;
  editable: boolean;
  bank?: BankInfo;
  invoice?: InvoiceFile;
  anexos?: FinanceiroAnexo[];
  influencerName?: string;
  memberName?: string;
};

export type ManualEntry = {
  id: string;
  date: string;
  competencia?: string;
  description: string;
  category: string;
  amount: number;
  kind: Kind;
  status?: EntryStatus; // ausente = calculado por data na leitura
  payment?: PaymentConfirmation;
  clienteId?: string;
  campanhaId?: string;
  influenciadorId?: string;
  responsavelId?: string;
  formaPagamento?: string;
  observacoes?: string;
  recurrence?: EntryRecurrence;
  bank?: BankInfo;
  invoice?: InvoiceFile;
  anexos?: FinanceiroAnexo[];
};

type InfluPersisted = {
  id: string;
  nome: string;
  entregas?: Entrega[];
  pagamento?: PagamentoEntrega;
  bank?: BankInfo;
};

function pagamentoDescription(p: PagamentoEntrega, nome: string): string {
  if (p.tipos.includes("Valor")) return `Pagamento a ${nome}`;
  if (p.tipos.includes("Comissão")) {
    const cfg = p.config.Comissão ?? {};
    return `Comissão a ${nome} (${cfg.comissaoPct || "0"}% sobre ${cfg.comissaoSobre || "vendas"})`;
  }
  if (p.tipos.includes("Permuta")) {
    const cfg = p.config.Permuta ?? {};
    return `Permuta com ${nome}${cfg.permutaDescricao ? " — " + cfg.permutaDescricao : ""}`;
  }
  return `${p.config.Outro?.outroDescricao?.trim() || "Outro pagamento"} — ${nome}`;
}

type Member = {
  id: string;
  name: string;
  salary?: string;
  startDate?: string;
};

/** Sobe um comprovante/nota fiscal pro bucket `financeiro-anexos` (mesmo
 * padrão de `uploadEntregaAnexo` em InfluencerBoard.tsx) e devolve a URL
 * assinada (1 ano) — `null` se o usuário não estiver autenticado ou o
 * upload falhar. */
export async function uploadFinanceiroAnexo(file: File): Promise<string | null> {
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const safeName = file.name.replace(/[^\w.-]+/g, "_");
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
  const { error } = await supabase.storage.from("financeiro-anexos").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (error) {
    console.warn("[financeiro-anexos] upload failed", error);
    return null;
  }
  const { data: signed } = await supabase.storage
    .from("financeiro-anexos")
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  return signed?.signedUrl ?? null;
}

/** Junta os anexos "de verdade" (Storage) com a nota fiscal antiga (base64,
 * campo `invoice`, hoje `@deprecated`) num único array pra exibição — sem
 * reescrever o registro, só normalizando na leitura. */
export function entryAnexos(e: {
  invoice?: InvoiceFile;
  anexos?: FinanceiroAnexo[];
}): FinanceiroAnexo[] {
  const anexos = (e.anexos ?? []).map((a) => ({
    ...a,
    categoria: legacyFinanceiroAnexoCategoria(a.categoria),
  }));
  if (!e.invoice) return anexos;
  return [
    {
      id: "legacy-invoice",
      categoria: "Nota fiscal",
      nome: e.invoice.name,
      url: e.invoice.dataUrl,
    },
    ...anexos,
  ];
}

/** Categorias padronizadas de lançamento manual — uma lista fixa por tipo,
 * em vez de texto livre (cada pessoa digitava um nome diferente pra
 * mesma coisa: "Influenciador", "Influenciadores", "Pagto influ"...). */
export const CATEGORIAS_DESPESA = [
  "Pagamento de influenciador",
  "Salários",
  "Ferramentas e software",
  "Marketing e anúncios",
  "Impostos e taxas",
  "Aluguel e contas",
  "Outros",
] as const;

export const CATEGORIAS_RECEITA = ["Receita de campanha", "Consultoria", "Outros"] as const;

export function categoriasFor(kind: Kind): readonly string[] {
  return kind === "despesa" ? CATEGORIAS_DESPESA : CATEGORIAS_RECEITA;
}

export const PAID_KEY = "financeiro:pagos";
const influsKey = (id: string) => `campanha:influs:${id}`;
// Só existe pra barrar datas claramente erradas (ex.: um ano digitado errado
// tipo "0422-03-12"), não pra esconder lançamentos reais recentes — por isso
// é um piso bem no passado, não uma data fixa próxima de "hoje" que passaria
// a esconder tudo assim que o calendário virasse.
const PLATFORM_START_ISO = "2000-01-01";

export type PaidMap = Record<string, string>; // entryId -> ISO date pago

export function loadPaid(): PaidMap {
  try {
    const raw = localStorage.getItem(PAID_KEY);
    return raw ? (JSON.parse(raw) as PaidMap) : {};
  } catch {
    return {};
  }
}
export function savePaid(m: PaidMap) {
  try {
    localStorage.setItem(PAID_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function parseMoney(s?: string): number {
  if (!s) return 0;
  const cleaned = String(s)
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n : 0;
}

export const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function fromMonthKey(k: string) {
  const [y, m] = k.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1);
}
export function fmtMonth(k: string) {
  const d = fromMonthKey(k);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function todayISO() {
  // `toISOString().slice(0, 10)` pega o dia em UTC — no Brasil (UTC-3), depois
  // das 21h já vira o dia seguinte em UTC, fazendo entregas feitas "hoje" à
  // noite parecerem atrasadas por um dia. Monta a data a partir dos
  // componentes locais em vez de depender do fuso UTC.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export { formatIsoDate } from "./utils";

/**
 * Persistência dos lançamentos manuais do Financeiro — reescrita do zero
 * depois de uma sequência de bugs causados pelo modelo antigo (store
 * genérico que comparava um array inteiro contra um "snapshot anterior"
 * pra decidir o que fazer upsert/delete no Supabase). Esse modelo de diff
 * tinha uma falha de fundo: se o array recebido estivesse um passo
 * dessincronizado do cache real (o normal em UI assíncrona — outra aba,
 * clique duplo, realtime chegando fora de ordem), qualquer id ausente
 * virava um "apagar" — inclusive ids que só estavam faltando por estarem
 * atrasados, não porque alguém quis apagar.
 *
 * Aqui cada operação (criar/editar/apagar) é uma chamada direta e
 * independente ao Supabase, com o `id` explícito de qual linha mexer.
 * O cache local só muda depois que o banco confirma — nunca antes
 * (sem otimismo) e nunca por diferença entre dois arrays. Cada ação afeta
 * exatamente a linha que ela diz que afeta, nem mais, nem menos.
 */
let manualCache: ManualEntry[] = [];
let manualLoaded = false;
const manualListeners = new Set<() => void>();
const emitManual = () => manualListeners.forEach((l) => l());

let manualChannel: ReturnType<typeof supabase.channel> | null = null;
function subscribeManualRealtime() {
  if (manualChannel) return;
  manualChannel = supabase
    .channel(`rt-financeiro_lancamentos-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "financeiro_lancamentos" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { id?: string } | null;
          if (!old?.id) return;
          manualCache = manualCache.filter((x) => x.id !== old.id);
        } else {
          const row = payload.new as { data?: ManualEntry } | null;
          if (!row?.data) return;
          const item = row.data;
          const idx = manualCache.findIndex((x) => x.id === item.id);
          manualCache =
            idx >= 0 ? manualCache.map((x, i) => (i === idx ? item : x)) : [...manualCache, item];
        }
        emitManual();
      },
    )
    .subscribe();
}

export async function initFinanceiroSync(): Promise<void> {
  if (!manualLoaded) {
    try {
      const { data, error } = await supabase
        .from("financeiro_lancamentos")
        .select("data")
        .order("created_at", { ascending: true });
      if (error) throw error;
      manualCache = (data ?? []).map((row) => row.data as ManualEntry);
    } catch (e) {
      console.warn("[financeiro_lancamentos] initial load failed", e);
    } finally {
      manualLoaded = true;
      emitManual();
    }
  }
  subscribeManualRealtime();
}

export function loadManual(): ManualEntry[] {
  return manualCache;
}
export function onManualChange(callback: () => void): () => void {
  manualListeners.add(callback);
  return () => manualListeners.delete(callback);
}

export async function createManualEntry(entry: ManualEntry): Promise<void> {
  const { error } = await supabase
    .from("financeiro_lancamentos")
    .insert({ id: entry.id, data: entry, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  if (!manualCache.some((x) => x.id === entry.id)) {
    manualCache = [...manualCache, entry];
    emitManual();
  }
}

export async function updateManualEntry(entry: ManualEntry): Promise<void> {
  const { error } = await supabase
    .from("financeiro_lancamentos")
    .update({ data: entry, updated_at: new Date().toISOString() })
    .eq("id", entry.id);
  if (error) throw new Error(error.message);
  manualCache = manualCache.map((x) => (x.id === entry.id ? entry : x));
  emitManual();
}

export async function deleteManualEntry(id: string): Promise<void> {
  const { error } = await supabase.from("financeiro_lancamentos").delete().eq("id", id);
  if (error) throw new Error(error.message);
  manualCache = manualCache.filter((x) => x.id !== id);
  emitManual();
}
function loadMembers(): Member[] {
  try {
    const raw = localStorage.getItem("time:membros");
    return raw ? (JSON.parse(raw) as Member[]) : [];
  } catch {
    return [];
  }
}

/** Lista de membros do time pra popular o campo "Responsável" no
 * lançamento — mesma fonte já usada pra gerar as despesas de salário. */
export function loadFinanceiroMembers(): { id: string; name: string }[] {
  return loadMembers().map((m) => ({ id: m.id, name: m.name }));
}

/** Status/pagamento de entries AUTO-GERADAS (campanha/influenciador/
 * salário, `editable:false`) — essas não têm linha própria em
 * `financeiro_lancamentos` pra guardar status, então usam esta tabela
 * paralela, chaveada pelo mesmo id sintético já usado na `Entry` (ex.
 * "inf:<campanhaId>:<influId>"). Mesmo padrão de cache+realtime de
 * `manualCache` acima, só que mais simples (sem insert/delete pela UI —
 * `upsertStatusOverride` sempre faz upsert). */
type StatusOverride = { status: EntryStatus } & Partial<PaymentConfirmation>;
let overridesCache: Record<string, StatusOverride> = {};
let overridesLoaded = false;
const overridesListeners = new Set<() => void>();
const emitOverrides = () => overridesListeners.forEach((l) => l());

let overridesChannel: ReturnType<typeof supabase.channel> | null = null;
function subscribeOverridesRealtime() {
  if (overridesChannel) return;
  overridesChannel = supabase
    .channel(`rt-financeiro_status_overrides-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "financeiro_status_overrides" },
      (payload) => {
        if (payload.eventType === "DELETE") {
          const old = payload.old as { id?: string } | null;
          if (!old?.id) return;
          const next = { ...overridesCache };
          delete next[old.id];
          overridesCache = next;
        } else {
          const row = payload.new as { id?: string; data?: StatusOverride } | null;
          if (!row?.id || !row.data) return;
          overridesCache = { ...overridesCache, [row.id]: row.data };
        }
        emitOverrides();
      },
    )
    .subscribe();
}

export async function initOverridesSync(): Promise<void> {
  if (!overridesLoaded) {
    try {
      const { data, error } = await supabase.from("financeiro_status_overrides").select("id,data");
      if (error) throw error;
      overridesCache = Object.fromEntries(
        (data ?? []).map((row) => [row.id, row.data as StatusOverride]),
      );
    } catch (e) {
      console.warn("[financeiro_status_overrides] initial load failed", e);
    } finally {
      overridesLoaded = true;
      emitOverrides();
    }
  }
  subscribeOverridesRealtime();
}

function loadOverrides(): Record<string, StatusOverride> {
  return overridesCache;
}
function onOverridesChange(callback: () => void): () => void {
  overridesListeners.add(callback);
  return () => overridesListeners.delete(callback);
}

/** Influenciadores por campanha, lidos da tabela real
 * `campanha_influenciadores` (Supabase) — substitui aos poucos a leitura
 * antiga de `localStorage["campanha:influs:*"]`. `buildEntries()` faz um
 * MERGE dos dois (real primeiro, local só supre nomes que ainda não
 * existem no real) em vez de um corte seco: o localStorage nunca foi
 * sincronizado entre navegadores, então pode haver participações que só
 * existem lá — descartar essa leitura de uma vez arriscaria fazer
 * despesas de influenciador desaparecerem silenciosamente pra quem só
 * tinha o dado local. */
let influsCache: Record<string, InfluPersisted[]> = {};
let influsLoaded = false;
const influsListeners = new Set<() => void>();
const emitInflus = () => influsListeners.forEach((l) => l());

let influsChannel: ReturnType<typeof supabase.channel> | null = null;
function subscribeInflusRealtime() {
  if (influsChannel) return;
  influsChannel = supabase
    .channel(`rt-financeiro-campanha_influenciadores-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "campanha_influenciadores" },
      () => {
        // Qualquer mudança (insert/update/delete) recarrega a tabela
        // inteira — é uma tabela pequena (uma linha por participação em
        // campanha), não vale a pena reconstruir o patch incremental por
        // campanha aqui.
        void loadInflusFromServer();
      },
    )
    .subscribe();
}

async function loadInflusFromServer(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from("campanha_influenciadores")
      .select("campanha_id,data");
    if (error) throw error;
    const next: Record<string, InfluPersisted[]> = {};
    for (const row of data ?? []) {
      const list = next[row.campanha_id] ?? (next[row.campanha_id] = []);
      list.push(row.data as InfluPersisted);
    }
    influsCache = next;
  } catch (e) {
    console.warn("[campanha_influenciadores] load failed", e);
  } finally {
    influsLoaded = true;
    emitInflus();
  }
}

export async function initInflusSync(): Promise<void> {
  if (!influsLoaded) await loadInflusFromServer();
  subscribeInflusRealtime();
}

function loadInflusByCampanha(): Record<string, InfluPersisted[]> {
  return influsCache;
}
function onInflusChange(callback: () => void): () => void {
  influsListeners.add(callback);
  return () => influsListeners.delete(callback);
}

export async function upsertStatusOverride(id: string, override: StatusOverride): Promise<void> {
  const { error } = await supabase
    .from("financeiro_status_overrides")
    .upsert({ id, data: override, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  overridesCache = { ...overridesCache, [id]: override };
  emitOverrides();
}

/** Explícito (recebido/pago/cancelado) sempre vence; senão, vencido se já
 * passou do vencimento sem confirmação; senão o padrão do tipo. Nunca
 * confunde "a_receber"/"a_pagar" gravado no passado com uma confirmação —
 * esses dois sempre recalculam por data, só recebido/pago/cancelado são
 * estados terminais. */
function deriveStatus(kind: Kind, vencimento: string, explicit?: EntryStatus): EntryStatus {
  if (explicit === "recebido" || explicit === "pago" || explicit === "cancelado") return explicit;
  if (vencimento < todayISO()) return "vencido";
  return kind === "receita" ? "a_receber" : "a_pagar";
}

function paymentFromOverride(
  override: StatusOverride | undefined,
  fallbackAmount: number,
): PaymentConfirmation | undefined {
  if (!override?.pagamento) return undefined;
  return {
    pagamento: override.pagamento,
    paidAmount: override.paidAmount ?? fallbackAmount,
    paymentMethod: override.paymentMethod ?? "",
    paymentNote: override.paymentNote,
    paymentAnexoId: override.paymentAnexoId,
  };
}

function buildEntries(
  clientes: Cliente[],
  manual: ManualEntry[],
  overrides: Record<string, StatusOverride>,
  influsByCampanha: Record<string, InfluPersisted[]>,
): Entry[] {
  const out: Entry[] = [];

  // 1. Campanhas: receita (valor do cliente / parcelas) + despesas (influenciadores)
  for (const c of clientes) {
    for (const camp of c.campanhas ?? []) {
      const parcelas = camp.pagClienteParcelas ?? [];
      const pushReceita = (id: string, date: string, amount: number) => {
        if (amount <= 0) return;
        const vencimento = date || todayISO();
        const override = overrides[id];
        out.push({
          id,
          date: vencimento,
          vencimento,
          competencia: vencimento,
          description: `Receita — ${camp.nome}`,
          category: "Campanhas",
          amount,
          kind: "receita",
          source: "campanha",
          status: deriveStatus("receita", vencimento, override?.status),
          payment: paymentFromOverride(override, amount),
          clienteId: c.id,
          clienteNome: c.empresa,
          campanhaId: camp.id,
          campanhaNome: camp.nome,
          meta: c.empresa,
          editable: false,
        });
      };
      if (parcelas.length > 0) {
        for (const p of parcelas)
          pushReceita(`camp-rec:${camp.id}:${p.id}`, p.data, parseMoney(p.valor));
      } else if (
        camp.pagClienteTipo === "50/50 (duas datas)" ||
        camp.pagClienteTipo === "50/50 (segunda na entrega)"
      ) {
        // Não usa `pagClienteParcelas` (reservado ao tipo "Parcelado"), então
        // sem isso o valor total virava um único lançamento na primeira
        // data, ignorando a segunda metade — cada 50% vira sua própria
        // receita, com a segunda usando o prazo da campanha quando for
        // "paga na entrega" (sem campo de data próprio).
        const half = parseMoney(camp.valorCliente) / 2;
        const secondDate =
          camp.pagClienteTipo === "50/50 (duas datas)"
            ? camp.pagClienteData2
            : camp.prazo || camp.pagClienteData1;
        pushReceita(`camp-rec:${camp.id}:1`, camp.pagClienteData1 ?? "", half);
        pushReceita(`camp-rec:${camp.id}:2`, secondDate ?? "", half);
      } else {
        const amount = parseMoney(camp.valorCliente);
        const dt = camp.pagClienteDataUnica || camp.pagClienteData1 || camp.prazo || todayISO();
        pushReceita(`camp-rec:${camp.id}`, dt, amount);
      }

      // Fonte real (campanha_influenciadores) primeiro; o localStorage
      // antigo só supre nomes que ainda não existem na fonte real — ver
      // comentário em `loadInflusByCampanha` sobre por que isso é um
      // merge, não um corte seco.
      const realInflus = influsByCampanha[camp.id] ?? [];
      const localInflus = (() => {
        try {
          const raw = localStorage.getItem(influsKey(camp.id));
          return raw ? (JSON.parse(raw) as InfluPersisted[]) : [];
        } catch {
          return [];
        }
      })();
      const realNomes = new Set(realInflus.map((i) => i.nome));
      const influs = [...realInflus, ...localInflus.filter((i) => !realNomes.has(i.nome))];
      for (const inf of influs) {
        const p = normalizePagamento(inf.pagamento);
        // Só vira despesa real no Financeiro depois que o pagamento é aceito —
        // combinado (pendente) ou recusado não entram no caixa.
        if (!p || p.aprovacao !== "aceito") continue;
        const amount = pagamentoCashValue(p);
        const nome = inf.nome || "influenciador";
        const outroCriterios = p.tipos.includes("Outro")
          ? p.config.Outro?.outroCriterios
          : undefined;
        const infId = `inf:${camp.id}:${inf.id}`;
        const infVencimento = p.data || todayISO();
        const infOverride = overrides[infId];
        out.push({
          id: infId,
          date: infVencimento,
          vencimento: infVencimento,
          competencia: infVencimento,
          description: pagamentoDescription(p, nome),
          category: "Influenciadores",
          amount,
          kind: "despesa",
          source: "influenciador",
          status: deriveStatus("despesa", infVencimento, infOverride?.status),
          payment: paymentFromOverride(infOverride, amount),
          clienteId: c.id,
          clienteNome: c.empresa,
          campanhaId: camp.id,
          campanhaNome: camp.nome,
          influenciadorId: inf.id,
          meta: `${c.empresa} · ${camp.nome}${outroCriterios ? ` · ${outroCriterios}` : ""}`,
          editable: false,
          bank: inf.bank,
          influencerName: inf.nome,
        });
      }
      // Nota: o "Outro" configurado no pagamento da campanha (na criação/
      // edição) é só uma orientação para o time sobre como pagar — não é
      // lançado automaticamente no Financeiro. Só vira despesa real quando
      // efetivamente aceito no pagamento do influenciador (loop acima).
    }
  }

  // 2. Salários — dia 15 do mês corrente, sem retroagir a meses anteriores
  // ao início real de operação da plataforma (2026-08-01).
  const members = loadMembers();
  const now = new Date();
  const salaryDate = new Date(now.getFullYear(), now.getMonth(), 15);
  const iso = salaryDate.toISOString().slice(0, 10);
  if (salaryDate <= now && iso >= PLATFORM_START_ISO) {
    for (const m of members) {
      const amount = parseMoney(m.salary);
      if (amount <= 0) continue;
      const salId = `sal:${m.id}:${iso}`;
      const salOverride = overrides[salId];
      out.push({
        id: salId,
        date: iso,
        vencimento: iso,
        competencia: iso,
        description: `Salário — ${m.name}`,
        category: "Salários",
        amount,
        kind: "despesa",
        source: "salario",
        status: deriveStatus("despesa", iso, salOverride?.status),
        payment: paymentFromOverride(salOverride, amount),
        meta: "Recorrência dia 15",
        editable: false,
        memberName: m.name,
      });
    }
  }

  // 3. Lançamentos manuais
  for (const e of manual) {
    const cli = e.clienteId ? clientes.find((c) => c.id === e.clienteId) : undefined;
    const camp =
      cli && e.campanhaId ? cli.campanhas?.find((x) => x.id === e.campanhaId) : undefined;
    const metaParts = [cli?.empresa, camp?.nome].filter(Boolean) as string[];
    out.push({
      id: e.id,
      date: e.date,
      vencimento: e.date,
      competencia: e.competencia || e.date,
      description: e.description,
      category: e.category || (e.kind === "receita" ? "Receita" : "Despesa"),
      amount: e.amount,
      kind: e.kind,
      source: "manual",
      status: deriveStatus(e.kind, e.date, e.status),
      payment: e.payment,
      clienteId: e.clienteId,
      clienteNome: cli?.empresa,
      campanhaId: e.campanhaId,
      campanhaNome: camp?.nome,
      influenciadorId: e.influenciadorId,
      responsavelId: e.responsavelId,
      formaPagamento: e.formaPagamento,
      observacoes: e.observacoes,
      recurrence: e.recurrence,
      meta: metaParts.join(" · ") || undefined,
      editable: true,
      bank: e.bank,
      invoice: e.invoice,
      anexos: e.anexos,
    });
  }

  // Nada antes do início real de operação da plataforma deve aparecer no
  // Financeiro, mesmo que uma data digitada manualmente (ou de teste) caia
  // antes disso.
  return out.filter((e) => e.date >= PLATFORM_START_ISO).sort((a, b) => (a.date < b.date ? 1 : -1));
}

/**
 * Agrega receitas/despesas de campanhas, influenciadores, salários e
 * lançamentos manuais num único array de `Entry`. Compartilhado entre
 * FinanceiroSection (visão completa) e o dashboard Início (resumo).
 */
export function useFinanceiroEntries(): Entry[] {
  const clientes = useClientes();
  const [manual, setManual] = useState<ManualEntry[]>(() => loadManual());
  const [overrides, setOverrides] = useState<Record<string, StatusOverride>>(() => loadOverrides());
  const [influs, setInflus] = useState<Record<string, InfluPersisted[]>>(() =>
    loadInflusByCampanha(),
  );
  const [tick, setTick] = useState(0);

  useEffect(() => {
    void reconcilePaidMapOnce();
    void ensureRecurrenceOccurrences(loadManual());
    void initInflusSync();
    const onStorage = () => {
      setManual(loadManual());
      setOverrides(loadOverrides());
      setInflus(loadInflusByCampanha());
      setTick((t) => t + 1);
    };
    window.addEventListener("storage", onStorage);
    const int = window.setInterval(onStorage, 1500);
    const unsubManual = onManualChange(onStorage);
    const unsubOverrides = onOverridesChange(onStorage);
    const unsubInflus = onInflusChange(onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(int);
      unsubManual();
      unsubOverrides();
      unsubInflus();
    };
  }, []);

  return useMemo(() => {
    void tick;
    return buildEntries(clientes, manual, overrides, influs);
  }, [clientes, manual, overrides, influs, tick]);
}

/** Roda uma vez por navegador: lê o `PaidMap` legado (localStorage) e, pra
 * cada marca de "pago" que ainda não tem status gravado no servidor,
 * grava (lançamento manual → `updateManualEntry`; entry auto-gerada →
 * `upsertStatusOverride`). Cobertura é cumulativa entre navegadores —
 * marcas que só existirem num navegador que nunca mais abrir o app não
 * migram (limitação pré-existente do modelo antigo: esse dado nunca foi
 * centralizado). Não remove o `PaidMap` — só para de ser a fonte de
 * verdade daqui pra frente. */
const RECONCILED_KEY = "financeiro:pagos:reconciled";
export async function reconcilePaidMapOnce(): Promise<void> {
  try {
    if (localStorage.getItem(RECONCILED_KEY)) return;
  } catch {
    return;
  }
  const paid = loadPaid();
  const entries = Object.entries(paid);
  if (entries.length === 0) {
    try {
      localStorage.setItem(RECONCILED_KEY, "1");
    } catch {
      /* ignore */
    }
    return;
  }
  for (const [entryId, isoDatePaid] of entries) {
    try {
      const manual = manualCache.find((e) => e.id === entryId);
      if (manual) {
        if (!manual.status) {
          await updateManualEntry({
            ...manual,
            status: "pago",
            payment: { pagamento: isoDatePaid, paidAmount: manual.amount, paymentMethod: "" },
          });
        }
      } else if (!overridesCache[entryId]) {
        await upsertStatusOverride(entryId, { status: "pago", pagamento: isoDatePaid });
      }
    } catch (e) {
      console.warn("[financeiro] reconcilePaidMapOnce failed for", entryId, e);
    }
  }
  try {
    localStorage.setItem(RECONCILED_KEY, "1");
  } catch {
    /* ignore */
  }
}

/** Confirma pagamento/recebimento — sempre a partir da MESMA `Entry` já
 * derivada (não distingue chamador), roteando pro lugar certo conforme a
 * origem. Nunca reescreve `date`/vencimento: a data do pagamento é um
 * campo à parte (ver `PaymentConfirmation`). */
export async function markEntryPaid(entry: Entry, payload: PaymentConfirmation): Promise<void> {
  const status: EntryStatus = entry.kind === "receita" ? "recebido" : "pago";
  if (entry.editable) {
    const manual = manualCache.find((e) => e.id === entry.id);
    if (!manual) throw new Error("Lançamento não encontrado.");
    await updateManualEntry({ ...manual, status, payment: payload });
  } else {
    await upsertStatusOverride(entry.id, { status, ...payload });
  }
}

/** Recebe o array já filtrado por período+filtros (o `visible` do hook
 * central) — nunca faz query própria. Usado pela linha de KPIs da Visão
 * Geral. */
export function kpiTotals(entries: Entry[]): {
  receitaRealizada: number;
  aReceber: number;
  despesaRealizada: number;
  aPagar: number;
  saldoRealizado: number;
  saldoProjetado: number;
} {
  let receitaRealizada = 0;
  let aReceber = 0;
  let despesaRealizada = 0;
  let aPagar = 0;
  for (const e of entries) {
    if (e.kind === "receita") {
      if (e.status === "recebido") receitaRealizada += e.payment?.paidAmount ?? e.amount;
      else if (e.status !== "cancelado") aReceber += e.amount;
    } else {
      if (e.status === "pago") despesaRealizada += e.payment?.paidAmount ?? e.amount;
      else if (e.status !== "cancelado") aPagar += e.amount;
    }
  }
  return {
    receitaRealizada,
    aReceber,
    despesaRealizada,
    aPagar,
    saldoRealizado: receitaRealizada - despesaRealizada,
    saldoProjetado: receitaRealizada + aReceber - (despesaRealizada + aPagar),
  };
}

/** Vencidos primeiro, depois por vencimento mais próximo — mesma ordenação
 * usada em "Próximos vencimentos", "A receber" e "A pagar". */
export function sortByUrgency(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    const aVencido = a.status === "vencido" ? 0 : 1;
    const bVencido = b.status === "vencido" ? 0 : 1;
    if (aVencido !== bVencido) return aVencido - bVencido;
    return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0;
  });
}

function isoAddDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export type AlertKind =
  | "vencido_receita"
  | "vencido_despesa"
  | "vence_em_breve_receita"
  | "vence_em_breve_despesa";
export type AlertItem = { kind: AlertKind; count: number; total: number };

/** Faixa "Requer atenção" da Visão Geral — só retorna grupos com pelo
 * menos 1 item (a UI some inteira se vier vazio). */
export function alertItems(entries: Entry[], venceEmBreveDias = 7): AlertItem[] {
  const today = todayISO();
  const limit = isoAddDays(today, venceEmBreveDias);
  const groups: Record<AlertKind, AlertItem> = {
    vencido_receita: { kind: "vencido_receita", count: 0, total: 0 },
    vencido_despesa: { kind: "vencido_despesa", count: 0, total: 0 },
    vence_em_breve_receita: { kind: "vence_em_breve_receita", count: 0, total: 0 },
    vence_em_breve_despesa: { kind: "vence_em_breve_despesa", count: 0, total: 0 },
  };
  for (const e of entries) {
    if (e.status === "vencido") {
      const g = e.kind === "receita" ? groups.vencido_receita : groups.vencido_despesa;
      g.count += 1;
      g.total += e.amount;
    } else if (
      (e.status === "a_receber" || e.status === "a_pagar") &&
      e.vencimento >= today &&
      e.vencimento <= limit
    ) {
      const g =
        e.kind === "receita" ? groups.vence_em_breve_receita : groups.vence_em_breve_despesa;
      g.count += 1;
      g.total += e.amount;
    }
  }
  return Object.values(groups).filter((g) => g.count > 0);
}

export function groupByCategoria(
  entries: Entry[],
  kind: Kind,
): { categoria: string; total: number }[] {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (e.kind !== kind) continue;
    map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
  }
  return Array.from(map.entries())
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);
}

export function groupByCliente(
  entries: Entry[],
): { clienteId: string; clienteNome: string; total: number }[] {
  const map = new Map<string, { clienteNome: string; total: number }>();
  for (const e of entries) {
    if (e.kind !== "receita" || !e.clienteId) continue;
    const cur = map.get(e.clienteId) ?? { clienteNome: e.clienteNome ?? "—", total: 0 };
    cur.total += e.amount;
    map.set(e.clienteId, cur);
  }
  return Array.from(map.entries())
    .map(([clienteId, v]) => ({ clienteId, ...v }))
    .sort((a, b) => b.total - a.total);
}

export function revenueConcentration(byCliente: { total: number }[]): {
  top1Pct: number;
  top3Pct: number;
} {
  const total = byCliente.reduce((s, c) => s + c.total, 0);
  if (total <= 0) return { top1Pct: 0, top3Pct: 0 };
  const sorted = [...byCliente].sort((a, b) => b.total - a.total);
  const top1 = sorted[0]?.total ?? 0;
  const top3 = sorted.slice(0, 3).reduce((s, c) => s + c.total, 0);
  return { top1Pct: (top1 / total) * 100, top3Pct: (top3 / total) * 100 };
}

export type CampanhaResultado = {
  campanhaId: string;
  campanhaNome: string;
  clienteNome: string;
  receita: number;
  custos: number;
  resultado: number;
  margem: number; // % — 0 se receita for 0
};

/** Receita/custo por campanha calculado a partir dos próprios lançamentos
 * financeiros vinculados (`campanhaId`) — sem estrutura de custo
 * dedicada ainda, então este é o cálculo inicial pedido explicitamente
 * (usar os lançamentos já existentes). */
export function groupByCampanha(entries: Entry[]): CampanhaResultado[] {
  const map = new Map<
    string,
    { campanhaNome: string; clienteNome: string; receita: number; custos: number }
  >();
  for (const e of entries) {
    if (!e.campanhaId) continue;
    const cur = map.get(e.campanhaId) ?? {
      campanhaNome: e.campanhaNome ?? "—",
      clienteNome: e.clienteNome ?? "—",
      receita: 0,
      custos: 0,
    };
    if (e.kind === "receita") cur.receita += e.amount;
    else cur.custos += e.amount;
    map.set(e.campanhaId, cur);
  }
  return Array.from(map.entries())
    .map(([campanhaId, v]) => {
      const resultado = v.receita - v.custos;
      const margem = v.receita > 0 ? (resultado / v.receita) * 100 : 0;
      return { campanhaId, ...v, resultado, margem };
    })
    .sort((a, b) => b.receita - a.receita);
}

export type CashFlowPoint = {
  bucket: string;
  receitaRealizada: number;
  receitaProjetada: number;
  despesaRealizada: number;
  despesaProjetada: number;
};

function bucketOf(iso: string, granularity: "day" | "week" | "month"): string {
  if (granularity === "day") return iso;
  if (granularity === "month") return iso.slice(0, 7);
  const d = new Date(`${iso}T00:00:00`);
  const dow = d.getDay();
  const diff = dow === 0 ? 6 : dow - 1; // segunda como início da semana
  d.setDate(d.getDate() - diff);
  return d.toISOString().slice(0, 10);
}

/** Série temporal receitas x despesas — REALIZADO usa a data efetiva do
 * pagamento/recebimento; o que ainda não foi confirmado nunca entra na
 * série realizada, só na projetada (por vencimento). Cancelados nunca
 * entram em nenhuma das duas. */
export function cashFlowSeries(
  entries: Entry[],
  granularity: "day" | "week" | "month",
): CashFlowPoint[] {
  const map = new Map<string, CashFlowPoint>();
  const ensure = (bucket: string) => {
    const cur = map.get(bucket);
    if (cur) return cur;
    const fresh: CashFlowPoint = {
      bucket,
      receitaRealizada: 0,
      receitaProjetada: 0,
      despesaRealizada: 0,
      despesaProjetada: 0,
    };
    map.set(bucket, fresh);
    return fresh;
  };
  for (const e of entries) {
    if (e.status === "cancelado") continue;
    const realized = e.status === "recebido" || e.status === "pago";
    const bucketDate = realized ? (e.payment?.pagamento ?? e.vencimento) : e.vencimento;
    const point = ensure(bucketOf(bucketDate, granularity));
    if (e.kind === "receita") {
      if (realized) point.receitaRealizada += e.payment?.paidAmount ?? e.amount;
      else point.receitaProjetada += e.amount;
    } else {
      if (realized) point.despesaRealizada += e.payment?.paidAmount ?? e.amount;
      else point.despesaProjetada += e.amount;
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.bucket < b.bucket ? -1 : a.bucket > b.bucket ? 1 : 0,
  );
}

/** Saldo acumulado ao longo da série — "realizado" só soma o que já
 * aconteceu de fato; "projetado" soma tudo (realizado + ainda pendente). */
export function runningBalance(
  series: CashFlowPoint[],
  mode: "realizado" | "projetado",
): { bucket: string; saldoAcumulado: number }[] {
  let acc = 0;
  return series.map((p) => {
    const receita =
      mode === "realizado" ? p.receitaRealizada : p.receitaRealizada + p.receitaProjetada;
    const despesa =
      mode === "realizado" ? p.despesaRealizada : p.despesaRealizada + p.despesaProjetada;
    acc += receita - despesa;
    return { bucket: p.bucket, saldoAcumulado: acc };
  });
}

export function upcomingDue(entries: Entry[], limit: number): Entry[] {
  const pending = entries.filter(
    (e) => e.status === "a_receber" || e.status === "a_pagar" || e.status === "vencido",
  );
  return sortByUrgency(pending).slice(0, limit);
}

type RecurrenceSeriesRow = {
  seriesId: string;
  frequency: RecurrenceFrequency;
  intervalDays?: number;
  active: boolean;
};

export async function createRecurrenceSeries(
  seriesId: string,
  frequency: RecurrenceFrequency,
  intervalDays?: number,
): Promise<void> {
  const { error } = await supabase
    .from("financeiro_recorrencias")
    .insert({ data: { seriesId, frequency, intervalDays, active: true } });
  if (error) throw new Error(error.message);
}

async function fetchActiveRecurrenceSeries(): Promise<RecurrenceSeriesRow[]> {
  const { data, error } = await supabase.from("financeiro_recorrencias").select("data");
  if (error) {
    console.warn("[financeiro_recorrencias] fetch failed", error);
    return [];
  }
  return (data ?? []).map((row) => row.data as RecurrenceSeriesRow).filter((s) => s.active);
}

function addByFrequency(
  dateIso: string,
  frequency: RecurrenceFrequency,
  intervalDays?: number,
): string {
  const d = new Date(`${dateIso}T00:00:00`);
  switch (frequency) {
    case "semanal":
      d.setDate(d.getDate() + 7);
      break;
    case "mensal":
      d.setMonth(d.getMonth() + 1);
      break;
    case "trimestral":
      d.setMonth(d.getMonth() + 3);
      break;
    case "anual":
      d.setFullYear(d.getFullYear() + 1);
      break;
    case "personalizado":
      d.setDate(d.getDate() + (intervalDays ?? 30));
      break;
  }
  return d.toISOString().slice(0, 10);
}

let recurrenceCheckedThisSession = false;

/** Roda uma vez por sessão de app: pra cada série ativa, se a ocorrência
 * mais recente já foi paga/recebida/cancelada OU seu vencimento já
 * passou, gera a próxima (nunca mais de uma por vez) — nunca gera um
 * lote de ocorrências futuras. Cada ocorrência gerada é uma
 * `ManualEntry` comum, editável/excluível sem afetar as demais. */
export async function ensureRecurrenceOccurrences(allManual: ManualEntry[]): Promise<void> {
  if (recurrenceCheckedThisSession) return;
  recurrenceCheckedThisSession = true;
  const series = await fetchActiveRecurrenceSeries();
  if (series.length === 0) return;
  const today = todayISO();
  for (const s of series) {
    const occurrences = allManual.filter((e) => e.recurrence?.seriesId === s.seriesId);
    if (occurrences.length === 0) continue;
    const latest = occurrences.reduce((a, b) =>
      a.recurrence!.occurrenceIndex > b.recurrence!.occurrenceIndex ? a : b,
    );
    const isTerminal =
      latest.status === "recebido" || latest.status === "pago" || latest.status === "cancelado";
    if (!isTerminal && latest.date >= today) continue;
    const alreadyHasNext = occurrences.some(
      (e) => e.recurrence!.occurrenceIndex === latest.recurrence!.occurrenceIndex + 1,
    );
    if (alreadyHasNext) continue;
    const nextDate = addByFrequency(latest.date, s.frequency, s.intervalDays);
    const next: ManualEntry = {
      ...latest,
      id: crypto.randomUUID(),
      date: nextDate,
      competencia: nextDate,
      status: undefined,
      payment: undefined,
      recurrence: {
        frequency: s.frequency,
        intervalDays: s.intervalDays,
        seriesId: s.seriesId,
        parentId: latest.id,
        occurrenceIndex: latest.recurrence!.occurrenceIndex + 1,
      },
    };
    try {
      await createManualEntry(next);
    } catch (e) {
      console.warn("[financeiro] ensureRecurrenceOccurrences failed for series", s.seriesId, e);
    }
  }
}
