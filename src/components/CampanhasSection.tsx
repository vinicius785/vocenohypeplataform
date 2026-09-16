import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft,
  Calendar,
  CalendarClock,
  Check,
  ChevronDown,
  Download,
  ExternalLink,
  FileBarChart,
  FileText,
  FolderOpen,
  ImageIcon,
  Link as LinkIcon,
  Loader2,
  Megaphone,
  MoreVertical,
  Paperclip,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/EmptyState";
import { ClienteLogo } from "@/components/clientes/ClienteLogo";
import { useClientes, clientesStore, type Cliente } from "@/lib/clientes-store";
import {
  VincularCampanhaDialog,
  type Campaign,
  type PagTipo,
  type PagamentoConfig,
} from "./VincularCampanhaDialog";
import { InscricaoPageDialog } from "./campanhas/InscricaoPageDialog";
import { CampanhaCard } from "./campanhas/CampanhaCard";
import { CampanhaFiltersBar } from "./campanhas/CampanhaFiltersBar";
import { SelecionarClienteDialog } from "./campanhas/SelecionarClienteDialog";
import {
  campanhaStatus,
  filterCampanhas,
  sortCampanhas,
  DEFAULT_CAMPANHA_FILTERS,
  CAMPANHA_STATUS_LABEL,
  getEligibleCampaignInfluencers,
  getEligibleCampaignDeliveries,
  type CampanhaFiltersState,
  type CampanhaRow,
} from "./campanhas/campanha-ui";
import { buildMesReferenciaOptions } from "@/lib/inscricao-page";
import { PageContainer } from "@/components/shared/PageContainer";
import { OPEN_CAMPANHA_TASK_KEY, OPEN_CAMPANHA_TASK_EVENT } from "./AppShell";
import { TaskBoard, type Task } from "./tasks/TaskBoard";
import {
  InfluencerBoard,
  BankFields,
  parseMoney,
  fmtBRL,
  fmtDate,
  normalizeInflus,
  totalAceito,
  type Influ,
  type InfluStatus,
  type BankInfo,
  type Entrega,
} from "@/components/influenciadores/InfluencerBoard";
import {
  ENTREGA_STAGE_LABEL,
  ENTREGA_STAGE_TONE,
  nextActionForEntrega,
  NEXT_ACTOR_LABEL,
} from "@/lib/campanha-status";
import { withRetry, friendlyNetworkError } from "@/lib/net-retry";
import { useConfirm } from "@/hooks/use-confirm";
import { formatIsoDate } from "@/lib/utils";
import {
  type RelatorioMensal,
  mesLabel,
  uploadRelatorioMensalPdf,
  getRelatorioMensalUrl,
  deleteRelatorioMensalPdf,
} from "@/lib/relatorio-mensal";
import {
  type CampaignDoc,
  loadCampanhaInflus,
  saveCampanhaInflus,
  onCampanhaInflusChange,
  getAllCampanhaInflus,
  loadCampanhaTarefas,
  saveCampanhaTarefas,
  onCampanhaTarefasChange,
  loadCampanhaDocs,
  saveCampanhaDocs,
  onCampanhaDocsChange,
  loadCampanhaCronograma,
  saveCampanhaCronograma,
  onCampanhaCronogramaChange,
  deleteCampanhaScopedData,
  type CronogramaItem,
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
  // Lê no mount (chegando de outra aba) E escuta o evento (já estando aqui
  // — sem isso, clicar no indicador enquanto já em Campanhas não fazia
  // nada, já que nenhum remount acontece pra reler o sessionStorage).
  useEffect(() => {
    const openFromSession = () => {
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
    };
    openFromSession();
    window.addEventListener(OPEN_CAMPANHA_TASK_EVENT, openFromSession);
    return () => window.removeEventListener(OPEN_CAMPANHA_TASK_EVENT, openFromSession);
  }, []);

  const rows: CampanhaRow[] = useMemo(
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

  // Influenciadores de verdade (já atribuídos), por campanha — o mesmo
  // dado que o detalhe da campanha já carrega, aqui só agregado pra toda a
  // listagem. `getAllCampanhaInflus` lê do store campanha-escopado, já
  // 100% sincronizado em memória (nenhuma chamada remota nova); assina
  // `onCampanhaInflusChange` só pra re-renderizar quando esse dado mudar.
  const [influsVersion, setInflusVersion] = useState(0);
  useEffect(() => onCampanhaInflusChange(() => setInflusVersion((v) => v + 1)), []);
  const influsByCampanha = useMemo(
    () => getAllCampanhaInflus(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [influsVersion, rows],
  );

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<CampanhaFiltersState>(DEFAULT_CAMPANHA_FILTERS);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardClienteId, setWizardClienteId] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  const requestDeleteCampanha = async (row: CampanhaRow) => {
    const ok = await confirm(`Excluir a campanha "${row.campanha.nome}"?`);
    if (!ok) return;
    setClientes((prev) =>
      prev.map((c) =>
        c.id === row.cliente.id
          ? { ...c, campanhas: (c.campanhas ?? []).filter((x) => x.id !== row.campanha.id) }
          : c,
      ),
    );
    // Sem isso, influs/tarefas/docs escopados a essa campanha ficavam
    // órfãos no banco (a campanha some daqui, mas essas linhas continuam
    // existindo e reaparecem em telas que agregam tudo, tipo "Meu
    // trabalho" no Início).
    deleteCampanhaScopedData(row.campanha.id);
  };

  const saveCampanhaToCliente = (clienteId: string, campaign: Campaign) => {
    setClientes((prev) =>
      prev.map((cli) => {
        if (cli.id !== clienteId) return cli;
        const list = cli.campanhas ?? [];
        const exists = list.some((x) => x.id === campaign.id);
        return {
          ...cli,
          campanhas: exists
            ? list.map((x) => (x.id === campaign.id ? campaign : x))
            : [...list, campaign],
        };
      }),
    );
  };

  const openNovaCampanha = () => setPickerOpen(true);
  const openEditCampanha = (row: CampanhaRow) => {
    setWizardClienteId(row.cliente.id);
    setEditingCampaign(row.campanha);
    setWizardOpen(true);
  };

  // `today`/`visibleRows` precisam ser calculados ANTES do `if (current)`
  // abaixo — hooks (useMemo) não podem ser chamados condicionalmente, e
  // esse retorno antecipado pra `CampanhaDetail` é condicional.
  const today = new Date();
  // Campanhas encerradas ficam escondidas por padrão (item 2 do pedido) —
  // só quando o usuário não escolheu um status explícito no filtro
  // principal (senão o filtro já manda: pedir "Encerrada" ali já mostra
  // todas, sem precisar da seção separada). "Encerrada" é sempre o mesmo
  // `campanhaStatus()` já usado em todo o resto da tela — nunca uma
  // segunda inferência por data.
  const statusFilterActive = filters.status !== "todos";
  const [showEncerradas, setShowEncerradas] = useState(false);
  const filteredRows = useMemo(
    () => filterCampanhas(rows, query, filters, today, influsByCampanha),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, filters, influsByCampanha],
  );
  const visibleRows = useMemo(
    () =>
      sortCampanhas(
        statusFilterActive
          ? filteredRows
          : filteredRows.filter((r) => campanhaStatus(r.campanha, today) !== "encerrada"),
        filters.sort,
        influsByCampanha,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filteredRows, statusFilterActive, filters.sort, influsByCampanha],
  );
  // Mesmos query/filters de cima, só forçando status="encerrada" — busca e
  // filtros continuam valendo dentro da seção de encerradas também.
  const encerradasFilters = useMemo(
    () => ({ ...filters, status: "encerrada" as const }),
    [filters],
  );
  const encerradasRowsAll = useMemo(
    () =>
      statusFilterActive
        ? []
        : filterCampanhas(rows, query, encerradasFilters, today, influsByCampanha),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, query, encerradasFilters, influsByCampanha, statusFilterActive],
  );
  const encerradasCount = encerradasRowsAll.length;
  const encerradasRows = useMemo(
    () => (showEncerradas ? sortCampanhas(encerradasRowsAll, filters.sort, influsByCampanha) : []),
    [showEncerradas, encerradasRowsAll, filters.sort, influsByCampanha],
  );

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

  const totalCampanhas = rows.length;
  const ativas = rows.filter((r) => campanhaStatus(r.campanha, today) === "ativa").length;
  const semPrazo = rows.filter((r) => campanhaStatus(r.campanha, today) === "sem_prazo").length;
  const totalInflusReais = Array.from(influsByCampanha.values()).reduce(
    (s, list) => s + list.length,
    0,
  );

  const wizardCliente = clientes.find((c) => c.id === wizardClienteId) ?? null;
  const hasAnyCampanha = totalCampanhas > 0;
  const hasResults = visibleRows.length > 0;
  const hasActiveSearchOrFilter =
    query.trim().length > 0 ||
    filters.status !== "todos" ||
    filters.clienteIds.length > 0 ||
    filters.recorrente !== "todos" ||
    filters.influenciadores !== "todos";

  return (
    // Canvas fix (mesma correção do Financeiro/Reuniões/Metas/Clientes):
    // --background e --card são idênticos no claro, então sem isso os
    // cards de Campanhas não se distinguiam do fundo.
    <div className="-m-4 min-h-[calc(100vh-4rem)] bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
      <PageContainer className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[36px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[42px]">
              Campanhas
            </p>
            <p className="mt-1.5 text-sm text-text-secondary">
              Todas as campanhas vinculadas aos clientes.
            </p>
          </div>
          <Button variant="primary" size="comfortable" onClick={openNovaCampanha}>
            <Plus className="h-4 w-4" /> Nova campanha
          </Button>
        </div>

        {hasAnyCampanha && (
          <div className="rounded-[24px] bg-brand p-5 dark:shadow-none md:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
              <div className="shrink-0">
                <span className="inline-flex items-center rounded-full bg-black/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-foreground">
                  Campanhas ativas
                </span>
                <p className="mt-2 whitespace-nowrap text-[40px] font-bold leading-none tracking-tight text-brand-foreground sm:text-[46px] md:text-[52px]">
                  {ativas}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-x-7 gap-y-3 lg:justify-end">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
                    <Megaphone className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                      Total de campanhas
                    </p>
                    <p className="whitespace-nowrap text-base font-bold leading-none text-brand-foreground">
                      {totalCampanhas}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
                    <User className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                      Influenciadores
                    </p>
                    <p className="whitespace-nowrap text-base font-bold leading-none text-brand-foreground">
                      {totalInflusReais}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/10 text-brand-foreground">
                    <CalendarClock className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-foreground-secondary">
                      Sem prazo
                    </p>
                    <p className="whitespace-nowrap text-base font-bold leading-none text-brand-foreground">
                      {semPrazo}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {hasAnyCampanha && (
          <CampanhaFiltersBar
            query={query}
            onQueryChange={setQuery}
            filters={filters}
            onFiltersChange={setFilters}
            clientes={clientes.map((c) => ({ id: c.id, empresa: c.empresa }))}
          />
        )}

        {!hasAnyCampanha ? (
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title="Nenhuma campanha cadastrada ainda"
            description="Crie a primeira campanha para começar a acompanhar influenciadores, entregas e pagamentos."
            primaryAction={{ label: "Nova campanha", onClick: openNovaCampanha }}
          />
        ) : !hasResults ? (
          <EmptyState
            icon={<Megaphone className="h-5 w-5" />}
            title={
              hasActiveSearchOrFilter
                ? "Nenhuma campanha encontrada"
                : "Nenhuma campanha para mostrar"
            }
            description={
              hasActiveSearchOrFilter
                ? "Ajuste a busca ou os filtros para ver outras campanhas."
                : undefined
            }
            secondaryAction={
              hasActiveSearchOrFilter
                ? {
                    label: "Limpar filtros",
                    onClick: () => {
                      setQuery("");
                      setFilters(DEFAULT_CAMPANHA_FILTERS);
                    },
                  }
                : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleRows.map((row) => {
              const influs = influsByCampanha.get(row.campanha.id) ?? [];
              const entregas = influs.flatMap((i) => i.entregas ?? []);
              return (
                <CampanhaCard
                  key={row.campanha.id}
                  row={row}
                  influCount={influs.length}
                  entregasTotal={entregas.length}
                  entregasPublicadas={entregas.filter((e) => e.stage === "PUBLICADA").length}
                  onOpen={() => setOpenId(row.campanha.id)}
                  onEdit={() => openEditCampanha(row)}
                  onDelete={() => void requestDeleteCampanha(row)}
                />
              );
            })}
          </div>
        )}

        {encerradasCount > 0 && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setShowEncerradas((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 rounded-full py-2.5 text-sm font-medium text-brand hover:underline"
            >
              {showEncerradas
                ? "Ocultar campanhas encerradas"
                : `Ver campanhas encerradas (${encerradasCount})`}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showEncerradas ? "rotate-180" : ""}`}
              />
            </button>

            {showEncerradas && (
              <div className="space-y-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Campanhas encerradas
                </p>
                {encerradasRows.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Megaphone className="h-5 w-5" />}
                    title="Nenhuma campanha encerrada encontrada"
                    description="Ajuste a busca ou os filtros para ver outras campanhas encerradas."
                  />
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {encerradasRows.map((row) => {
                      const influs = influsByCampanha.get(row.campanha.id) ?? [];
                      const entregas = influs.flatMap((i) => i.entregas ?? []);
                      return (
                        <CampanhaCard
                          key={row.campanha.id}
                          row={row}
                          influCount={influs.length}
                          entregasTotal={entregas.length}
                          entregasPublicadas={
                            entregas.filter((e) => e.stage === "PUBLICADA").length
                          }
                          onOpen={() => setOpenId(row.campanha.id)}
                          onEdit={() => openEditCampanha(row)}
                          onDelete={() => void requestDeleteCampanha(row)}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </PageContainer>

      <SelecionarClienteDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        clientes={clientes}
        onSelect={(cliente) => {
          setWizardClienteId(cliente.id);
          setEditingCampaign(null);
          setPickerOpen(false);
          setWizardOpen(true);
        }}
      />

      <VincularCampanhaDialog
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        clienteNome={wizardCliente?.empresa}
        clienteOrcamentoSugerido={wizardCliente?.orcamentoSugerido}
        initial={editingCampaign}
        onSave={(campaign) => {
          if (wizardClienteId) saveCampanhaToCliente(wizardClienteId, campaign);
        }}
      />

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
  const monthOptions = useMemo(
    () => buildMesReferenciaOptions(c.pagClienteRecorrenteInicio),
    [c.pagClienteRecorrenteInicio],
  );
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

  const [cronograma, setCronograma] = useState<CronogramaItem[]>(() =>
    loadCampanhaCronograma(c.id),
  );
  const persistCronograma = (next: CronogramaItem[]) => {
    setCronograma(next);
    saveCampanhaCronograma(c.id, next);
  };
  useEffect(
    () => onCampanhaCronogramaChange(() => setCronograma(loadCampanhaCronograma(c.id))),
    [c.id],
  );

  // Só os influenciadores/tarefas criados dentro do mês selecionado (campanha
  // recorrente). Passamos esse subconjunto pros componentes filhos, mas ao
  // salvar reconciliamos de volta com os itens escondidos (`hiddenInflus`/
  // `hiddenTasks`) — senão o onChange deles, construído só a partir do que
  // recebeu, sobrescreveria a campanha inteira e apagaria os outros meses.
  // Prioriza `cicloMes` (mês de referência explícito, gravado pelo
  // servidor a partir da Página de Inscrição — ver
  // `submitInscricaoCampanha`) sobre `createdAt`: influenciadores que
  // entraram pela página pública não devem depender do timing exato de
  // quando alguém preencheu o formulário pra cair no mês certo. Entradas
  // antigas/manuais sem `cicloMes` continuam usando a heurística por
  // `createdAt` de sempre.
  const visibleInflus = useMemo(
    () => influs.filter((i) => inSelectedMonth(i.cicloMes ?? i.createdAt)),
    [influs, monthFilter, isRecorrente],
  );
  const hiddenInflus = useMemo(
    () => influs.filter((i) => !inSelectedMonth(i.cicloMes ?? i.createdAt)),
    [influs, monthFilter, isRecorrente],
  );
  const persistVisibleInflus = (next: Influ[]) => persistInflus([...hiddenInflus, ...next]);

  // Approval metrics
  const enviados = visibleInflus.filter(
    (i) => i.status !== "EM_CURADORIA" && i.status !== "INSCRITO",
  ).length;
  const emAprovacao = visibleInflus.filter((i) => i.status === "ENVIADO_AO_CLIENTE").length;

  // Budget
  const orcamento = parseMoney(c.orcamento);
  const gasto = visibleInflus.reduce((sum, i) => sum + totalAceito(i.pagamento), 0);
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

  const [openPanel, setOpenPanel] = useState<
    null | "documentos" | "calendario" | "composicao" | "direitos" | "relatorioMensal"
  >(null);

  // Mesmo link (por cliente, não por campanha — um cliente pode ter várias
  // campanhas atrás do mesmo portal) já usado em ClientesSection; fica
  // também aqui pra não precisar sair da campanha pra copiar o link.
  const clientes = useClientes();
  const setClientes = clientesStore.set;
  const fullCliente = clientes.find((cl) => cl.id === cliente.id);
  const [linkCopied, setLinkCopied] = useState(false);
  const copyClientLink = () => {
    if (!fullCliente) return;
    let token = fullCliente.publicToken;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "");
      setClientes((prev) =>
        prev.map((cl) => (cl.id === fullCliente.id ? { ...cl, publicToken: token } : cl)),
      );
    }
    void navigator.clipboard.writeText(`${window.location.origin}/portal/${token}`).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1500);
    });
  };

  // Página de Inscrição pública — permite o influenciador se candidatar
  // direto pra esta campanha (entra em "Inscrito" no board), diferente
  // do link do cliente acima (que é por Cliente, não por Campanha).
  const [inscricaoOpen, setInscricaoOpen] = useState(false);
  const saveInscricaoPage = (patch: Partial<Campaign>) => {
    setClientes((prev) =>
      prev.map((cl) =>
        cl.id !== cliente.id
          ? cl
          : {
              ...cl,
              campanhas: (cl.campanhas ?? []).map((camp) =>
                camp.id === c.id ? { ...camp, ...patch } : camp,
              ),
            },
      ),
    );
  };

  // Relatórios mensais de métricas (PDF) — o time sobe o arquivo pronto,
  // um por mês; o cliente vê no portal sem precisar baixar. Substitui o
  // antigo relatório gerado automaticamente a partir das métricas dos
  // influenciadores.
  const relatorios = useMemo(
    () => [...(c.relatoriosMensais ?? [])].sort((a, b) => b.mes.localeCompare(a.mes)),
    [c.relatoriosMensais],
  );
  const [relatorioMes, setRelatorioMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [relatorioUploading, setRelatorioUploading] = useState(false);
  const [relatorioError, setRelatorioError] = useState("");
  const [relatorioViewingId, setRelatorioViewingId] = useState<string | null>(null);
  const [relatorioUrls, setRelatorioUrls] = useState<Record<string, string>>({});
  const relatorioFileRef = useRef<HTMLInputElement>(null);
  const { confirm: confirmDeleteRelatorio, confirmDialog: confirmDeleteRelatorioDialog } =
    useConfirm();

  const uploadRelatorioMensal = async (file: File) => {
    if (file.type !== "application/pdf") {
      setRelatorioError("Só é possível anexar arquivos PDF.");
      return;
    }
    setRelatorioUploading(true);
    setRelatorioError("");
    try {
      const storagePath = await uploadRelatorioMensalPdf(file);
      if (!storagePath) throw new Error("Falha ao subir o arquivo.");
      const novo: RelatorioMensal = {
        id: crypto.randomUUID(),
        mes: relatorioMes,
        nome: file.name,
        storagePath,
        uploadedAt: new Date().toISOString(),
      };
      saveInscricaoPage({ relatoriosMensais: [...(c.relatoriosMensais ?? []), novo] });
      if (relatorioFileRef.current) relatorioFileRef.current.value = "";
    } catch (err) {
      setRelatorioError(err instanceof Error ? err.message : "Erro ao subir o relatório.");
    } finally {
      setRelatorioUploading(false);
    }
  };

  const deleteRelatorioMensal = async (r: RelatorioMensal) => {
    const ok = await confirmDeleteRelatorio("Remover este relatório mensal?");
    if (!ok) return;
    await deleteRelatorioMensalPdf(r.storagePath);
    saveInscricaoPage({
      relatoriosMensais: (c.relatoriosMensais ?? []).filter((x) => x.id !== r.id),
    });
    if (relatorioViewingId === r.id) setRelatorioViewingId(null);
  };

  const toggleViewRelatorio = async (r: RelatorioMensal) => {
    if (relatorioViewingId === r.id) {
      setRelatorioViewingId(null);
      return;
    }
    if (!relatorioUrls[r.id]) {
      const url = await getRelatorioMensalUrl(r.storagePath);
      if (!url) {
        setRelatorioError("Não foi possível abrir o relatório.");
        return;
      }
      setRelatorioUrls((prev) => ({ ...prev, [r.id]: url }));
    }
    setRelatorioViewingId(r.id);
  };

  // Entregas agregadas — SÓ de influenciadores aprovados (rodada corretiva
  // forte, bug real encontrado: somava entregas de todo mundo, inclusive
  // recusados, mostrando 12 em vez de 2). `getEligibleCampaignDeliveries`
  // é a única fonte usada em todo lugar que soma/lista entregas nesta
  // página (resumo operacional, painel "Todas as entregas", galeria).
  const [briefingExpanded, setBriefingExpanded] = useState(false);
  const [entregasExpanded, setEntregasExpanded] = useState(false);
  const eligibleInflus = useMemo(
    () => getEligibleCampaignInfluencers(visibleInflus),
    [visibleInflus],
  );
  const allEntregas = useMemo(() => getEligibleCampaignDeliveries(visibleInflus), [visibleInflus]);
  const entregasPublicadas = allEntregas.filter((x) => x.entrega.stage === "PUBLICADA").length;

  const [editOpen, setEditOpen] = useState(false);
  const { confirm: confirmDeleteCampanha, confirmDialog: confirmDeleteCampanhaDialog } =
    useConfirm();
  const requestDeleteCampanha = async () => {
    const ok = await confirmDeleteCampanha(
      influs.length > 0
        ? `Excluir a campanha "${c.nome}"? Os ${influs.length} influenciador(es) vinculados também serão removidos — essa ação não pode ser desfeita.`
        : `Excluir a campanha "${c.nome}"? Essa ação não pode ser desfeita.`,
    );
    if (!ok) return;
    setClientes((prev) =>
      prev.map((cl) =>
        cl.id === cliente.id
          ? { ...cl, campanhas: (cl.campanhas ?? []).filter((x) => x.id !== c.id) }
          : cl,
      ),
    );
    deleteCampanhaScopedData(c.id);
    onBack();
  };
  const saveEditedCampaign = (patch: Campaign) => saveInscricaoPage(patch);

  const status = campanhaStatus(c, new Date());
  const briefingIsLong = (c.briefing?.length ?? 0) > 320;

  return (
    // Canvas fix (mesma correção do Financeiro/Clientes/Campanhas): fundo
    // muted por trás dos cards, já que --background e --card são
    // idênticos no claro. Sem min-height artificial (2ª rodada corretiva)
    // — a altura é só a do conteúdo real, nunca força espaço vazio.
    <div className="-m-4 bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
      {/* Ritmo vertical das GRANDES seções centralizado aqui — o único
       * `space-y-*` que separa cabeçalho / métricas / informações /
       * tarefas / influenciadores / todas-as-entregas (rodada de
       * refinamento: antes um `space-y-6` fixo dava só 24px em qualquer
       * largura, apertado no desktop). Escala responsiva: 24px no
       * mobile, 32px no tablet (`md`), 40px em telas médias de desktop
       * (`lg`), 48px em desktop largo (`xl`). Espaçamento INTERNO de
       * cada seção (título↔conteúdo, card↔card) continua nos `space-y-*`
       * menores de cada bloco — nunca neste nível. */}
      <PageContainer variant="wide" className="space-y-6 md:space-y-8 lg:space-y-10 xl:space-y-12">
        {confirmDeleteRelatorioDialog}
        {confirmDeleteCampanhaDialog}

        {/* CABEÇALHO DA CAMPANHA — breadcrumb + identidade/ações agrupados
         * num único bloco visual (gap interno pequeno, "content gap");
         * sem hero colorido, azul só nos elementos interativos (botão
         * primário, badges de status/foco). Nome da campanha é o
         * elemento principal (maior peso tipográfico). */}
        <div className="space-y-3">
          <nav aria-label="Navegação" className="flex items-center gap-1.5 text-sm">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Campanhas
            </button>
            <span className="text-text-secondary">/</span>
            <span className="min-w-0 truncate font-medium text-foreground">{c.nome}</span>
          </nav>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {cliente.empresa}
                </p>
                <p className="mt-0.5 truncate text-2xl font-bold tracking-tight text-foreground md:text-[28px]">
                  {c.nome}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={
                      status === "ativa"
                        ? "success"
                        : status === "encerrada"
                          ? "secondary"
                          : "outline"
                    }
                  >
                    {CAMPANHA_STATUS_LABEL[status]}
                  </Badge>
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary">
                    <Calendar className="h-3.5 w-3.5" />
                    {isRecorrente
                      ? `Mensal · dia ${c.pagClienteRecorrenteDia ?? "—"}`
                      : `Prazo ${fmtDate(c.prazo)}`}
                  </span>
                  {isRecorrente && (
                    <select
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      aria-label="Mês de referência"
                      className="h-7 rounded-md border border-input bg-background px-2 text-xs font-medium capitalize outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {monthOptions.map((m) => (
                        <option key={m.value} value={m.value} className="capitalize">
                          {m.label}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            {/* Ações — uma primária (Editar), uma secundária discreta (Link do
             * cliente), e um menu pras menos frequentes (Página de inscrição,
             * Excluir com confirmação) — nunca vários botões com peso igual. */}
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" onClick={copyClientLink} disabled={!fullCliente}>
                {linkCopied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <LinkIcon className="h-3.5 w-3.5" />
                )}
                {linkCopied ? "Link copiado!" : "Link do cliente"}
              </Button>
              <Button variant="primary" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Mais ações"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => setInscricaoOpen(true)} disabled={!fullCliente}>
                    <UserPlus className="h-3.5 w-3.5" /> Página de inscrição
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => void requestDeleteCampanha()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Excluir campanha
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        <InscricaoPageDialog
          open={inscricaoOpen}
          onOpenChange={setInscricaoOpen}
          campaign={c}
          clienteNome={cliente.empresa}
          influs={influs}
          onSave={saveInscricaoPage}
        />

        <VincularCampanhaDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          clienteNome={cliente.empresa}
          initial={c}
          onSave={saveEditedCampaign}
        />

        {/* RESUMO OPERACIONAL COMPACTO — uma faixa só, divisores leves,
         * nunca um card grande por número. Cor semântica só em alerta
         * (gasto acima do orçamento). */}
        <div className="rounded-2xl bg-card dark:shadow-none">
          <div className="flex flex-wrap">
            {/* `visibleInflus` (mês selecionado), não `influs` (histórico
             * completo) — achado real de uma rodada anterior: o topo
             * mostrava "21" enquanto a seção Influenciadores, já filtrada
             * por mês, mostrava "6 adicionados". Mesma coleção em todo
             * lugar. Rótulos abaixo (rodada de refinamento): cada métrica
             * precisa dizer sozinha se é PERFIL (seleção de
             * influenciador) ou CONTEÚDO (entrega) — nunca genérico o
             * bastante pra parecer o mesmo funil. "Meta de
             * influenciadores" é a meta contratual (`c.linhas`, não
             * muda quando um influenciador é aprovado/recusado);
             * "Perfis enviados ao cliente" e "Perfis em aprovação" são
             * contagens de INFLUENCIADOR (por status); "Entregas
             * publicadas" é contagem de CONTEÚDO, só de influenciadores
             * elegíveis (`getEligibleCampaignDeliveries`). */}
            <SummaryStat
              label="Influenciadores adicionados"
              value={visibleInflus.length.toString()}
            />
            <SummaryStat label="Meta de influenciadores" value={totalInflus.toString()} />
            <SummaryStat label="Perfis enviados ao cliente" value={`${enviados}/${totalEnviar}`} />
            <SummaryStat
              label="Perfis em aprovação"
              value={emAprovacao.toString()}
              tone={emAprovacao > 0 ? "warning" : undefined}
            />
            <SummaryStat
              label="Entregas publicadas"
              value={`${entregasPublicadas}/${allEntregas.length}`}
              tone={entregasPublicadas > 0 ? "success" : undefined}
            />
            {orcamento > 0 && (
              <>
                <SummaryStat label="Orçamento" value={fmtBRL(orcamento)} />
                <SummaryStat
                  label="Gasto"
                  value={fmtBRL(gasto)}
                  tone={overBudget ? "danger" : undefined}
                  progress={{
                    pct: Math.max(pctGasto, 2),
                    ariaLabel: `Gasto: ${fmtBRL(gasto)} de ${fmtBRL(orcamento)} do orçamento (${Math.round(pctGasto)}%)`,
                    tone: overBudget ? "danger" : "brand",
                  }}
                />
                <SummaryStat label="Saldo" value={fmtBRL(disponivel)} />
              </>
            )}
          </div>
        </div>

        {/* INFORMAÇÕES DA CAMPANHA — bento compacto em duas colunas flex
         * independentes (ver comentário abaixo pra detalhe da estrutura).
         * Nenhum card usa altura fixa/mínima. */}
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            Informações da campanha
          </p>

          {/* Duas colunas VERTICALMENTE INDEPENDENTES — cada `md:flex
           * md:flex-col` abaixo é seu próprio container flex. "Orçamento
           * e gasto" foi removido daqui (duplicava Orçamento/Gasto/Saldo
           * já visíveis na faixa de métricas do topo); no lugar dele,
           * `md:items-stretch` na linha + `md:flex-1` no card Ferramentas
           * fazem Ferramentas crescer pra preencher o espaço que sobra na
           * coluna principal, terminando na mesma altura do fim de
           * Direitos de imagem — de propósito, não um efeito colateral de
           * grid compartilhado. No mobile, os wrappers viram `contents`
           * (não geram caixa própria) e a ORDEM real da pilha única vem
           * só dos `order-*` em cada card: Briefing → Composição →
           * Ferramentas → Direitos. */}
          <div className="flex flex-col gap-3 md:flex-row md:items-stretch md:gap-4">
            <div className="contents md:flex md:w-2/3 md:flex-col md:gap-3 lg:gap-4">
              {/* Briefing cresce com `md:flex-1` pra preencher o espaço que
               * sobra na coluna principal (Ferramentas, abaixo, fica no
               * tamanho natural/compacto) — o card termina alinhado com o
               * fim de Direitos de imagem na lateral. Só no desktop
               * (`md:`); no mobile é `contents` e não participa disso. */}
              <div className="order-1 flex flex-col rounded-2xl bg-card p-5 dark:shadow-none md:order-none md:flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Briefing
                  </p>
                  <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-3 w-3" /> Editar
                  </Button>
                </div>
                <div className="mt-2">
                  {c.briefing ? (
                    <p
                      className={`whitespace-pre-wrap break-words text-sm text-foreground ${
                        briefingIsLong && !briefingExpanded ? "line-clamp-3" : ""
                      }`}
                    >
                      {c.briefing}
                    </p>
                  ) : (
                    <p className="text-sm text-text-secondary">Nenhum briefing cadastrado.</p>
                  )}
                  {briefingIsLong && (
                    <button
                      type="button"
                      onClick={() => setBriefingExpanded((v) => !v)}
                      className="mt-1.5 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {briefingExpanded ? "Ver menos" : "Ver mais"}
                    </button>
                  )}
                  {(c.briefingFile || (c.briefingLinks?.length ?? 0) > 0) && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border/60 pt-3">
                      {c.briefingFile && (
                        <a
                          href={c.briefingFile}
                          download
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand underline underline-offset-2"
                        >
                          <Paperclip className="h-3.5 w-3.5" /> Anexo
                        </a>
                      )}
                      {c.briefingLinks?.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-brand underline underline-offset-2"
                        >
                          <LinkIcon className="h-3.5 w-3.5 shrink-0" /> {url}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Ferramentas fica na coluna principal mais larga (evita que
               * os 3 botões quebrem em duas linhas), no tamanho natural —
               * quem cresce pra preencher espaço é o Briefing, acima. */}
              <div className="order-3 rounded-2xl bg-card p-4 dark:shadow-none md:order-none">
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Ferramentas
                </p>
                <div className="flex flex-wrap gap-2 md:flex-nowrap">
                  <FerramentaCard
                    icon={FolderOpen}
                    label="Documentos"
                    count={docs.length}
                    onClick={() => setOpenPanel("documentos")}
                  />
                  <FerramentaCard
                    icon={CalendarClock}
                    label="Calendário da campanha"
                    onClick={() => setOpenPanel("calendario")}
                  />
                  <FerramentaCard
                    icon={FileBarChart}
                    label="Relatórios mensais"
                    count={relatorios.length}
                    onClick={() => setOpenPanel("relatorioMensal")}
                  />
                </div>
              </div>
            </div>

            <div className="contents md:flex md:w-1/3 md:flex-col md:gap-3 lg:gap-4">
              <div className="order-2 rounded-2xl bg-card p-4 dark:shadow-none md:order-none">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  <Wallet className="h-3.5 w-3.5" /> Composição & pagamentos
                </p>
                <div className="mt-2 space-y-2.5">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                      Composição planejada
                    </p>
                    {c.linhas.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
                        {c.linhas.map((l) => (
                          <span
                            key={l.id}
                            className="rounded-md bg-muted px-2 py-1 text-foreground"
                          >
                            {l.quantidade}× {l.tipo || "—"} · {l.tamanho || "—"}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-text-secondary">Nenhuma definida.</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                      Valor do cliente · forma
                    </p>
                    <p className="mt-1 text-sm text-foreground">
                      {c.valorCliente || "Não definido"}
                      {c.pagClienteTipo ? ` · ${c.pagClienteTipo}` : ""}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                      Prazo de pagamento
                    </p>
                    <p className="mt-1 text-sm text-foreground">{c.prazoPag || "Não definido"}</p>
                  </div>
                </div>
              </div>

              <div className="order-5 rounded-2xl bg-card p-4 dark:shadow-none md:order-none">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  <ShieldCheck className="h-3.5 w-3.5" /> Direitos de imagem
                </p>
                {c.direitosImagem?.permitido ? (
                  <div className="mt-2 space-y-2 text-sm">
                    {c.direitosImagem.usos.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 text-xs">
                        {c.direitosImagem.usos.map((u) => (
                          <span key={u} className="rounded-md bg-muted px-2 py-1 text-foreground">
                            {u}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-foreground">
                      Duração:{" "}
                      <span className="text-text-secondary">
                        {c.direitosImagem.duracaoDias
                          ? `${c.direitosImagem.duracaoDias} dias`
                          : "Indeterminada"}
                      </span>
                    </p>
                    {c.direitosImagem.exclusividade && (
                      <p className="text-foreground">
                        Exclusividade:{" "}
                        <span className="text-text-secondary">
                          {c.direitosImagem.exclusividadeSegmento || "Sim"}
                        </span>
                      </p>
                    )}
                    {c.direitosImagem.observacoes && (
                      <p className="whitespace-pre-wrap break-words text-xs text-text-secondary">
                        {c.direitosImagem.observacoes}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-text-secondary">
                    Nenhum direito de uso definido.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* TAREFAS — sempre visível, nunca atrás de aba. `TaskBoard` já
         * renderiza seu próprio cabeçalho (título "Tarefas"/total/ordenar/
         * filtrar/Nova tarefa) — nenhum título extra aqui, senão duplica
         * (achado real desta rodada corretiva: "TAREFAS" aparecia 2x). */}
        <section>
          <TaskBoard
            tasks={visibleTasks}
            onChange={persistVisibleTasks}
            scope={{ kind: "campanha", id: c.id }}
            initialOpenTaskId={initialTaskId}
            onInitialOpenTaskHandled={onInitialTaskHandled}
          />
        </section>

        {/* INFLUENCIADORES — sempre visível. `InfluencerBoard` já renderiza
         * seu próprio cabeçalho (título "Influenciadores"/busca/
         * visualização/exportar/Novo influenciador) — mesmo motivo acima,
         * sem título extra. */}
        <section>
          <InfluencerBoard
            influs={visibleInflus}
            onChange={persistVisibleInflus}
            exportName={c.nome}
            defaultCicloMes={isRecorrente ? monthFilter : undefined}
            cicloMesOptions={isRecorrente ? monthOptions : undefined}
          />
        </section>

        {/* TODAS AS ENTREGAS — painel expansível consolidado, separado da
         * grade de Influenciadores pelo mesmo ritmo das grandes seções
         * (rodada de refinamento pediu que ela respire tanto quanto as
         * outras seções, não como um apêndice colado). Sem virar página
         * própria. */}
        <section>
          <div className="rounded-2xl bg-card dark:shadow-none">
            <button
              type="button"
              onClick={() => setEntregasExpanded((v) => !v)}
              aria-expanded={entregasExpanded}
              className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Send className="h-4 w-4 text-text-secondary" />
                Todas as entregas
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                  {allEntregas.length}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-text-secondary transition-transform ${entregasExpanded ? "rotate-180" : ""}`}
              />
            </button>

            {entregasExpanded && (
              <div className="border-t border-border/60 p-4 md:p-5">
                {allEntregas.length === 0 ? (
                  <EmptyState
                    compact
                    icon={<Send className="h-5 w-5" />}
                    title="Nenhuma entrega ainda"
                    description="Entregas aparecem aqui assim que forem criadas para um influenciador desta campanha."
                  />
                ) : (
                  <ul className="divide-y divide-border/60">
                    {allEntregas.map(({ influ, entrega }) => {
                      const nextActor = nextActionForEntrega(entrega.stage);
                      return (
                        <li
                          key={entrega.id}
                          className="flex flex-wrap items-center gap-3 py-3 text-sm first:pt-0 last:pb-0"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
                            {influ.foto ? (
                              <img src={influ.foto} alt="" className="h-full w-full object-cover" />
                            ) : (
                              <User className="h-3.5 w-3.5 text-text-secondary" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-foreground">
                              {entrega.titulo || entrega.tipo}
                            </p>
                            <p className="truncate text-xs text-text-secondary">
                              {influ.nome} · {entrega.tipo}
                              {entrega.quantidade > 1 ? ` · ${entrega.quantidade}×` : ""}
                            </p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${ENTREGA_STAGE_TONE[entrega.stage]}`}
                          >
                            {ENTREGA_STAGE_LABEL[entrega.stage]}
                          </span>
                          {nextActor && (
                            <span className="shrink-0 text-[11px] text-text-secondary">
                              Próxima ação: {NEXT_ACTOR_LABEL[nextActor]}
                            </span>
                          )}
                          {entrega.url && (
                            <a
                              href={entrega.url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-brand hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" /> Ver publicação
                            </a>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-4 border-t border-border/60 pt-4">
                  <GaleriaConteudosSection influs={eligibleInflus} />
                </div>
              </div>
            )}
          </div>
        </section>

        <Dialog open={openPanel === "documentos"} onOpenChange={(o) => !o && setOpenPanel(null)}>
          <DialogContent className="max-w-xl border-border bg-card" mobileFullScreen>
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
          <DialogContent className="max-w-2xl border-border bg-card" mobileFullScreen>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <CalendarClock className="h-4 w-4" /> Calendário da campanha
            </DialogTitle>
            <DialogDescription className="sr-only">
              Datas e prazos importantes da campanha.
            </DialogDescription>
            <CampaignCalendar
              campanha={c}
              influs={visibleInflus}
              cronograma={cronograma}
              onCronogramaChange={persistCronograma}
              isRecorrente={isRecorrente}
            />
          </DialogContent>
        </Dialog>

        <Dialog open={openPanel === "composicao"} onOpenChange={(o) => !o && setOpenPanel(null)}>
          <DialogContent className="max-w-md border-border bg-card" mobileFullScreen>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Wallet className="h-4 w-4" /> Composição & pagamentos
            </DialogTitle>
            <DialogDescription className="sr-only">
              Composição planejada e formas de pagamento da campanha.
            </DialogDescription>
            <div className="space-y-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Composição planejada
                </p>
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
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Formas de pagamento
                </p>
                {(c.pagTipos?.length ?? 0) > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
                    {c.pagTipos.map((t) => {
                      const resumo = pagTipoResumo(t, c.pagConfig?.[t] ?? {});
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
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">—</p>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={openPanel === "direitos"} onOpenChange={(o) => !o && setOpenPanel(null)}>
          <DialogContent className="max-w-md border-border bg-card" mobileFullScreen>
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
                  <p className="whitespace-pre-wrap break-words text-muted-foreground">
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

        <Dialog
          open={openPanel === "relatorioMensal"}
          onOpenChange={(o) => !o && setOpenPanel(null)}
        >
          <DialogContent
            className="flex max-h-[85vh] max-w-2xl flex-col border-border bg-card"
            mobileFullScreen
          >
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <FileBarChart className="h-4 w-4" /> Relatórios mensais
            </DialogTitle>
            <DialogDescription className="sr-only">
              PDFs de relatório de métricas enviados pro cliente, um por mês.
            </DialogDescription>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
                <input
                  type="month"
                  value={relatorioMes}
                  onChange={(e) => setRelatorioMes(e.target.value)}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
                />
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-foreground hover:text-foreground">
                  {relatorioUploading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {relatorioUploading ? "Enviando..." : "Subir PDF"}
                  <input
                    ref={relatorioFileRef}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={relatorioUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadRelatorioMensal(file);
                    }}
                  />
                </label>
                <span className="text-[11px] text-muted-foreground">
                  O cliente vê este PDF no portal, sem precisar baixar.
                </span>
              </div>

              {relatorioError && <p className="text-xs text-destructive">{relatorioError}</p>}

              {relatorios.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum relatório enviado ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {relatorios.map((r) => (
                    <li key={r.id} className="rounded-lg border border-border">
                      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-foreground">
                            {mesLabel(r.mes)}
                          </p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {r.nome} · enviado {formatIsoDate(r.uploadedAt.slice(0, 10))}
                          </p>
                          {r.nps && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              NPS do cliente: <span className="font-semibold">{r.nps.score}</span>
                              {r.nps.comentario ? ` — "${r.nps.comentario}"` : ""}
                            </p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void toggleViewRelatorio(r)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                        >
                          {relatorioViewingId === r.id ? "Ocultar" : "Visualizar"}
                        </button>
                        {relatorioUrls[r.id] && (
                          <a
                            href={relatorioUrls[r.id]}
                            download={r.nome}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium hover:bg-muted"
                          >
                            <Download className="h-3 w-3" /> Baixar
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => void deleteRelatorioMensal(r)}
                          aria-label="Remover"
                          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {relatorioViewingId === r.id && relatorioUrls[r.id] && (
                        <iframe
                          src={relatorioUrls[r.id]}
                          title={r.nome}
                          className="h-[60vh] w-full border-t border-border"
                        />
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </PageContainer>
    </div>
  );
}

function FerramentaCard({
  icon: Icon,
  label,
  count,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
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
    </button>
  );
}

const DIAS_LABEL = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function toISODate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

type CalendarEvent = {
  label: string;
  tone: "inicio" | "prazo" | "postagem" | "pagamento" | "manual";
};

/**
 * Mini calendário mensal com os marcos da campanha: início, prazo, e a
 * data de postagem/pagamento de cada entrega de cada influenciador.
 */
function CampaignCalendar({
  campanha: c,
  influs,
  cronograma,
  onCronogramaChange,
  isRecorrente,
}: {
  campanha: Campaign;
  influs: Influ[];
  cronograma: CronogramaItem[];
  onCronogramaChange: (next: CronogramaItem[]) => void;
  isRecorrente: boolean;
}) {
  const initialCursor = useMemo(() => {
    const first = c.dataInicio ?? c.prazo;
    return first ? new Date(first + "T00:00:00") : new Date();
  }, [c.dataInicio, c.prazo]);
  const [cursor, setCursor] = useState(initialCursor);

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
      }
      add(i.pagamento?.data, { label: `Pagamento · ${i.nome}`, tone: "pagamento" });
    }
    // Itens recorrentes (só faz sentido em cliente recorrente) repetem no
    // mesmo dia-do-mês da data âncora, todo mês — a ocorrência mostrada no
    // grid é sempre a do mês que está sendo visualizado (cursor), não a
    // data âncora original.
    for (const item of cronograma) {
      if (item.recurring) {
        const day = Number(item.date.slice(8, 10));
        const daysInCursorMonth = new Date(
          cursor.getFullYear(),
          cursor.getMonth() + 1,
          0,
        ).getDate();
        const occurrence = new Date(
          cursor.getFullYear(),
          cursor.getMonth(),
          Math.min(day, daysInCursorMonth),
        );
        add(toISODate(occurrence), { label: item.title, tone: "manual" });
      } else {
        add(item.date, { label: item.title, tone: "manual" });
      }
    }
    return map;
  }, [c.dataInicio, c.prazo, influs, cronograma, cursor]);

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
    manual: "bg-rose-500",
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

      <CronogramaManualSection
        cronograma={cronograma}
        onChange={onCronogramaChange}
        isRecorrente={isRecorrente}
      />
    </div>
  );
}

/** Cronograma manual — setado pelo time (data + título + descrição livre),
 * em vez de derivado das entregas dos influenciadores. Mostrado aqui e no
 * portal do cliente. */
function CronogramaManualSection({
  cronograma,
  onChange,
  isRecorrente,
}: {
  cronograma: CronogramaItem[];
  onChange: (next: CronogramaItem[]) => void;
  isRecorrente: boolean;
}) {
  const [date, setDate] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [recurring, setRecurring] = useState(false);

  const add = () => {
    const t = title.trim();
    if (!date || !t) return;
    onChange(
      [
        ...cronograma,
        {
          id: crypto.randomUUID(),
          date,
          title: t,
          description: description.trim() || undefined,
          recurring: isRecorrente && recurring ? true : undefined,
        },
      ].sort((a, b) => a.date.localeCompare(b.date)),
    );
    setDate("");
    setTitle("");
    setDescription("");
    setRecurring(false);
  };

  const remove = (id: string) => onChange(cronograma.filter((i) => i.id !== id));

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Cronograma manual
      </p>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-background p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Data</label>
          <DateField value={date || undefined} onChange={(v) => setDate(v ?? "")} className="h-9" />
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
          <label className="text-[10px] font-medium uppercase text-muted-foreground">Título</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Gravação do vídeo"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="flex min-w-[160px] flex-1 flex-col gap-1">
          <label className="text-[10px] font-medium uppercase text-muted-foreground">
            Descrição (opcional)
          </label>
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="Detalhes adicionais"
            className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          type="button"
          onClick={add}
          disabled={!date || !title.trim()}
          className="h-9 rounded-md bg-brand px-3 text-xs font-medium text-brand-foreground hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          Adicionar
        </button>
        {isRecorrente && (
          <label className="flex h-9 items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-border"
            />
            Repete todo mês (dia {date ? Number(date.slice(8, 10)) : "—"})
          </label>
        )}
      </div>

      {cronograma.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum item de cronograma adicionado.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-background">
          {cronograma.map((item) => (
            <li key={item.id} className="flex items-start gap-3 px-3 py-2.5">
              <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {item.recurring
                    ? `Todo dia ${Number(item.date.slice(8, 10))}`
                    : fmtDate(item.date)}
                </p>
                <p className="truncate text-sm text-foreground">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                aria-label="Remover"
                className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
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
      // `status` (orçado/combinado/publicado) é o eixo orçamentário — o
      // que representa "publicado de verdade" é o `stage` de produção
      // (os dois podem divergir: uma entrega pode estar orçada como
      // "publicado" antes de sequer passar pela aprovação do cliente).
      .filter((e) => e.stage === "PUBLICADA")
      .flatMap((e) => {
        const publicados = (e.anexos ?? []).filter((a) => a.categoria === "Conteúdo final");
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
      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
        Galeria de conteúdos
      </p>
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
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Documentos
        </p>
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
            className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-brand-foreground hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
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

const SUMMARY_TONE_CLASS = {
  warning: "text-warning",
  success: "text-success",
  danger: "text-danger",
} as const;

/** Item da faixa de resumo operacional compacto — um valor por vez, sem
 * virar card grande. Cor semântica só quando `tone` é passada (alerta
 * real: em aprovação/publicadas/gasto acima do orçamento), nunca por
 * decoração. */
function SummaryStat({
  label,
  value,
  tone,
  progress,
}: {
  label: string;
  value: string;
  tone?: keyof typeof SUMMARY_TONE_CLASS;
  /** Barra de progresso presa a ESTA métrica específica (rodada de
   * refinamento — a barra azul que ficava solta embaixo de toda a faixa
   * não tinha rótulo nem métrica associada visível; virou o preenchimento
   * discreto da própria célula "Gasto", com `aria-label` explicando o
   * numerador/denominador reais). */
  progress?: { pct: number; ariaLabel: string; tone?: "danger" | "brand" };
}) {
  return (
    <div className="min-w-[104px] flex-1 border-b border-r border-border/60 px-4 py-3 last:border-r-0 sm:border-b-0">
      <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p
        className={`mt-1 truncate text-base font-bold tabular-nums ${
          tone ? SUMMARY_TONE_CLASS[tone] : "text-foreground"
        }`}
      >
        {value}
      </p>
      {progress && (
        <div
          role="progressbar"
          aria-label={progress.ariaLabel}
          aria-valuenow={Math.round(progress.pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
        >
          <div
            className={`h-full rounded-full ${progress.tone === "danger" ? "bg-danger" : "bg-brand"}`}
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      )}
    </div>
  );
}
