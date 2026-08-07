import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderOpen,
  ImageIcon,
  Link as LinkIcon,
  Megaphone,
  Paperclip,
  Share2,
  ShieldCheck,
  Trash2,
  User,
  Wallet,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import FlowingMenu from "@/components/FlowingMenu";
import { useClientes, clientesStore } from "@/lib/clientes-store";
import {
  type Campaign,
  type PagTipo,
  type PagamentoConfig,
  normalizeCampaignPagGrupos,
} from "./VincularCampanhaDialog";
import { SectionHeader } from "./SectionHeader";
import { OPEN_CAMPANHA_TASK_KEY } from "./AppShell";
import { TaskBoard, type Task } from "./tasks/TaskBoard";
import {
  InfluencerBoard,
  BankFields,
  parseMoney,
  fmtBRL,
  fmtDate,
  normalizeInflus,
  totalAceito,
  canPublishEntrega,
  type ApprovalBadge,
  type Influ,
  type InfluStatus,
  type BankInfo,
  type Entrega,
} from "@/components/influenciadores/InfluencerBoard";
import { createApprovalLink, listApprovalsForCampanha } from "@/lib/approval.functions";
import { withRetry, friendlyNetworkError } from "@/lib/net-retry";
import { useConfirm } from "@/hooks/use-confirm";
import {
  type CampaignDoc,
  loadCampanhaInflus,
  saveCampanhaInflus,
  onCampanhaInflusChange,
  loadCampanhaTarefas,
  saveCampanhaTarefas,
  onCampanhaTarefasChange,
  loadCampanhaDocs,
  saveCampanhaDocs,
  onCampanhaDocsChange,
  deleteCampanhaScopedData,
} from "@/lib/campanha-scoped-store";

export { BankFields, type BankInfo };

/* ============================================================
 * Types & constants
 * ============================================================ */

type Row = { cliente: { id: string; empresa: string; photo?: string }; campanha: Campaign };

/* Task types shared via ./tasks/TaskBoard */
/* Influenciadores types/UI shared via @/components/influenciadores/InfluencerBoard */
/* Influs/tasks/docs persistence shared via @/lib/campanha-scoped-store */

/* ============================================================
 * Section root: list + navigate to detail
 * ============================================================ */

export function CampanhasSection() {
  const clientes = useClientes();
  const setClientes = clientesStore.set;
  const [openId, setOpenId] = useState<string | null>(null);
  const [initialTaskId, setInitialTaskId] = useState<string | undefined>(undefined);
  const { confirm, confirmDialog } = useConfirm();

  // Deep link vindo do indicador de timer ativo (AppShell) — abre direto a
  // campanha + tarefa cujo timer está rodando, em vez de só cair na lista.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(OPEN_CAMPANHA_TASK_KEY);
      if (!raw) return;
      sessionStorage.removeItem(OPEN_CAMPANHA_TASK_KEY);
      const parsed = JSON.parse(raw) as { campanhaId?: string; taskId?: string };
      if (parsed.campanhaId) {
        setOpenId(parsed.campanhaId);
        setInitialTaskId(parsed.taskId);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const rows: Row[] = useMemo(
    () =>
      clientes.flatMap((c) =>
        (c.campanhas ?? []).map((camp) => ({
          cliente: { id: c.id, empresa: c.empresa, photo: c.photo },
          campanha: camp,
        })),
      ),
    [clientes],
  );

  const current = openId ? (rows.find((r) => r.campanha.id === openId) ?? null) : null;

  if (current) {
    return (
      <CampanhaDetail
        row={current}
        onBack={() => setOpenId(null)}
        initialTaskId={initialTaskId}
        onInitialTaskHandled={() => setInitialTaskId(undefined)}
      />
    );
  }

  const today = new Date();
  const totalCampanhas = rows.length;
  const totalInflus = rows.reduce(
    (s, r) => s + r.campanha.linhas.reduce((a, l) => a + (l.quantidade || 0), 0),
    0,
  );
  const ativas = rows.filter((r) => {
    const p = r.campanha.prazo ? new Date(r.campanha.prazo) : null;
    return !p || p >= today;
  }).length;

  return (
    <div className="mx-auto w-full max-w-6xl">
      <SectionHeader
        title="Campanhas"
        subtitle="Todas as campanhas vinculadas aos clientes."
        kpis={[
          { label: "TOTAL", value: totalCampanhas },
          { label: "ATIVAS", value: ativas, tone: "text-emerald-600 dark:text-emerald-400" },
          { label: "INFLUENCIADORES", value: totalInflus, tone: "text-sky-600 dark:text-sky-400" },
        ]}
      />

      <div className="mt-8">
        {rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhuma campanha vinculada ainda.
          </div>
        ) : (
          <FlowingMenu
            items={rows.map((r) => {
              const planejados = r.campanha.linhas.reduce((s, l) => s + (l.quantidade || 0), 0);
              const prazo =
                r.campanha.pagClienteTipo === "Recorrente"
                  ? `Mensal · dia ${r.campanha.pagClienteRecorrenteDia ?? "—"}`
                  : `Prazo ${fmtDate(r.campanha.prazo)}`;
              return {
                id: r.campanha.id,
                text: r.campanha.nome,
                subtitle: `${r.cliente.empresa} · ${prazo} · ${planejados} influs`,
                image: r.cliente.photo,
                onSelect: () => setOpenId(r.campanha.id),
                rightSlot: (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      const ok = await confirm(`Excluir a campanha "${r.campanha.nome}"?`);
                      if (!ok) return;
                      setClientes((prev) =>
                        prev.map((c) =>
                          c.id === r.cliente.id
                            ? {
                                ...c,
                                campanhas: (c.campanhas ?? []).filter(
                                  (x) => x.id !== r.campanha.id,
                                ),
                              }
                            : c,
                        ),
                      );
                      // Sem isso, influs/tarefas/docs escopados a essa campanha
                      // ficavam órfãos no banco (a campanha some daqui, mas
                      // essas linhas continuam existindo e reaparecem em telas
                      // que agregam tudo, tipo "Meu trabalho" no Início).
                      deleteCampanhaScopedData(r.campanha.id);
                    }}
                    className="rounded-md bg-background/80 p-1.5 text-muted-foreground backdrop-blur hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Excluir campanha"
                    title="Excluir campanha"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ),
              };
            })}
          />
        )}
      </div>
      {confirmDialog}
    </div>
  );
}

