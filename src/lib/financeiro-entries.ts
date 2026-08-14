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

export type Entry = {
  id: string;
  date: string; // YYYY-MM-DD
  description: string;
  category: string;
  amount: number;
  kind: Kind;
  source: Source;
  clienteId?: string;
  clienteNome?: string;
  campanhaId?: string;
  campanhaNome?: string;
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
  description: string;
  category: string;
  amount: number;
  kind: Kind;
  clienteId?: string;
  campanhaId?: string;
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

function buildEntries(clientes: Cliente[], manual: ManualEntry[]): Entry[] {
  const out: Entry[] = [];

  // 1. Campanhas: receita (valor do cliente / parcelas) + despesas (influenciadores)
  for (const c of clientes) {
    for (const camp of c.campanhas ?? []) {
      const parcelas = camp.pagClienteParcelas ?? [];
      const pushReceita = (id: string, date: string, amount: number) => {
        if (amount <= 0) return;
        out.push({
          id,
          date: date || todayISO(),
          description: `Receita — ${camp.nome}`,
          category: "Campanhas",
          amount,
          kind: "receita",
          source: "campanha",
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

      const influs = (() => {
        try {
          const raw = localStorage.getItem(influsKey(camp.id));
          return raw ? (JSON.parse(raw) as InfluPersisted[]) : [];
        } catch {
          return [];
        }
      })();
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
        out.push({
          id: `inf:${camp.id}:${inf.id}`,
          date: p.data || todayISO(),
          description: pagamentoDescription(p, nome),
          category: "Influenciadores",
          amount,
          kind: "despesa",
          source: "influenciador",
          clienteId: c.id,
          clienteNome: c.empresa,
          campanhaId: camp.id,
          campanhaNome: camp.nome,
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
      out.push({
        id: `sal:${m.id}:${iso}`,
        date: iso,
        description: `Salário — ${m.name}`,
        category: "Salários",
        amount,
        kind: "despesa",
        source: "salario",
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
      description: e.description,
      category: e.category || (e.kind === "receita" ? "Receita" : "Despesa"),
      amount: e.amount,
      kind: e.kind,
      source: "manual",
      clienteId: e.clienteId,
      clienteNome: cli?.empresa,
      campanhaId: e.campanhaId,
      campanhaNome: camp?.nome,
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
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const onStorage = () => {
      setManual(loadManual());
      setTick((t) => t + 1);
    };
    window.addEventListener("storage", onStorage);
    const int = window.setInterval(onStorage, 1500);
    const unsubManual = onManualChange(onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(int);
      unsubManual();
    };
  }, []);

  return useMemo(() => {
    void tick;
    return buildEntries(clientes, manual);
  }, [clientes, manual, tick]);
}
