import { useEffect, useMemo, useState } from "react";
import { useClientes, type Cliente } from "@/lib/clientes-store";
import { createTableArrayStore } from "@/lib/table-array-store";
import type { BankInfo } from "@/components/CampanhasSection";
import {
  pagamentoCashValue,
  normalizePagamento,
  type Entrega,
  type PagamentoEntrega,
} from "@/components/influenciadores/InfluencerBoard";

export type Kind = "receita" | "despesa";
export type Source = "manual" | "influenciador" | "salario" | "campanha";

export type InvoiceFile = { name: string; dataUrl: string };

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
};

type InfluPersisted = { id: string; nome: string; entregas?: Entrega[]; bank?: BankInfo };

function pagamentoDescription(p: PagamentoEntrega, entregaTipo: string, nome: string): string {
  if (p.tipos.includes("Valor")) return `Pagamento a ${nome} — ${entregaTipo}`;
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
  return new Date().toISOString().slice(0, 10);
}

export { formatIsoDate } from "./utils";

const manualStore = createTableArrayStore<ManualEntry>("financeiro_lancamentos");

export function initFinanceiroSync(): Promise<void> {
  const p = manualStore.init();
  manualStore.subscribeRealtime();
  return p;
}

export function loadManual(): ManualEntry[] {
  return manualStore.get();
}
export function saveManual(list: ManualEntry[]) {
  manualStore.set(() => list);
}
export function onManualChange(callback: () => void): () => void {
  return manualStore.subscribe(callback);
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
        for (const e of inf.entregas ?? []) {
          const p = normalizePagamento(e.pagamento);
          // Só vira despesa real no Financeiro depois que o orçamento é aceito —
          // combinado (pendente) ou recusado não entram no caixa.
          if (!p || p.aprovacao !== "aceito") continue;
          const amount = pagamentoCashValue(p);
          const nome = inf.nome || "influenciador";
          const outroCriterios = p.tipos.includes("Outro")
            ? p.config.Outro?.outroCriterios
            : undefined;
          out.push({
            id: `inf:${camp.id}:${inf.id}:${e.id}`,
            date: p.data || e.publicadoEm || todayISO(),
            description: pagamentoDescription(p, e.tipo, nome),
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
      }
      // Nota: o "Outro" configurado num grupo de pagamento da campanha (aqui,
      // na criação/edição) é só uma orientação para o time sobre como pagar
      // — não é lançado automaticamente no Financeiro. Só vira despesa real
      // quando efetivamente aceito por entrega (loop acima, com aprovacao
      // === "aceito"), igual aos outros tipos de pagamento.
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
