import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ExternalLink,
  ImageIcon,
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
  ChevronDown,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/EmptyState";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
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
import { getCampanhaNpsInfluenciadoresStatus } from "@/lib/campanha-nps-influenciador-interno.functions";
import type { InfluNpsBoardProp } from "@/components/influenciadores/InfluencerBoard";
import { CAMPAIGN_TOOLS, type CampaignToolKey } from "./campanhas/tools/campaign-tools";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { OPEN_CAMPANHA_TASK_KEY, OPEN_CAMPANHA_TASK_EVENT } from "./AppShell";
import { TaskBoard, matchesDeadlinePeriod, type Task } from "./tasks/TaskBoard";
import { usePerformanceSettings } from "@/lib/performance-events-store";
import {
  parseMoney,
  fmtBRL,
  fmtDate,
  normalizeInflus,
  totalAceito,
  approvalSlaOverdueDays,
  type Influ,
  type BankInfo,
  type Entrega,
} from "@/lib/influencer-model";
import { InfluencerBoard, BankFields } from "@/components/influenciadores/InfluencerBoard";
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
import { NativeSelect } from "@/components/ui/native-select";

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

  // Indicadores da LISTAGEM (card, "Visão geral", filtro e ordenação por
  // influenciadores) contam só quem já foi aprovado — quem ainda está em
  // inscrição/curadoria/aprovação continua na campanha, mas não entra nos
  // números operacionais daqui (o detalhe da campanha mostra tudo).
  const aprovadosByCampanha = useMemo(() => {
    const map = new Map<string, Influ[]>();
    for (const [id, list] of influsByCampanha) {
      map.set(id, getEligibleCampaignInfluencers(list));
    }
    return map;
  }, [influsByCampanha]);

  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<CampanhaFiltersState>(DEFAULT_CAMPANHA_FILTERS);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardClienteId, setWizardClienteId] = useState<string | null>(null);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);

  const requestDeleteCampanha = async (row: CampanhaRow) => {
    const ok = await confirm(
      `Você está prestes a excluir "${row.campanha.nome}".\nOs influenciadores, tarefas e documentos vinculados também serão removidos.\nEsta ação não pode ser desfeita.`,
      { title: "Excluir campanha?", confirmLabel: "Excluir campanha", destructive: true },
    );
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
    () => filterCampanhas(rows, query, filters, aprovadosByCampanha, influsByCampanha),
    [rows, query, filters, aprovadosByCampanha, influsByCampanha],
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
        aprovadosByCampanha,
      ),
    [filteredRows, filters.status, filters.sort, aprovadosByCampanha],
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
  const totalInflusReais = Array.from(aprovadosByCampanha.values()).reduce(
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
    <>
      <PageContainer className="space-y-6 md:space-y-8">
        <PageHeader title="Campanhas" description="Todas as campanhas vinculadas aos clientes." />

        {hasAnyCampanha && (
          <KpiStrip aria-label="Resumo de campanhas">
            <KpiCell label="Campanhas ativas" value={ativas} />
            <KpiCell label="Em negociação" value={emNegociacao} />
            <KpiCell label="Total de campanhas" value={totalCampanhas} />
          </KpiStrip>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:gap-6 xl:grid-cols-3">
            {visibleRows.map((row) => {
              const influs = aprovadosByCampanha.get(row.campanha.id) ?? [];
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
    </>
  );
}

/* ============================================================
 * Detail page
 * ============================================================ */

/** Resumo com o valor/config de cada tipo de pagamento, pro badge não mostrar só o nome do tipo. */
/** Entregas visíveis na caixa Entregas antes de "Ver todas as entregas →". */
const ENTREGAS_BOX_PREVIEW = 3;
/** Container único das 4 caixas fixas da região inferior do detalhe. */
const BOTTOM_BOX = "surface-card flex flex-col p-4";
const BOTTOM_BOX_TITLE = "text-xs font-semibold uppercase tracking-widest text-muted-foreground";

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

  // Links/status de NPS por influenciador aprovado — carregado uma vez por
  // campanha, só pra alimentar "Copiar link NPS" e o indicador no card do
  // InfluencerBoard (dado completo/agregado fica na aba Influenciadores de
  // Recursos → NPS, buscado à parte só quando aberta).
  const fetchNpsStatus = useServerFn(getCampanhaNpsInfluenciadoresStatus);
  const [npsLinks, setNpsLinks] = useState<
    { influenciadorId: string; token: string; respondido: boolean; score: number | null }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    fetchNpsStatus({ data: { campanhaId: c.id } })
      .then((rows) => {
        if (!cancelled) setNpsLinks(rows);
      })
      .catch(() => {
        if (!cancelled) setNpsLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [c.id]); // eslint-disable-line react-hooks/exhaustive-deps -- fetchNpsStatus (useServerFn) não é estável entre renders
  const npsBoardProp = useMemo<InfluNpsBoardProp>(
    () => ({
      linksByInfluId: Object.fromEntries(
        npsLinks.map((r) => [
          r.influenciadorId,
          { token: r.token, respondido: r.respondido, score: r.score },
        ]),
      ),
      onCopyLink: (influId: string) => {
        const link = npsLinks.find((r) => r.influenciadorId === influId);
        if (!link) return;
        const url = `${window.location.origin}/nps-influenciador/${link.token}`;
        navigator.clipboard
          .writeText(url)
          .then(() => toast.success("Link de NPS copiado"))
          .catch(() => toast.error("Não foi possível copiar o link"));
      },
    }),
    [npsLinks],
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
    null | "documentos" | "calendario" | "composicao" | "direitos" | "relatorioMensal" | "nps"
  >(null);

  // Mesmo link (por cliente, não por campanha — um cliente pode ter várias
  // campanhas atrás do mesmo portal) já usado em ClientesSection; fica
  // também aqui pra não precisar sair da campanha pra copiar o link.
  const clientes = useClientes();
  const setClientes = clientesStore.set;
  const fullCliente = clientes.find((cl) => cl.id === cliente.id);
  const copyClientLink = () => {
    if (!fullCliente) return;
    let token = fullCliente.publicToken;
    if (!token) {
      token = crypto.randomUUID().replace(/-/g, "");
      setClientes((prev) =>
        prev.map((cl) => (cl.id === fullCliente.id ? { ...cl, publicToken: token } : cl)),
      );
    }
    navigator.clipboard
      .writeText(`${window.location.origin}/portal/${token}`)
      .then(() => toast.success("Link do cliente copiado"))
      .catch(() => toast.error("Não foi possível copiar o link"));
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
  const [entregasDialogOpen, setEntregasDialogOpen] = useState(false);
  const eligibleInflus = useMemo(
    () => getEligibleCampaignInfluencers(visibleInflus),
    [visibleInflus],
  );
  const allEntregas = useMemo(() => getEligibleCampaignDeliveries(visibleInflus), [visibleInflus]);
  const entregasPublicadas = allEntregas.filter((x) => x.entrega.stage === "PUBLICADA").length;
  // Resumo por etapa (mesmos rótulos de ENTREGA_STAGE_LABEL) para o
  // cabeçalho da seção Entregas — só contagem do dado existente.
  const entregasStageSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { entrega } of allEntregas)
      counts.set(entrega.stage, (counts.get(entrega.stage) ?? 0) + 1);
    return [...counts.entries()]
      .map(
        ([stage, n]) =>
          `${n} ${ENTREGA_STAGE_LABEL[stage as keyof typeof ENTREGA_STAGE_LABEL].toLowerCase()}`,
      )
      .join(" · ");
  }, [allEntregas]);
  const pctPublicadas =
    allEntregas.length > 0 ? Math.round((entregasPublicadas / allEntregas.length) * 100) : 0;

  // ---- Precisa de atenção — SÓ sinais já calculados em algum lugar do app,
  // nenhuma regra nova: atraso/"vence hoje" de tarefa = mesmo
  // `matchesDeadlinePeriod` (+ corte de horário configurável) do filtro de
  // prazo do TaskBoard; SLA de aprovação = `approvalSlaOverdueDays` (mesmo
  // aviso do card do influenciador); "quem age" de entrega =
  // `nextActionForEntrega`; orçamento estourado = `overBudget` dos KPIs.
  const tasksRef = useRef<HTMLElement>(null);
  const influsRef = useRef<HTMLElement>(null);
  const entregasRef = useRef<HTMLElement>(null);
  const scrollToRef = (el: HTMLElement | null) =>
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  const { settings: performanceSettings } = usePerformanceSettings();
  const cutoffHour = performanceSettings.deadlineCutoffHour;
  const tasksMatching = (key: "atrasada" | "hoje") =>
    visibleTasks.filter(
      (t) =>
        matchesDeadlinePeriod(t, key, cutoffHour) ||
        (t.subtasks ?? []).some((st) => matchesDeadlinePeriod(st, key, cutoffHour)),
    ).length;
  const tarefasAtrasadas = tasksMatching("atrasada");
  const tarefasHoje = tasksMatching("hoje");
  const aprovacaoForaDoSla = visibleInflus.filter((i) => approvalSlaOverdueDays(i) !== null).length;
  const inscritosCount = visibleInflus.filter((i) => i.status === "INSCRITO").length;
  const pendentesEntregas = allEntregas.filter((x) => x.entrega.stage !== "PUBLICADA");
  const entregasComCliente = pendentesEntregas.filter(
    (x) => nextActionForEntrega(x.entrega.stage) === "cliente",
  ).length;
  const entregasComTime = pendentesEntregas.filter(
    (x) => nextActionForEntrega(x.entrega.stage) === "hype",
  ).length;
  const nPlural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const attentionItems: {
    key: string;
    tone: "danger" | "warning" | "neutral";
    text: string;
    action: string;
    onAction: () => void;
  }[] = [];
  if (tarefasAtrasadas > 0)
    attentionItems.push({
      key: "tarefas-atrasadas",
      tone: "danger",
      text: nPlural(tarefasAtrasadas, "tarefa atrasada", "tarefas atrasadas"),
      action: "Ver tarefas",
      onAction: () => scrollToRef(tasksRef.current),
    });
  if (overBudget)
    attentionItems.push({
      key: "orcamento",
      tone: "danger",
      text: `Gasto acima do orçamento em ${fmtBRL(gasto - orcamento)}`,
      action: "Ver influenciadores",
      onAction: () => scrollToRef(influsRef.current),
    });
  if (tarefasHoje > 0)
    attentionItems.push({
      key: "tarefas-hoje",
      tone: "warning",
      text: nPlural(tarefasHoje, "tarefa vence hoje", "tarefas vencem hoje"),
      action: "Ver tarefas",
      onAction: () => scrollToRef(tasksRef.current),
    });
  if (emAprovacao > 0)
    attentionItems.push({
      key: "aprovacao",
      tone: aprovacaoForaDoSla > 0 ? "warning" : "neutral",
      text: `${nPlural(emAprovacao, "perfil aguardando", "perfis aguardando")} aprovação do cliente${
        aprovacaoForaDoSla > 0 ? ` · ${aprovacaoForaDoSla} acima do prazo` : ""
      }`,
      action: "Ver influenciadores",
      onAction: () => scrollToRef(influsRef.current),
    });
  if (inscritosCount > 0)
    attentionItems.push({
      key: "inscritos",
      tone: "neutral",
      text: `${nPlural(inscritosCount, "inscrição nova", "inscrições novas")} para curadoria`,
      action: "Ver influenciadores",
      onAction: () => scrollToRef(influsRef.current),
    });
  if (entregasComTime > 0)
    attentionItems.push({
      key: "entregas-time",
      tone: "neutral",
      text: `${nPlural(entregasComTime, "entrega", "entregas")} com próxima ação: ${NEXT_ACTOR_LABEL.hype}`,
      action: "Ver entregas",
      onAction: () => scrollToRef(entregasRef.current),
    });
  if (entregasComCliente > 0)
    attentionItems.push({
      key: "entregas-cliente",
      tone: "neutral",
      text: `${nPlural(entregasComCliente, "entrega aguardando", "entregas aguardando")} o cliente`,
      action: "Ver entregas",
      onAction: () => scrollToRef(entregasRef.current),
    });

  const [editOpen, setEditOpen] = useState(false);
  const { confirm: confirmDeleteCampanha, confirmDialog: confirmDeleteCampanhaDialog } =
    useConfirm();
  const requestDeleteCampanha = async () => {
    const ok = await confirmDeleteCampanha(
      `Você está prestes a excluir "${c.nome}".\n${
        influs.length > 0
          ? `Os ${influs.length} influenciador(es) vinculados também serão removidos.\n`
          : ""
      }Esta ação não pode ser desfeita.`,
      { title: "Excluir campanha?", confirmLabel: "Excluir campanha", destructive: true },
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
  const canChangeStatus = availableTransitions.length > 0;

  return (
    // Canvas fix (mesma correção do Financeiro/Clientes/Campanhas): fundo
    // muted por trás dos cards, já que --background e --card são
    // idênticos no claro. Sem min-height artificial (2ª rodada corretiva)
    // — a altura é só a do conteúdo real, nunca força espaço vazio.
    <>
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
          </nav>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 items-start gap-4 md:gap-5">
              <ClienteLogo photo={cliente.photo} empresa={cliente.empresa} size="lg" />
              <div className="min-w-0">
                <p
                  role="heading"
                  aria-level={1}
                  className="truncate text-2xl font-semibold tracking-tight text-foreground md:text-3xl"
                >
                  {c.nome}
                </p>
                <p className="mt-0.5 truncate text-sm text-text-secondary">
                  Cliente: <span className="font-medium text-foreground">{cliente.empresa}</span>
                </p>
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
                    <NativeSelect
                      value={monthFilter}
                      onChange={(e) => setMonthFilter(e.target.value)}
                      aria-label="Mês de referência"
                    >
                      {monthOptions.map((m) => (
                        <option key={m.value} value={m.value} className="capitalize">
                          {m.label}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </div>
              </div>
            </div>

            {/* Ações — três níveis, cada coisa num único lugar: "Recursos"
             * (tudo o que se abre/compartilha), "Editar" (a ação direta da
             * página) e "⋮" (administrativo: arquivar/restaurar e, separado,
             * excluir). Peso visual decrescente: Editar > Recursos > ⋮. */}
            <div className="flex shrink-0 items-center gap-1.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-haspopup="menu">
                    Recursos
                    <ChevronDown className="h-3 w-3 text-text-secondary" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                    Operação
                  </DropdownMenuLabel>
                  {(
                    [
                      ["documentos", docs.length],
                      ["calendario", cronograma.length],
                      ["relatorioMensal", relatorios.length],
                      ["nps", undefined],
                    ] as [CampaignToolKey, number | undefined][]
                  ).map(([tool, count]) => {
                    const t = CAMPAIGN_TOOLS[tool];
                    const Icon = t.icon;
                    return (
                      <DropdownMenuItem key={tool} onSelect={() => setOpenPanel(tool)}>
                        <Icon className="h-3.5 w-3.5 text-text-secondary" />
                        <span className="min-w-0 flex-1 truncate">{t.label}</span>
                        {typeof count === "number" && count > 0 && (
                          <span className="text-xs tabular-nums text-text-secondary">{count}</span>
                        )}
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                    Compartilhamento
                  </DropdownMenuLabel>
                  <DropdownMenuItem onSelect={copyClientLink} disabled={!fullCliente}>
                    <LinkIcon className="h-3.5 w-3.5 text-text-secondary" />
                    <span className="min-w-0 flex-1 truncate">Link do cliente</span>
                    <span className="text-[11px] text-text-secondary">Copiar</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setInscricaoOpen(true)} disabled={!fullCliente}>
                    <UserPlus className="h-3.5 w-3.5 text-text-secondary" />
                    <span className="min-w-0 flex-1 truncate">Página de inscrição</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3.5 w-3.5" /> Editar
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="Mais ações"
                    className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary/80 hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canArchiveOrRestore && status !== "archived" && (
                    <DropdownMenuItem onSelect={archiveCampaign}>
                      <Archive className="h-3.5 w-3.5 text-text-secondary" />
                      {ARCHIVE_ACTION.actionLabel}
                    </DropdownMenuItem>
                  )}
                  {canArchiveOrRestore && status === "archived" && (
                    <DropdownMenuItem onSelect={() => void restoreCampaign()}>
                      <ArchiveRestore className="h-3.5 w-3.5 text-text-secondary" />
                      Restaurar campanha
                    </DropdownMenuItem>
                  )}
                  {canArchiveOrRestore && <DropdownMenuSeparator />}
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

        {/* KPIs — barra horizontal única: label + valor principal + contexto
         * secundário. Todos os números vêm do modelo existente (mês
         * selecionado em campanhas recorrentes). */}
        <KpiStrip aria-label="Resumo da campanha">
          <KpiCell
            label="Influenciadores"
            value={eligibleInflus.length}
            complement={`Meta ${totalInflus} · ${enviados}/${totalEnviar} enviados`}
          />
          <KpiCell
            label="Entregas"
            value={`${entregasPublicadas}/${allEntregas.length}`}
            complement={`${pctPublicadas}% publicadas`}
          />
          {orcamento > 0 && (
            <>
              <KpiCell
                label="Orçamento"
                value={fmtBRL(orcamento)}
                complement={`${fmtBRL(gasto)} utilizado`}
              />
              <KpiCell
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
        </KpiStrip>

        {/* PRECISA DE ATENÇÃO — só existe quando há sinal real (ver
         * `attentionItems`); sem pendência, nenhum container é renderizado. */}
        {attentionItems.length > 0 && (
          <section aria-labelledby="campanha-atencao" className="-mt-2 md:-mt-4 lg:-mt-6 xl:-mt-8">
            <p
              role="heading"
              aria-level={2}
              id="campanha-atencao"
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Precisa de atenção
            </p>
            <ul className="mt-1.5 flex flex-col divide-y divide-border/30">
              {attentionItems.map((item) => (
                <li key={item.key} className="flex items-center gap-x-3 py-1.5">
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.tone === "danger"
                        ? "bg-red-500"
                        : item.tone === "warning"
                          ? "bg-amber-500"
                          : "bg-muted-foreground/60"
                    }`}
                  />
                  <span
                    className={`min-w-0 flex-1 text-sm ${
                      item.tone === "danger"
                        ? "font-medium text-red-700 dark:text-red-400"
                        : "text-foreground"
                    }`}
                  >
                    {item.text}
                  </span>
                  <button
                    type="button"
                    onClick={item.onAction}
                    className="shrink-0 whitespace-nowrap text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {item.action} <span aria-hidden>→</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* TAREFAS — sempre visível na Home, nunca atrás de aba. Lista
         * compacta por padrão, Kanban no alternador do próprio TaskBoard;
         * vazio = uma linha só. */}
        <section ref={tasksRef} className="scroll-mt-6">
          <TaskBoard
            tasks={visibleTasks}
            onChange={persistVisibleTasks}
            scope={{ kind: "campanha", id: c.id }}
            initialOpenTaskId={initialTaskId}
            onInitialOpenTaskHandled={onInitialTaskHandled}
            viewToggle
          />
        </section>

        {/* INFLUENCIADORES — sempre visível. Cabeçalho (título/resumo por
         * status/busca/visualização/exportar/novo) vem do próprio board. */}
        <section ref={influsRef} className="scroll-mt-6">
          <InfluencerBoard
            influs={visibleInflus}
            onChange={persistVisibleInflus}
            exportName={c.nome}
            defaultCicloMes={isRecorrente ? monthFilter : undefined}
            cicloMesOptions={isRecorrente ? monthOptions : undefined}
            nps={npsBoardProp}
          />
        </section>

        {/* REGIÃO INFERIOR — 3 caixas fixas, sempre visíveis
         * (sem accordion/collapse/tabs): Entregas (largura total, é o que tem
         * ação operacional) e, abaixo, Briefing | Infos úteis (apoio). Os
         * Recursos (Documentos/Calendário/Relatórios/NPS) vivem num único
         * lugar: o menu "Recursos" do cabeçalho. Desktop `md:grid-cols-2`,
         * mobile 1 coluna na mesma ordem. Todas usam o MESMO container (`BOTTOM_BOX`).
         *
         * PRIVACIDADE: o valor pago pelo cliente (`valorCliente`, e a forma
         * de pagamento do cliente `pagClienteTipo`) NUNCA é renderizado nesta
         * página. Só dados operacionais: composição, pagamento aos
         * influenciadores (`pagTipos`/`pagConfig`/`prazoPag`), direitos. */}
        <div className="grid items-stretch gap-4 md:grid-cols-2">
          {/* 1. ENTREGAS — caixa sempre aberta: resumo por etapa + até
           * ENTREGAS_BOX_PREVIEW itens reais (getEligibleCampaignDeliveries);
           * "Ver todas as entregas →" abre a listagem completa + galeria. */}
          <section
            ref={entregasRef}
            aria-labelledby="campanha-entregas"
            className={`${BOTTOM_BOX} scroll-mt-6 md:col-span-2`}
          >
            <div className="-my-1 flex h-8 items-center">
              <p
                role="heading"
                aria-level={2}
                id="campanha-entregas"
                className={`${BOTTOM_BOX_TITLE} flex items-center gap-2`}
              >
                Entregas
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {allEntregas.length}
                </span>
              </p>
            </div>
            <div className="mt-1.5">
              {allEntregas.length === 0 ? (
                <p className="text-sm text-text-secondary">
                  Nenhuma entrega ainda. Elas aparecem aqui assim que forem criadas para um
                  influenciador aprovado desta campanha.
                </p>
              ) : (
                <>
                  <p className="text-xs text-text-secondary">{entregasStageSummary}</p>
                  <ul className="mt-2 divide-y divide-border/30 border-t border-border/40">
                    {allEntregas.slice(0, ENTREGAS_BOX_PREVIEW).map(({ influ, entrega }) => (
                      <li
                        key={entrega.id}
                        className="flex items-center justify-between gap-3 py-1.5 text-sm"
                      >
                        <span className="min-w-0 truncate text-foreground">
                          <span className="font-medium">{influ.nome}</span>
                          <span className="text-text-secondary">
                            {" "}
                            — {entrega.titulo || entrega.tipo}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${ENTREGA_STAGE_TONE[entrega.stage]}`}
                        >
                          {ENTREGA_STAGE_LABEL[entrega.stage]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            {allEntregas.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setEntregasDialogOpen(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  Ver todas as entregas <span aria-hidden>→</span>
                </button>
              </div>
            )}
          </section>
          {/* 2. BRIEFING */}
          <section aria-labelledby="campanha-briefing" className={BOTTOM_BOX}>
            <div className="-my-1 flex h-8 items-center justify-between gap-2">
              <p role="heading" aria-level={2} id="campanha-briefing" className={BOTTOM_BOX_TITLE}>
                Briefing
              </p>
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3 w-3" /> Editar
              </Button>
            </div>
            <div className="mt-1.5">
              {c.briefing ? (
                <p
                  className={`whitespace-pre-wrap break-words text-sm text-foreground ${
                    briefingIsLong && !briefingExpanded ? "line-clamp-4" : ""
                  }`}
                >
                  {c.briefing}
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-text-secondary">Nenhum briefing cadastrado.</p>
                  <button
                    type="button"
                    onClick={() => setEditOpen(true)}
                    className="shrink-0 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    Adicionar briefing
                  </button>
                </div>
              )}
              {briefingIsLong && (
                <button
                  type="button"
                  onClick={() => setBriefingExpanded((v) => !v)}
                  className="mt-1.5 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {briefingExpanded ? "Ver menos" : "Ver mais"}
                </button>
              )}
            </div>
            {(c.briefingFile || (c.briefingLinks?.length ?? 0) > 0) && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                {c.briefingFile && (
                  <a
                    href={c.briefingFile}
                    download
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-text-brand underline underline-offset-2"
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
                    className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-text-brand underline underline-offset-2"
                  >
                    <LinkIcon className="h-3.5 w-3.5 shrink-0" /> {url}
                  </a>
                ))}
              </div>
            )}
          </section>

          {/* 3. INFOS ÚTEIS (substitui "Contrato") — só operacional. */}
          <section aria-labelledby="campanha-infos" className={BOTTOM_BOX}>
            <div className="-my-1 flex h-8 items-center justify-between gap-2">
              <p role="heading" aria-level={2} id="campanha-infos" className={BOTTOM_BOX_TITLE}>
                Infos úteis
              </p>
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="h-3 w-3" /> Editar
              </Button>
            </div>
            <dl className="mt-1 space-y-3 text-sm">
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  Composição planejada
                </dt>
                <dd className="mt-1">
                  {c.linhas.length > 0 ? (
                    <span className="flex flex-wrap gap-1.5 text-xs">
                      {c.linhas.map((l) => (
                        <span
                          key={l.id}
                          className="rounded-md bg-muted/70 px-2 py-0.5 font-medium text-foreground"
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
              <div>
                <dt className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  Pagamento dos influenciadores
                </dt>
                <dd className="mt-1">
                  {(c.pagTipos?.length ?? 0) > 0 ? (
                    <span className="flex flex-wrap gap-1.5 text-xs">
                      {c.pagTipos.map((t) => {
                        const resumo = pagTipoResumo(t, c.pagConfig?.[t] ?? {});
                        return (
                          <span
                            key={t}
                            className="rounded-md bg-muted/70 px-2 py-0.5 font-medium text-foreground"
                          >
                            <span className="font-medium">{t}</span>
                            {resumo && <span className="text-text-secondary"> · {resumo}</span>}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    <span className="text-text-secondary">Não definido</span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  Prazo de pagamento dos influenciadores
                </dt>
                <dd className="max-w-[50%] shrink-0 truncate text-right font-medium text-foreground">
                  {c.prazoPag || "Não definido"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="flex shrink-0 items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                  <ShieldCheck className="h-3 w-3" /> Direitos de imagem
                </dt>
                <dd className="min-w-0 truncate text-right font-medium text-foreground">
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
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/40 pt-2.5">
              <button
                type="button"
                onClick={() => setOpenPanel("composicao")}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Wallet className="h-3 w-3" /> Formas de pagamento <span aria-hidden>→</span>
              </button>
              <button
                type="button"
                onClick={() => setOpenPanel("direitos")}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <ShieldCheck className="h-3 w-3" /> Direitos de imagem <span aria-hidden>→</span>
              </button>
            </div>
          </section>
        </div>

        <Dialog open={entregasDialogOpen} onOpenChange={setEntregasDialogOpen}>
          <DialogContent className="max-w-2xl border-border bg-card" mobileFullScreen>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <Send className="h-4 w-4" /> Entregas ({allEntregas.length})
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {entregasStageSummary}
            </DialogDescription>
            <div className="max-h-[70vh] overflow-y-auto">
              <ul className="divide-y divide-border/60">
                {allEntregas.map(({ influ, entrega }) => {
                  const nextActor = nextActionForEntrega(entrega.stage);
                  return (
                    <li
                      key={entrega.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 text-sm"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
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
                          className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-text-brand hover:underline"
                        >
                          <ExternalLink className="h-3 w-3" /> Ver publicação
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 border-t border-border/60 pt-3 empty:hidden">
                <GaleriaConteudosSection influs={eligibleInflus} />
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
    </>
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
                  <p className="truncate text-[11px] text-muted-foreground">
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
