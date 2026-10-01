import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronDown,
  ExternalLink,
  ImageIcon,
  ListChecks,
  Link as LinkIcon,
  Megaphone,
  MoreVertical,
  Paperclip,
  Pencil,
  Send,
  ShieldCheck,
  Trash2,
  User,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import {
  PageSummaryPanel,
  SummaryPrimaryMetric,
  SummaryMetric,
} from "@/components/shared/PageSummaryPanel";
import { ClienteLogo } from "@/components/clientes/ClienteLogo";
import { useClientes, clientesStore } from "@/lib/clientes-store";
import {
  VincularCampanhaDialog,
  type Campaign,
  type PagTipo,
  type PagamentoConfig,
} from "./VincularCampanhaDialog";
import { InscricaoPageDialog } from "./campanhas/InscricaoPageDialog";
import { CampanhaCard } from "./campanhas/CampanhaCard";
import { CampanhaNpsTool } from "./campanhas/CampanhaNpsPanel";
import { CampaignToolCard } from "./campanhas/tools/CampaignToolCard";
import { DocumentsTool } from "./campanhas/tools/DocumentsTool";
import { ReportsTool } from "./campanhas/tools/ReportsTool";
import { CalendarTool } from "./campanhas/tools/CalendarTool";
import { CampanhaFiltersBar } from "./campanhas/CampanhaFiltersBar";
import {
  campanhaStatus,
  filterCampanhas,
  sortCampanhas,
  DEFAULT_CAMPANHA_FILTERS,
  CAMPANHA_STATUS_LABEL,
  CAMPANHA_STATUS_TRANSITIONS,
  ARCHIVE_ACTION,
  restoreConfirmMessage,
  buildStatusChangePatch,
  getEligibleCampaignInfluencers,
  getEligibleCampaignDeliveries,
  type CampanhaFiltersState,
  type CampanhaRow,
  type CampanhaStatus,
} from "./campanhas/campanha-ui";
import { buildMesReferenciaOptions } from "@/lib/inscricao-page";
import { useMyAccess } from "@/lib/permissions";
import { PageContainer } from "@/components/shared/PageContainer";
import { SummaryStat } from "@/components/shared/SummaryStat";
import { OPEN_CAMPANHA_TASK_KEY, OPEN_CAMPANHA_TASK_EVENT } from "./AppShell";
import { TaskBoard, type Task } from "./tasks/TaskBoard";
import { TASK_STATUS_CATEGORY } from "@/lib/task-status";
import {
  InfluencerBoard,
  BankFields,
  parseMoney,
  fmtBRL,
  fmtDate,
  normalizeInflus,
  totalAceito,
  type Influ,
  type BankInfo,
  type Entrega,
} from "@/components/influenciadores/InfluencerBoard";
import {
  ENTREGA_STAGE_LABEL,
  ENTREGA_STAGE_TONE,
  nextActionForEntrega,
  NEXT_ACTOR_LABEL,
} from "@/lib/campanha-status";
import { useConfirm, useConfirmChoice } from "@/hooks/use-confirm";
import { CampanhaActivationDialog } from "@/components/campanhas/CampanhaActivationDialog";
import { buildClienteStatusChangePatch, clienteStatus } from "@/components/clientes/cliente-ui";
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

  const openEditCampanha = (row: CampanhaRow) => {
    setWizardClienteId(row.cliente.id);
    setEditingCampaign(row.campanha);
    setWizardOpen(true);
  };

  // `visibleRows` precisa ser calculado ANTES do `if (current)` abaixo —
  // hooks (useMemo) não podem ser chamados condicionalmente, e esse retorno
  // antecipado pra `CampanhaDetail` é condicional.
  //
  // "Concluída" e "Arquivada" nunca aparecem no filtro "Todos" (pedido
  // explícito) — só quando o usuário escolhe esse status especificamente.
  // Isso substitui a antiga seção recolhível "Ver campanhas encerradas":
  // não há mais uma segunda lista separada, é só mais um valor do mesmo
  // filtro de status que já existe pros outros dois.
  const filteredRows = useMemo(
    () => filterCampanhas(rows, query, filters, influsByCampanha),
    [rows, query, filters, influsByCampanha],
  );
  const visibleRows = useMemo(
    () =>
      sortCampanhas(
        filters.status === "todos"
          ? filteredRows.filter((r) => {
              const s = campanhaStatus(r.campanha);
              return s !== "completed" && s !== "archived";
            })
          : filteredRows,
        filters.sort,
        influsByCampanha,
      ),
    [filteredRows, filters.status, filters.sort, influsByCampanha],
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
  const ativas = rows.filter((r) => campanhaStatus(r.campanha) === "active").length;
  const emNegociacao = rows.filter((r) => campanhaStatus(r.campanha) === "planning").length;
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
        </div>

        {hasAnyCampanha && (
          <PageSummaryPanel title="Visão geral">
            <SummaryPrimaryMetric value={String(ativas)} label="campanhas ativas" />
            <SummaryMetric label="Total" value={totalCampanhas} />
            <SummaryMetric label="Influenciadores" value={totalInflusReais} />
            <SummaryMetric label="Em negociação" value={emNegociacao} />
          </PageSummaryPanel>
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
            description="Campanhas são criadas dentro da Central do Cliente."
            primaryAction={{
              label: "Abrir Clientes",
              onClick: () =>
                window.dispatchEvent(new CustomEvent("nav:section", { detail: "clientes" })),
            }}
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
      </PageContainer>

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

  // Tarefas recolhidas por padrão (não dominam o 1º viewport); abrem
  // sozinhas quando chega um deep link de tarefa (notificação/AppShell),
  // pra `TaskBoard` montar e abrir a tarefa como antes.
  const [tasksExpanded, setTasksExpanded] = useState(Boolean(initialTaskId));
  useEffect(() => {
    if (initialTaskId) setTasksExpanded(true);
  }, [initialTaskId]);
  const todayIso = new Date().toISOString().slice(0, 10);
  const openTasks = visibleTasks.filter((t) => {
    const cat = TASK_STATUS_CATEGORY[t.status];
    return cat !== "done" && cat !== "archived";
  });
  const openTasksCount = openTasks.length;
  const overdueTasksCount = openTasks.filter(
    (t) => t.dueDate && t.dueDate.slice(0, 10) < todayIso,
  ).length;

  const [openPanel, setOpenPanel] = useState<
    null | "documentos" | "calendario" | "composicao" | "direitos" | "relatorioMensal" | "nps"
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

  const status = campanhaStatus(c);
  const briefingIsLong = (c.briefing?.length ?? 0) > 320;

  // Troca de status — transições fixas (Negociação→Ativa sem confirmação;
  // Ativa↔Concluída com confirmação, textos exatos pedidos) + arquivar (de
  // qualquer status) + restaurar (pergunta o status de destino só quando
  // `statusBeforeArchive` não foi gravado — ex. campanhas arquivadas antes
  // desta fase existir).
  const { confirm: confirmStatusChange, confirmDialog: confirmStatusChangeDialog } = useConfirm();
  const { confirmChoice: confirmRestoreChoice, confirmChoiceDialog: confirmRestoreChoiceDialog } =
    useConfirmChoice<CampanhaStatus>();
  const applyStatusChange = (next: CampanhaStatus) =>
    saveInscricaoPage(buildStatusChangePatch(c, next));
  // Ativação (Negociação → Ativa, Fase 3): abre o dialog com checklist,
  // "sem faturamento" e — se o cliente ainda está "Captação" — o aviso de
  // que ele também será ativado. Cliente + campanha num único update.
  const [activationOpen, setActivationOpen] = useState(false);
  const clienteNegotiating = fullCliente ? clienteStatus(fullCliente) === "capture" : false;
  const confirmActivation = ({
    semFaturamento,
    semFaturamentoMotivo,
  }: {
    semFaturamento: boolean;
    semFaturamentoMotivo?: string;
  }) => {
    setActivationOpen(false);
    const campPatch: Partial<Campaign> = {
      ...buildStatusChangePatch(c, "active"),
      semFaturamento,
      semFaturamentoMotivo: semFaturamento ? semFaturamentoMotivo : undefined,
    };
    const clientePatch =
      fullCliente && clienteNegotiating
        ? buildClienteStatusChangePatch(
            fullCliente,
            "active",
            `Ativado junto com a campanha "${c.nome}"`,
          )
        : {};
    setClientes((prev) =>
      prev.map((cl) =>
        cl.id !== cliente.id
          ? cl
          : {
              ...cl,
              ...clientePatch,
              campanhas: (cl.campanhas ?? []).map((camp) =>
                camp.id === c.id ? { ...camp, ...campPatch } : camp,
              ),
            },
      ),
    );
  };
  const changeStatus = async (next: CampanhaStatus, confirmMessage?: string) => {
    if (next === "active" && status === "planning") {
      setActivationOpen(true);
      return;
    }
    if (confirmMessage) {
      const ok = await confirmStatusChange(confirmMessage);
      if (!ok) return;
    }
    applyStatusChange(next);
  };
  const archiveCampaign = () => void changeStatus("archived", ARCHIVE_ACTION.confirmMessage);
  const restoreCampaign = async () => {
    const target =
      c.statusBeforeArchive ??
      (await confirmRestoreChoice(
        "Esta campanha foi arquivada antes de o histórico de status existir — escolha pra onde restaurá-la.",
        [
          { value: "planning", label: CAMPANHA_STATUS_LABEL.planning },
          { value: "active", label: CAMPANHA_STATUS_LABEL.active },
          { value: "completed", label: CAMPANHA_STATUS_LABEL.completed },
        ],
        "Restaurar campanha",
      ));
    if (!target) return;
    const ok = await confirmStatusChange(restoreConfirmMessage(target));
    if (!ok) return;
    applyStatusChange(target);
  };

  // Permissões (pedido: "administrador: todas as transições; gestor:
  // transições operacionais; membro: só visualização"). Este app só tem
  // admin/membro de verdade em `user_roles` (sem papel "gestor" à parte) —
  // qualquer um com a permissão `campanhas` já vale como "gestor" aqui, e
  // arquivar/restaurar (a ação mais consequente, difícil de reverter sem
  // saber o status anterior) fica reservada a admin. Quem chegou nesta
  // tela já passou pela RLS de `campanhas`; não checar de novo aqui seria
  // redundante, só a distinção admin/não-admin é nova.
  const myAccess = useMyAccess();
  const canArchiveOrRestore = Boolean(myAccess?.isAdmin);
  const availableTransitions = CAMPANHA_STATUS_TRANSITIONS[status];
  const canChangeStatus = availableTransitions.length > 0 || canArchiveOrRestore;

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
        {confirmDeleteCampanhaDialog}
        {confirmStatusChangeDialog}
        {confirmRestoreChoiceDialog}
        <CampanhaActivationDialog
          open={activationOpen}
          campaign={c}
          clienteNegotiating={clienteNegotiating}
          onCancel={() => setActivationOpen(false)}
          onConfirm={confirmActivation}
        />

        {/* CABEÇALHO DA CAMPANHA — breadcrumb + identidade/ações agrupados
         * num único bloco visual (gap interno pequeno, "content gap");
         * sem hero colorido, azul só nos elementos interativos (botão
         * primário, badges de status/foco). Nome da campanha é o
         * elemento principal (maior peso tipográfico). */}
        <div className="space-y-3">
          <nav aria-label="Navegação" className="flex items-center gap-1.5 text-xs">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1 text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Campanhas
            </button>
            <span className="text-text-secondary">/</span>
            <span className="min-w-0 truncate text-text-secondary">{c.nome}</span>
          </nav>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium uppercase tracking-wide text-text-secondary">
                  {cliente.empresa}
                </p>
                <h1 className="mt-0.5 truncate text-2xl font-bold tracking-tight text-foreground md:text-[28px]">
                  {c.nome}
                </h1>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={!canChangeStatus}
                        className="disabled:cursor-default"
                      >
                        <Badge
                          variant={
                            status === "active"
                              ? "success"
                              : status === "completed"
                                ? "secondary"
                                : "outline"
                          }
                          className={canChangeStatus ? "cursor-pointer hover:opacity-80" : ""}
                        >
                          {CAMPANHA_STATUS_LABEL[status]}
                        </Badge>
                      </button>
                    </DropdownMenuTrigger>
                    {canChangeStatus && (
                      <DropdownMenuContent align="start">
                        {CAMPANHA_STATUS_TRANSITIONS[status].map((t) => (
                          <DropdownMenuItem
                            key={t.to}
                            onSelect={() =>
                              void changeStatus(t.to, t.needsConfirm ? t.confirmMessage : undefined)
                            }
                          >
                            {t.actionLabel}
                          </DropdownMenuItem>
                        ))}
                        {canArchiveOrRestore && status !== "archived" && (
                          <DropdownMenuItem
                            onSelect={archiveCampaign}
                            className="text-destructive focus:text-destructive"
                          >
                            {ARCHIVE_ACTION.actionLabel}
                          </DropdownMenuItem>
                        )}
                        {canArchiveOrRestore && status === "archived" && (
                          <DropdownMenuItem onSelect={() => void restoreCampaign()}>
                            Restaurar campanha
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    )}
                  </DropdownMenu>
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
              <Button variant="ghost" size="sm" onClick={copyClientLink} disabled={!fullCliente}>
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

          {(c.activity?.length ?? 0) > 0 && (
            <details className="group text-xs text-text-secondary">
              <summary className="cursor-pointer select-none font-medium hover:text-foreground">
                Histórico de status ({c.activity!.length})
              </summary>
              <ul className="mt-2 space-y-1.5 border-l border-border/60 pl-3">
                {[...c.activity!]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .map((entry) => (
                    <li key={entry.id}>
                      <span className="font-medium text-foreground">{entry.author}</span>{" "}
                      {entry.action}
                      <span className="ml-1.5 text-text-secondary/70">
                        ·{" "}
                        {new Date(entry.createdAt).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </span>
                    </li>
                  ))}
              </ul>
            </details>
          )}
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
            {/* Hierarquia (redesenho): só os 5 indicadores OPERACIONAIS
             * ganham valor em destaque; os secundários (meta, enviados,
             * em aprovação, saldo) continuam visíveis como `complement`
             * da métrica a que pertencem — nenhum dado removido, só
             * deixam de competir com o valor principal. */}
            <SummaryStat
              label="Influenciadores adicionados"
              value={visibleInflus.length.toString()}
              complement={`Meta de ${totalInflus}`}
            />
            <SummaryStat
              label="Influenciadores aprovados"
              value={eligibleInflus.length.toString()}
              complement={`${enviados}/${totalEnviar} enviados · ${emAprovacao} em aprovação`}
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
                  complement={`Saldo ${fmtBRL(disponivel)}`}
                  tone={overBudget ? "danger" : undefined}
                  progress={{
                    pct: Math.max(pctGasto, 2),
                    ariaLabel: `Gasto: ${fmtBRL(gasto)} de ${fmtBRL(orcamento)} do orçamento (${Math.round(pctGasto)}%)`,
                    tone: overBudget ? "danger" : "brand",
                  }}
                />
              </>
            )}
          </div>
        </div>

        {/* INFORMAÇÕES DA CAMPANHA — bento compacto em duas colunas flex
         * independentes (ver comentário abaixo pra detalhe da estrutura).
         * Nenhum card usa altura fixa/mínima. */}
        <section aria-label="Informações da campanha">
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
           * só dos `order-*` em cada card: Briefing → Ferramentas →
           * Contrato (composição/pagamentos/direitos num card só). */}
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

              {/* Ferramentas da campanha — cards descobríveis (ícone, nome,
               * descrição curta, contador). Cada um abre a ferramenta no
               * `CampaignToolShell` (ver ./campanhas/tools). */}
              <div className="order-3 rounded-2xl bg-card p-4 dark:shadow-none md:order-none">
                <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Ferramentas
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CampaignToolCard
                    tool="documentos"
                    count={docs.length}
                    onOpen={() => setOpenPanel("documentos")}
                  />
                  <CampaignToolCard
                    tool="calendario"
                    count={cronograma.length}
                    onOpen={() => setOpenPanel("calendario")}
                  />
                  <CampaignToolCard
                    tool="relatorioMensal"
                    count={relatorios.length}
                    onOpen={() => setOpenPanel("relatorioMensal")}
                  />
                  <CampaignToolCard tool="nps" onOpen={() => setOpenPanel("nps")} />
                </div>
              </div>
            </div>

            {/* CONTRATO — Composição & pagamentos + Direitos de imagem num
             * único card secundário (antes eram 2 cards competindo com o
             * Briefing). Resumo enxuto aqui; o detalhe completo (formas de
             * pagamento, observações dos direitos) abre nos dialogs
             * `composicao`/`direitos` que já existiam neste componente. */}
            <div className="contents md:flex md:w-1/3 md:flex-col md:gap-3 lg:gap-4">
              <div className="order-4 rounded-2xl bg-card p-4 dark:shadow-none md:order-none">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Contrato
                </p>
                <dl className="mt-3 space-y-2.5 text-sm">
                  <div>
                    <dt className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                      Composição planejada
                    </dt>
                    <dd className="mt-1">
                      {c.linhas.length > 0 ? (
                        <span className="flex flex-wrap gap-1.5 text-xs">
                          {c.linhas.map((l) => (
                            <span
                              key={l.id}
                              className="rounded-md bg-muted px-2 py-0.5 text-foreground"
                            >
                              {l.quantidade}× {l.tipo || "—"} · {l.tamanho || "—"}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-text-secondary">Nenhuma definida.</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-text-secondary">Valor do cliente</dt>
                    <dd className="truncate text-right text-foreground">
                      {c.valorCliente || "Não definido"}
                      {c.pagClienteTipo ? ` · ${c.pagClienteTipo}` : ""}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-xs text-text-secondary">Prazo de pagamento</dt>
                    <dd className="truncate text-right text-foreground">
                      {c.prazoPag || "Não definido"}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="flex items-center gap-1 text-xs text-text-secondary">
                      <ShieldCheck className="h-3 w-3" /> Direitos de imagem
                    </dt>
                    <dd className="min-w-0 truncate text-right text-foreground">
                      {c.direitosImagem?.permitido
                        ? [
                            c.direitosImagem.usos.join(", "),
                            c.direitosImagem.duracaoDias
                              ? `${c.direitosImagem.duracaoDias} dias`
                              : "Indeterminada",
                            c.direitosImagem.exclusividade
                              ? `Exclusividade${c.direitosImagem.exclusividadeSegmento ? `: ${c.direitosImagem.exclusividadeSegmento}` : ""}`
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : "Não definidos"}
                    </dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/60 pt-3">
                  <button
                    type="button"
                    onClick={() => setOpenPanel("composicao")}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Wallet className="h-3 w-3" /> Formas de pagamento
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpenPanel("direitos")}
                    className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <ShieldCheck className="h-3 w-3" /> Direitos de imagem
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* TAREFAS — sempre visível, nunca atrás de aba. `TaskBoard` já
         * renderiza seu próprio cabeçalho (título "Tarefas"/total/ordenar/
         * filtrar/Nova tarefa) — nenhum título extra aqui, senão duplica
         * (achado real desta rodada corretiva: "TAREFAS" aparecia 2x). */}
        <section className="rounded-2xl bg-card dark:shadow-none">
          <button
            type="button"
            onClick={() => setTasksExpanded((v) => !v)}
            aria-expanded={tasksExpanded}
            className="flex w-full items-center justify-between gap-2 px-5 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
              <ListChecks className="h-4 w-4 text-text-secondary" />
              Tarefas
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-text-secondary">
                {openTasksCount} em aberto
              </span>
              {overdueTasksCount > 0 && (
                <span className="text-xs font-medium text-danger">
                  {overdueTasksCount} atrasada{overdueTasksCount > 1 ? "s" : ""}
                </span>
              )}
            </span>
            <span className="flex items-center gap-1 text-xs font-medium text-text-secondary">
              {tasksExpanded ? "Recolher" : "Ver tarefas"}
              <ChevronDown
                className={`h-4 w-4 transition-transform ${tasksExpanded ? "rotate-180" : ""}`}
              />
            </span>
          </button>
          {tasksExpanded && (
            <div className="border-t border-border/60 p-4 md:p-5">
              <TaskBoard
                tasks={visibleTasks}
                onChange={persistVisibleTasks}
                scope={{ kind: "campanha", id: c.id }}
                initialOpenTaskId={initialTaskId}
                onInitialOpenTaskHandled={onInitialTaskHandled}
              />
            </div>
          )}
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

        {/* Ferramentas da campanha — todas no mesmo CampaignToolShell. */}
        <DocumentsTool
          open={openPanel === "documentos"}
          onOpenChange={(o) => !o && setOpenPanel(null)}
          campanhaNome={c.nome}
          docs={docs}
          onChange={persistDocs}
        />
        <CalendarTool
          open={openPanel === "calendario"}
          onOpenChange={(o) => !o && setOpenPanel(null)}
          campanha={c}
          influs={visibleInflus}
          cronograma={cronograma}
          onCronogramaChange={persistCronograma}
          isRecorrente={isRecorrente}
        />
        <ReportsTool
          open={openPanel === "relatorioMensal"}
          onOpenChange={(o) => !o && setOpenPanel(null)}
          campanhaNome={c.nome}
          relatoriosMensais={c.relatoriosMensais}
          onChange={(next) => saveInscricaoPage({ relatoriosMensais: next })}
        />
        <CampanhaNpsTool
          open={openPanel === "nps"}
          onOpenChange={(o) => !o && setOpenPanel(null)}
          campanhaId={c.id}
          campanhaNome={c.nome}
        />

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
      </PageContainer>
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