/* ============================================================
 * Detail page
 * ============================================================ */

/** Resumo com o valor/config de cada tipo de pagamento, pro badge não mostrar só o nome do tipo. */
function pagTipoResumo(t: PagTipo, cfg: PagamentoConfig): string {
  if (t === "Valor") return cfg.valor ? fmtBRL(parseMoney(cfg.valor)) : "";
  if (t === "Por Hora") return cfg.porHoraValor ? `${fmtBRL(parseMoney(cfg.porHoraValor))}/h` : "";
  if (t === "Comissão")
    return cfg.comissaoPct ? `${cfg.comissaoPct}% sobre ${cfg.comissaoSobre || "vendas"}` : "";
  if (t === "Permuta") return cfg.permutaDescricao || "";
  return cfg.outroValor ? fmtBRL(parseMoney(cfg.outroValor)) : (cfg.outroDescricao ?? "");
}

function CampanhaDetail({
  row,
  onBack,
  initialTaskId,
  onInitialTaskHandled,
}: {
  row: Row;
  onBack: () => void;
  initialTaskId?: string;
  onInitialTaskHandled?: () => void;
}) {
  const { campanha: c, cliente } = row;
  const isRecorrente = c.pagClienteTipo === "Recorrente";
  const now = new Date();
  const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [monthFilter, setMonthFilter] = useState<string>(defaultMonth);
  const monthOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    const startStr = c.pagClienteRecorrenteInicio;
    const start = startStr
      ? new Date(startStr + "T00:00:00")
      : new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 6, 1);
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end) {
      const v = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
      const label = cur.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
      opts.push({
        value: v,
        label: label.charAt(0).toUpperCase() + label.slice(1),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
    return opts;
  }, [c.pagClienteRecorrenteInicio]);
  const totalInflus = c.linhas.reduce((s, l) => s + (l.quantidade || 0), 0);
  const totalEnviar = c.linhas.reduce((s, l) => s + (l.enviar || 0), 0);

  // Campanhas recorrentes reaproveitam a mesma página mês a mês — sem
  // separar por mês de criação, tarefas e influenciadores de todos os
  // ciclos ficavam empilhados juntos, misturando meses diferentes. O
  // filtro de mês já existia no seletor mas nunca era de fato aplicado.
  const inSelectedMonth = (createdAt: string | undefined) => {
    if (!isRecorrente) return true;
    if (!createdAt) return false;
    return createdAt.slice(0, 7) === monthFilter;
  };

  const [influs, setInflus] = useState<Influ[]>(() => normalizeInflus(loadCampanhaInflus(c.id)));
  const persistInflus = (next: Influ[]) => {
    setInflus(next);
    saveCampanhaInflus(c.id, next);
  };
  useEffect(
    () => onCampanhaInflusChange(() => setInflus(normalizeInflus(loadCampanhaInflus(c.id)))),
    [c.id],
  );

  const [docs, setDocs] = useState<CampaignDoc[]>(() => loadCampanhaDocs(c.id));
  const persistDocs = (next: CampaignDoc[]) => {
    setDocs(next);
    saveCampanhaDocs(c.id, next);
  };
  useEffect(() => onCampanhaDocsChange(() => setDocs(loadCampanhaDocs(c.id))), [c.id]);

  // Só os influenciadores/tarefas criados dentro do mês selecionado (campanha
  // recorrente). Passamos esse subconjunto pros componentes filhos, mas ao
  // salvar reconciliamos de volta com os itens escondidos (`hiddenInflus`/
  // `hiddenTasks`) — senão o onChange deles, construído só a partir do que
  // recebeu, sobrescreveria a campanha inteira e apagaria os outros meses.
  const visibleInflus = useMemo(
    () => influs.filter((i) => inSelectedMonth(i.createdAt)),
    [influs, monthFilter, isRecorrente],
  );
  const hiddenInflus = useMemo(
    () => influs.filter((i) => !inSelectedMonth(i.createdAt)),
    [influs, monthFilter, isRecorrente],
  );
  const persistVisibleInflus = (next: Influ[]) => persistInflus([...hiddenInflus, ...next]);

  // Approval metrics
  const enviados = visibleInflus.filter((i) => i.status !== "Lista").length;
  // Qualquer status a partir de "Aprovado" (Aguardando roteiro, Em gravação,
  // ..., Pago) já passou pela aprovação — continua contando como aprovado.
  const aprovados = visibleInflus.filter((i) => canPublishEntrega(i.status)).length;
  // KPI reflete só a coluna "Enviado para aprovação" — antes também contava
  // "Aprovação de conteúdo" (etapa seguinte, já aprovado como influenciador),
  // o que inflava o número em relação ao que a coluna realmente mostra.
  const emAprovacao = visibleInflus.filter((i) => i.status === "Enviado para aprovação").length;

  // Budget
  const orcamento = parseMoney(c.orcamento);
  const gasto = visibleInflus.reduce((sum, i) => sum + totalAceito(i.entregas), 0);
  const disponivel = Math.max(0, orcamento - gasto);
  const pctGasto = orcamento > 0 ? Math.min(100, (gasto / orcamento) * 100) : 0;
  const overBudget = orcamento > 0 && gasto > orcamento;

  // Tasks
  const [tasks, setTasks] = useState<Task[]>(() => loadCampanhaTarefas(c.id));
  const persistTasks = (next: Task[]) => {
    setTasks(next);
    saveCampanhaTarefas(c.id, next);
  };
  useEffect(() => onCampanhaTarefasChange(() => setTasks(loadCampanhaTarefas(c.id))), [c.id]);

  const visibleTasks = useMemo(
    () => tasks.filter((t) => inSelectedMonth(t.createdAt)),
    [tasks, monthFilter, isRecorrente],
  );
  const hiddenTasks = useMemo(
    () => tasks.filter((t) => !inSelectedMonth(t.createdAt)),
    [tasks, monthFilter, isRecorrente],
  );
  const persistVisibleTasks = (next: Task[]) => persistTasks([...hiddenTasks, ...next]);

  // Public approval links — tie client responses back into the influencer's
  // status (and therefore the campaign KPIs above) as soon as they come in.
  const { approvalStatusFor, refresh: refreshApprovals } = useInfluencerApprovals(c.id);
  useEffect(() => {
    let changed = false;
    const next = influs.map((i) => {
      const badge = approvalStatusFor(i.id);
      if (
        badge?.status === "aprovado" &&
        (i.status === "Lista" || i.status === "Enviado para aprovação")
      ) {
        changed = true;
        return { ...i, status: "Aprovado" as InfluStatus };
      }
      return i;
    });
    if (changed) persistInflus(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvalStatusFor, influs]);

  const [openPanel, setOpenPanel] = useState<
    null | "documentos" | "calendario" | "composicao" | "direitos"
  >(null);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [approvalInitialMode, setApprovalInitialMode] = useState<"approve" | "view">("approve");

  return (
    <div className="mx-auto w-full max-w-6xl space-y-10">
      {/* BACK */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar
      </button>

      {/* HEADER — foto em destaque + nome campanha + cliente */}
      <header className="flex items-center gap-5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-muted ring-1 ring-border">
          {cliente.photo ? (
            <img src={cliente.photo} alt={cliente.empresa} className="h-full w-full object-cover" />
          ) : (
            <Megaphone className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-widest text-muted-foreground">
            {cliente.empresa}
          </p>
          <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight text-foreground">
            {c.nome}
          </h1>
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" /> Prazo {fmtDate(c.prazo)}
            {c.prazoPag && <span className="ml-2">· Pagto. {c.prazoPag}</span>}
            {isRecorrente && <span className="ml-2">· Recorrente</span>}
          </p>
        </div>
        {isRecorrente && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Mês</label>
            <select
              value={monthFilter}
              onChange={(e) => setMonthFilter(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs capitalize focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value} className="capitalize">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </header>

      {/* BRIEFING */}
      <section className="rounded-xl border border-border bg-background p-6">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Briefing
        </h2>
        <div className="mt-3">
          {c.briefing ? (
            <p className="whitespace-pre-wrap text-sm text-foreground">{c.briefing}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum briefing cadastrado.</p>
          )}
          {c.briefingFile && (
            <a
              href={c.briefingFile}
              download
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-foreground underline underline-offset-2"
            >
              <Paperclip className="h-3.5 w-3.5" /> Anexo
            </a>
          )}
          {(c.briefingLinks?.length ?? 0) > 0 && (
            <ul className="mt-4 space-y-1.5">
              {c.briefingLinks!.map((url) => (
                <li key={url}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 truncate text-xs font-medium text-foreground underline underline-offset-2"
                  >
                    <LinkIcon className="h-3.5 w-3.5 shrink-0" /> {url}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {/* KPIs — uma linha, minimalista */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 border-y border-border py-5 md:grid-cols-6">
        <Kpi label="Planejado" value={totalInflus.toString()} />
        <Kpi label="Enviados" value={`${enviados}/${totalEnviar}`} />
        <Kpi label="Em aprovação" value={emAprovacao.toString()} />
        <Kpi label="Aprovados" value={aprovados.toString()} />
        <Kpi label="Orçamento" value={orcamento > 0 ? fmtBRL(orcamento) : "—"} />
        <Kpi
          label="Gasto"
          value={fmtBRL(gasto)}
          tone={overBudget ? "danger" : "default"}
          hint={
            orcamento > 0 ? `${Math.round(pctGasto)}% · ${fmtBRL(disponivel)} livre` : undefined
          }
        />
      </div>

      {/* FERRAMENTAS ADICIONAIS — informações secundárias, abertas sob demanda */}
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Ferramentas adicionais
        </h2>
        <div className="flex flex-wrap gap-2">
          <FeatureButton
            icon={FolderOpen}
            label="Documentos"
            count={docs.length}
            onClick={() => setOpenPanel("documentos")}
          />
          <FeatureButton
            icon={CalendarClock}
            label="Calendário da campanha"
            onClick={() => setOpenPanel("calendario")}
          />
          <FeatureButton
            icon={Wallet}
            label="Composição & pagamentos"
            onClick={() => setOpenPanel("composicao")}
          />
          <FeatureButton
            icon={ShieldCheck}
            label="Direitos de imagem"
            active={c.direitosImagem?.permitido}
            onClick={() => setOpenPanel("direitos")}
          />
        </div>
      </section>

      <TaskBoard
        tasks={visibleTasks}
        onChange={persistVisibleTasks}
        scope={{ kind: "campanha", id: c.id }}
        initialOpenTaskId={initialTaskId}
        onInitialOpenTaskHandled={onInitialTaskHandled}
      />

      <InfluencerBoard
        influs={visibleInflus}
        onChange={persistVisibleInflus}
        exportName={c.nome}
        approvalStatusFor={approvalStatusFor}
        pagGrupos={normalizeCampaignPagGrupos(c)}
        headerExtra={(closeMenu) => (
          <>
            <button
              type="button"
              onClick={() => {
                setApprovalInitialMode("approve");
                setApprovalDialogOpen(true);
                closeMenu();
              }}
              disabled={visibleInflus.length === 0}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Share2 className="h-3.5 w-3.5" />
              Solicitar aprovação
            </button>
            <button
              type="button"
              onClick={() => {
                setApprovalInitialMode("view");
                setApprovalDialogOpen(true);
                closeMenu();
              }}
              disabled={visibleInflus.length === 0}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Eye className="h-3.5 w-3.5" />
              Link de visualização
            </button>
          </>
        )}
      />

      <ApprovalRequestDialog
        open={approvalDialogOpen}
        onOpenChange={setApprovalDialogOpen}
        initialMode={approvalInitialMode}
        influs={visibleInflus}
        campanhaId={c.id}
        campanhaNome={c.nome}
        clienteNome={cliente.empresa}
        totalPlanejado={totalInflus}
        onCreated={refreshApprovals}
      />

      <GaleriaConteudosSection influs={visibleInflus} />

      <Dialog open={openPanel === "documentos"} onOpenChange={(o) => !o && setOpenPanel(null)}>
        <DialogContent className="max-w-xl border-border bg-card">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <FolderOpen className="h-4 w-4" /> Documentos
          </DialogTitle>
          <DialogDescription className="sr-only">
            Anexos e links de referência da campanha.
          </DialogDescription>
          <DocumentosSection docs={docs} onChange={persistDocs} />
        </DialogContent>
      </Dialog>

      <Dialog open={openPanel === "calendario"} onOpenChange={(o) => !o && setOpenPanel(null)}>
        <DialogContent className="max-w-2xl border-border bg-card">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarClock className="h-4 w-4" /> Calendário da campanha
          </DialogTitle>
          <DialogDescription className="sr-only">
            Datas e prazos importantes da campanha.
          </DialogDescription>
          <CampaignCalendar campanha={c} influs={visibleInflus} />
        </DialogContent>
      </Dialog>

      <Dialog open={openPanel === "composicao"} onOpenChange={(o) => !o && setOpenPanel(null)}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Wallet className="h-4 w-4" /> Composição & pagamentos
          </DialogTitle>
          <DialogDescription className="sr-only">
            Composição planejada e formas de pagamento da campanha.
          </DialogDescription>
          <div className="space-y-5">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Composição planejada
              </h3>
              {c.linhas.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                  {c.linhas.map((l) => (
                    <span
                      key={l.id}
                      className="rounded-md border border-border bg-muted/40 px-2 py-1 text-foreground"
                    >
                      {l.quantidade}× {l.tipo || "—"} · {l.tamanho || "—"}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">—</p>
              )}
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Formas de pagamento
              </h3>
              {normalizeCampaignPagGrupos(c).length > 0 ? (
                <div className="mt-3 space-y-2">
                  {normalizeCampaignPagGrupos(c).map((grupo) => (
                    <div key={grupo.id}>
                      <p className="text-[11px] font-medium text-muted-foreground">{grupo.nome}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        {grupo.tipos.map((t) => {
                          const resumo = pagTipoResumo(t, grupo.config[t] ?? {});
                          return (
                            <span
                              key={t}
                              className="rounded-md border border-border bg-muted/40 px-2 py-1 text-foreground"
                            >
                              <span className="font-medium">{t}</span>
                              {resumo && <span className="text-muted-foreground"> · {resumo}</span>}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">—</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={openPanel === "direitos"} onOpenChange={(o) => !o && setOpenPanel(null)}>
        <DialogContent className="max-w-md border-border bg-card">
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <ShieldCheck className="h-4 w-4" /> Direitos de imagem
          </DialogTitle>
          <DialogDescription className="sr-only">
            Regras de uso do conteúdo dos influenciadores nesta campanha.
          </DialogDescription>
          {c.direitosImagem?.permitido ? (
            <div className="space-y-3 text-sm">
              {c.direitosImagem.usos.length > 0 && (
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {c.direitosImagem.usos.map((u) => (
                    <span
                      key={u}
                      className="rounded-md border border-border bg-muted/40 px-2 py-1 text-foreground"
                    >
                      {u}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-foreground">
                Duração:{" "}
                <span className="text-muted-foreground">
                  {c.direitosImagem.duracaoDias
                    ? `${c.direitosImagem.duracaoDias} dias`
                    : "Indeterminada"}
                </span>
              </p>
              {c.direitosImagem.exclusividade && (
                <p className="text-foreground">
                  Exclusividade:{" "}
                  <span className="text-muted-foreground">
                    {c.direitosImagem.exclusividadeSegmento || "Sim"}
                  </span>
                </p>
              )}
              {c.direitosImagem.observacoes && (
                <p className="whitespace-pre-wrap text-muted-foreground">
                  {c.direitosImagem.observacoes}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Nenhum direito de uso de imagem definido para esta campanha.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FeatureButton({
  icon: Icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">
          {count}
        </span>
      )}
      {active && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />}
    </button>
  );
}

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type CalendarEvent = { label: string; tone: "inicio" | "prazo" | "postagem" | "pagamento" };

/**
 * Mini calendário mensal com os marcos da campanha: início, prazo, e a
 * data de postagem/pagamento de cada entrega de cada influenciador.
 */
function CampaignCalendar({ campanha: c, influs }: { campanha: Campaign; influs: Influ[] }) {
  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    const add = (date: string | undefined, ev: CalendarEvent) => {
      if (!date) return;
      const arr = map.get(date) ?? [];
      arr.push(ev);
      map.set(date, arr);
    };
    add(c.dataInicio, { label: "Início da campanha", tone: "inicio" });
    add(c.prazo, { label: "Prazo da campanha", tone: "prazo" });
    for (const i of influs) {
      for (const e of i.entregas) {
        add(e.dataPostagem, { label: `Postagem · ${i.nome} (${e.tipo})`, tone: "postagem" });
        add(e.pagamento?.data, { label: `Pagamento · ${i.nome}`, tone: "pagamento" });
      }
    }
    return map;
  }, [c.dataInicio, c.prazo, influs]);

  const initialCursor = useMemo(() => {
    const first = c.dataInicio ?? c.prazo;
    return first ? new Date(first + "T00:00:00") : new Date();
  }, [c.dataInicio, c.prazo]);
  const [cursor, setCursor] = useState(initialCursor);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startOffset = first.getDay();
  const startDate = new Date(first);
  startDate.setDate(first.getDate() - startOffset);
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    cells.push(d);
  }
  const today = toISODate(new Date());
  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const toneDot: Record<CalendarEvent["tone"], string> = {
    inicio: "bg-sky-500",
    prazo: "bg-amber-500",
    postagem: "bg-violet-500",
    pagamento: "bg-emerald-500",
  };

  const sortedUpcoming = useMemo(
    () => Array.from(eventsByDate.entries()).sort(([a], [b]) => (a < b ? -1 : 1)),
    [eventsByDate],
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Mês anterior"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-medium capitalize text-foreground">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Próximo mês"
        >
          <ArrowLeft className="h-4 w-4 rotate-180" />
        </button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border">
        <div className="grid grid-cols-7 border-b border-border bg-muted/30">
          {DIAS_LABEL.map((d) => (
            <div
              key={d}
              className="px-2 py-1.5 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((d, idx) => {
            const iso = toISODate(d);
            const inMonth = d.getMonth() === cursor.getMonth();
            const isToday = iso === today;
            const isSelected = iso === selectedDate;
            const items = eventsByDate.get(iso) ?? [];
            return (
              <button
                type="button"
                key={idx}
                onClick={() => setSelectedDate((prev) => (prev === iso ? null : iso))}
                className={`h-20 overflow-hidden border-b border-r border-border p-1.5 text-left align-top transition-colors hover:bg-muted/40 ${
                  inMonth ? "" : "bg-background/40 text-muted-foreground/50"
                } ${isSelected ? "bg-muted/60" : ""}`}
              >
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] tabular-nums ${
                    isToday ? "border border-foreground/40" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
                <div className="mt-1 space-y-0.5">
                  {items.slice(0, 2).map((ev, i) => (
                    <div key={i} className="flex items-center gap-1 truncate text-[10px]">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[ev.tone]}`} />
                      <span className="truncate text-muted-foreground">{ev.label}</span>
                    </div>
                  ))}
                  {items.length > 2 && (
                    <div className="text-[9px] font-medium text-muted-foreground">
                      +{items.length - 2} evento{items.length - 2 === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Em vez de listar todas as datas com todos os eventos (o que deixava
          o painel excessivamente comprido em campanhas com muita coisa
          marcada), mostra só o dia selecionado no grid — com scroll interno
          como segunda trava de segurança caso o dia tenha muitos eventos. */}
      {selectedDate ? (
        <div className="rounded-lg border border-border p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {fmtDate(selectedDate)}
          </p>
          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {(eventsByDate.get(selectedDate) ?? []).map((ev, i) => (
              <div key={i} className="flex items-center gap-1.5 text-sm">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${toneDot[ev.tone]}`} />
                <span className="text-foreground">{ev.label}</span>
              </div>
            ))}
          </div>
        </div>
      ) : sortedUpcoming.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Clique num dia com eventos para ver os detalhes.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhuma data cadastrada ainda.</p>
      )}
    </div>
  );
}

/* ============================================================
 * Aprovação de influenciadores — link público para o cliente aprovar
 * ou reprovar os influenciadores selecionados (com foto, nome e redes),
 * exigindo motivo em caso de reprovação. O botão fica ao lado de
 * "Baixar lista" no board de Influenciadores, e o resultado aparece
 * como um ícone no próprio card do influenciador — sem seção própria.
 * ============================================================ */

type ApprovalResponse = { status: "aprovado" | "reprovado"; motivo?: string; respondedAt: string };
type ApprovalRow = {
  id: string;
  token: string;
  influencers: { id: string; nome: string; foto?: string }[];
  responses: Record<string, ApprovalResponse>;
  created_at: string;
};

/** Fetches this campaign's approval links + keeps them live via realtime, exposing a per-influencer badge lookup. */
function useInfluencerApprovals(campanhaId: string) {
  const listFn = useServerFn(listApprovalsForCampanha);
  const [links, setLinks] = useState<ApprovalRow[]>([]);

  const refresh = useCallback(() => {
    void listFn({ data: { campanhaId } })
      .then((rows) => setLinks(rows as ApprovalRow[]))
      .catch(() => undefined);
  }, [campanhaId, listFn]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel(`rt-influencer-approvals-${campanhaId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "influencer_approvals",
          filter: `campanha_id=eq.${campanhaId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => void supabase.removeChannel(channel);
  }, [campanhaId, refresh]);

  const approvalStatusFor = useCallback(
    (influId: string): ApprovalBadge | undefined => {
      let latest: ApprovalResponse | undefined;
      for (const link of links) {
        const r = link.responses[influId] as ApprovalResponse | undefined;
        if (r && (!latest || r.respondedAt > latest.respondedAt)) latest = r;
      }
      return latest ? { status: latest.status, motivo: latest.motivo } : undefined;
    },
    [links],
  );

  return { links, refresh, approvalStatusFor };
}

/**
 * Diálogo de "solicitar aprovação / gerar link de visualização" — renderizado
 * como irmão do InfluencerBoard (não dentro do dropdown "Exportar"). Antes
 * vivia dentro do próprio botão que abria o dropdown; como o dropdown se
 * fecha (desmontando seu conteúdo) assim que o diálogo abre, o estado
 * `open=true` era destruído no mesmo clique que o criava, e o diálogo nunca
 * chegava a aparecer. Vive aqui, fora dessa árvore, controlado por
 * `open`/`onOpenChange` vindos do componente pai.
 */
function ApprovalRequestDialog({
  open,
  onOpenChange,
  initialMode = "approve",
  influs,
  campanhaId,
  campanhaNome,
  clienteNome,
  totalPlanejado,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialMode?: "approve" | "view";
  influs: Influ[];
  campanhaId: string;
  campanhaNome: string;
  clienteNome: string;
  totalPlanejado: number;
  onCreated: () => void;
}) {
  const createLinkFn = useServerFn(createApprovalLink);
  const [mode, setMode] = useState<"approve" | "view">("approve");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const linkFor = (token: string) => `${window.location.origin}/aprovacao/${token}`;
  const copyLink = (token: string) => {
    void navigator.clipboard.writeText(linkFor(token)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Reseta o formulário sempre que o diálogo é reaberto.
  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setMode(initialMode);
    setNewToken(null);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async () => {
    if (selected.size === 0) return;
    setCreating(true);
    setError("");
    try {
      const chosen = influs.filter((i) => selected.has(i.id));
      const { token } = await withRetry(() =>
        createLinkFn({
          data: {
            campanhaId,
            campanhaNome,
            clienteNome,
            totalPlanejado,
            influencers: chosen.map((i) => ({
              id: i.id,
              nome: i.nome,
              nicho: i.nicho,
              foto: i.foto,
              redes: i.redes.map((r) => ({
                id: r.id,
                plataforma: r.plataforma,
                handle: r.handle,
                seguidores: r.seguidores,
              })),
              entregas: i.entregas.map((e) => {
                const roteiro = e.anexos?.find((a) => a.categoria === "Roteiro");
                return {
                  id: e.id,
                  tipo: e.tipo,
                  quantidade: e.quantidade,
                  dataPostagem: e.dataPostagem,
                  roteiro: roteiro?.url,
                  roteiroNome: roteiro?.nome,
                  metrics: e.metrics,
                };
              }),
              profileMetrics: i.profileMetrics?.porRede,
            })),
            mode,
          },
        }),
      );
      setNewToken(token);
      onCreated();
    } catch (e) {
      setError(friendlyNetworkError(e, "Não foi possível gerar o link."));
    } finally {
      setCreating(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-foreground/60 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg border border-border bg-background">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold">
            {mode === "view" ? "Gerar link de visualização" : "Solicitar aprovação"}
          </h3>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {newToken ? (
          <div className="space-y-3 px-5 py-6">
            <p className="text-sm text-foreground">Link gerado com sucesso.</p>
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
              <span className="flex-1 truncate">{linkFor(newToken)}</span>
              <button
                type="button"
                onClick={() => copyLink(newToken)}
                className="shrink-0 text-foreground hover:opacity-70"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-2 w-full rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              Concluir
            </button>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-5 py-4">
              <div className="mb-3 flex gap-1 rounded-md bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setMode("approve")}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                    mode === "approve"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Solicitar aprovação
                </button>
                <button
                  type="button"
                  onClick={() => setMode("view")}
                  className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                    mode === "view"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Somente visualização
                </button>
              </div>
              <p className="mb-2 text-xs text-muted-foreground">
                {mode === "view"
                  ? "Selecione quem aparece no link — mostra só foto, nome e rede social, sem aprovar/reprovar."
                  : "Selecione quem enviar para aprovação do cliente."}
              </p>
              {influs.map((i) => (
                <label
                  key={i.id}
                  className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(i.id)}
                    onChange={() => toggle(i.id)}
                    className="h-4 w-4 rounded border-input"
                  />
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                    {i.foto ? (
                      <img src={i.foto} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <span className="min-w-0 flex-1 truncate text-sm">{i.nome || "Sem nome"}</span>
                </label>
              ))}
            </div>
            {error && <p className="px-5 text-xs text-destructive">{error}</p>}
            <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={selected.size === 0 || creating}
                className="rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {creating ? "Gerando..." : `Gerar link (${selected.size})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
 * Galeria de conteúdos — entregas publicadas de todos os
 * influenciadores da campanha, em formato de galeria com foto e
 * nome do influenciador para facilitar o acesso.
 * ============================================================ */

function GaleriaConteudosSection({ influs }: { influs: Influ[] }) {
  const isImage = (nome?: string) => !!nome && /\.(png|jpe?g|gif|webp|svg)$/i.test(nome);

  const items = influs.flatMap((i) =>
    i.entregas
      .filter((e) => e.status === "publicado")
      .flatMap((e) => {
        const publicados = (e.anexos ?? []).filter((a) => a.categoria === "Conteúdo publicado");
        const galeria: { influ: Influ; entrega: Entrega; nome?: string; url: string }[] = [];
        if (publicados.length > 0) {
          publicados.forEach((a) =>
            galeria.push({ influ: i, entrega: e, nome: a.nome, url: a.url }),
          );
        } else if (e.url) {
          galeria.push({ influ: i, entrega: e, url: e.url });
        }
        return galeria;
      }),
  );

  if (items.length === 0) return null;

  return (
    <section className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Galeria de conteúdos
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map(({ influ, entrega, nome, url }, idx) => {
          const showImage = isImage(nome);
          return (
            <a
              key={`${entrega.id}-${idx}`}
              href={url}
              target={nome ? undefined : "_blank"}
              rel="noreferrer"
              download={nome}
              className="group overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-foreground/30"
            >
              <div className="flex aspect-square items-center justify-center overflow-hidden bg-muted">
                {showImage ? (
                  <img
                    src={url}
                    alt={entrega.titulo ?? entrega.tipo}
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
                    <ImageIcon className="h-6 w-6" strokeWidth={1.5} />
                    <span className="text-[11px]">{entrega.tipo}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 p-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                  {influ.foto ? (
                    <img src={influ.foto} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-3 w-3 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{influ.nome}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {entrega.titulo || entrega.tipo}
                  </p>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

/* ============================================================
 * Documentos — anexos e links de referência da campanha.
 * ============================================================ */

function DocumentosSection({
  docs,
  onChange,
}: {
  docs: CampaignDoc[];
  onChange: (next: CampaignDoc[]) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [url, setUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const addLink = () => {
    const u = url.trim();
    if (!u) return;
    onChange([
      ...docs,
      {
        id: crypto.randomUUID(),
        tipo: "link",
        titulo: titulo.trim() || u,
        url: u,
        criadoEm: new Date().toISOString(),
      },
    ]);
    setTitulo("");
    setUrl("");
  };

  const addFile = (file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      onChange([
        ...docs,
        {
          id: crypto.randomUUID(),
          tipo: "anexo",
          titulo: titulo.trim() || file.name,
          url: String(r.result),
          arquivoNome: file.name,
          criadoEm: new Date().toISOString(),
        },
      ]);
      setTitulo("");
    };
    r.readAsDataURL(file);
  };

  const remove = (id: string) => onChange(docs.filter((d) => d.id !== id));

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Documentos
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {docs.length} {docs.length === 1 ? "documento" : "documentos"} · anexos e links de
          referência.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Título (opcional)"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addLink()}
            placeholder="Colar link (https://…)"
            className="h-9 min-w-[200px] flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={addLink}
            disabled={!url.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <LinkIcon className="h-3.5 w-3.5" /> Adicionar link
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              addFile(e.target.files?.[0]);
              if (fileRef.current) fileRef.current.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Paperclip className="h-3.5 w-3.5" /> Anexar arquivo
          </button>
        </div>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum documento adicionado ainda.
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-background">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                {d.tipo === "link" ? (
                  <LinkIcon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <FileText className="h-4 w-4 text-muted-foreground" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{d.titulo}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {d.tipo === "link" ? d.url : (d.arquivoNome ?? "Arquivo")}
                </p>
              </div>
              <a
                href={d.url}
                target={d.tipo === "link" ? "_blank" : undefined}
                rel="noreferrer"
                download={d.tipo === "anexo" ? d.arquivoNome : undefined}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Abrir"
              >
                {d.tipo === "link" ? (
                  <ExternalLink className="h-4 w-4" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </a>
              <button
                type="button"
                onClick={() => remove(d.id)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                aria-label="Remover"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-1.5 truncate text-lg font-semibold tabular-nums ${
          tone === "danger" ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
