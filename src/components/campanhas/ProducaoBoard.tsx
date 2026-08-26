import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Columns3,
  LayoutList,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  User,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ENTREGA_KANBAN_COLUNAS,
  ENTREGA_KANBAN_COLUNA_LABEL,
  ENTREGA_STAGE_TONE,
  entregaFaseConceitual,
  entregaKanbanColuna,
  type EntregaKanbanColuna,
  type EntregaStage,
} from "@/lib/campanha-status";
import {
  deriveEntregaNextStep,
  applyEntregaAction,
  type EntregaEngineActionKind,
} from "@/lib/entrega-engine";
import {
  EntregaSituacaoBanner,
  EntregaAnexosEditor,
  AutoSaveInput,
  MetricsEditor,
  uploadEntregaAnexo,
  addAnexoComVersao,
  logInfluActivity,
  ENTREGA_ACTION_LOG,
  ENTREGAS_OPTS,
  producaoResumo,
  todayISO,
  type Influ,
  type InfluActivity,
  type Entrega,
  type EntregaAnexoCategoria,
  type EntregaActionOpts,
  type ProducaoResumo,
} from "@/components/influenciadores/InfluencerBoard";

/**
 * Kanban por ENTREGA (não por influenciador) — aba "Produção" da campanha.
 * Populado automaticamente por todo influenciador `APROVADO`. O botão de
 * próxima ação avança sozinho seguindo o motor (`entrega-engine.ts`), mas
 * o card também pode ser arrastado livremente pra qualquer coluna a
 * qualquer momento — o time decide onde colocar, sem depender de rodar
 * a ação certa. Um resumo por influenciador no topo (clicável, filtra a
 * visão abaixo) e um alternador "Por etapa"/"Por influenciador" cobrem o
 * caso de querer ver tudo de UM influenciador junto, em vez de espalhado
 * pelas colunas.
 */

type EntregaComDono = { influ: Influ; entrega: Entrega };
type Visualizacao = "etapa" | "influenciador";
type Ordem = "nome" | "pendencias";
type ResumoInflu = {
  influ: Influ;
  resumo: ProducaoResumo;
  porColuna: Record<EntregaKanbanColuna, number>;
};

const COLUNA_DOT: Record<EntregaKanbanColuna, string> = {
  ROTEIRO: "bg-muted-foreground/40",
  CONTEUDO: "bg-sky-500",
  PUBLICACAO: "bg-teal-500",
  CONCLUIDO: "bg-emerald-500",
};

// Estágio "de entrada" de cada coluna — pra onde um card cai ao ser
// arrastado manualmente pra ela. Só usado quando a coluna de destino é
// DIFERENTE da atual (mover dentro da mesma coluna não muda o sub-estágio
// — evita que soltar de volta em "Roteiro" resete um card em "ajustes
// pedidos" de volta pra "produção").
const COLUNA_ENTRY_STAGE: Record<EntregaKanbanColuna, EntregaStage> = {
  ROTEIRO: "ROTEIRO_PRODUCAO",
  CONTEUDO: "PRODUCAO",
  PUBLICACAO: "PUBLICACAO",
  CONCLUIDO: "PUBLICADA",
};

export function ProducaoBoard({
  influs,
  onChange,
  initialFiltroInfluId,
}: {
  influs: Influ[];
  onChange: (next: Influ[]) => void;
  /** Setado quando se chega aqui a partir de "Ver na aba Produção", no
   * perfil de um influenciador (`InfluencerBoard.tsx`) — pré-filtra a
   * visão pra esse influenciador, em vez de cair na lista inteira sem
   * contexto de quem o time queria olhar. */
  initialFiltroInfluId?: string | null;
}) {
  const [selected, setSelected] = useState<{ influId: string; entregaId: string } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [visualizacao, setVisualizacao] = useState<Visualizacao>("etapa");
  const [ordem, setOrdem] = useState<Ordem>("nome");
  const [filtroInfluId, setFiltroInfluId] = useState<string | null>(initialFiltroInfluId ?? null);
  useEffect(() => {
    if (initialFiltroInfluId) setFiltroInfluId(initialFiltroInfluId);
  }, [initialFiltroInfluId]);

  const aprovados = useMemo(() => influs.filter((i) => i.status === "APROVADO"), [influs]);

  const itens: EntregaComDono[] = useMemo(
    () => aprovados.flatMap((influ) => influ.entregas.map((entrega) => ({ influ, entrega }))),
    [aprovados],
  );

  const itensFiltrados = useMemo(
    () => (filtroInfluId ? itens.filter((it) => it.influ.id === filtroInfluId) : itens),
    [itens, filtroInfluId],
  );

  const porColuna = useMemo(() => {
    const map: Record<EntregaKanbanColuna, EntregaComDono[]> = {
      ROTEIRO: [],
      CONTEUDO: [],
      PUBLICACAO: [],
      CONCLUIDO: [],
    };
    for (const item of itensFiltrados) {
      map[entregaKanbanColuna(item.entrega.stage ?? "ROTEIRO_PRODUCAO")].push(item);
    }
    return map;
  }, [itensFiltrados]);

  // Resumo por influenciador — mostrado sempre no topo (clicável, filtra
  // a visão abaixo pra só aquele influenciador) e usado como fonte da
  // visualização "Por influenciador".
  const resumos: ResumoInflu[] = useMemo(
    () =>
      aprovados.map((influ) => {
        const porColunaInflu: Record<EntregaKanbanColuna, number> = {
          ROTEIRO: 0,
          CONTEUDO: 0,
          PUBLICACAO: 0,
          CONCLUIDO: 0,
        };
        for (const e of influ.entregas) {
          porColunaInflu[entregaKanbanColuna(e.stage ?? "ROTEIRO_PRODUCAO")]++;
        }
        return { influ, resumo: producaoResumo(influ.entregas), porColuna: porColunaInflu };
      }),
    [aprovados],
  );

  const resumosOrdenados = useMemo(() => {
    return [...resumos].sort((a, b) => {
      if (ordem === "pendencias") {
        const pendA = a.resumo.total - a.resumo.publicadas;
        const pendB = b.resumo.total - b.resumo.publicadas;
        if (pendB !== pendA) return pendB - pendA;
      }
      return (a.influ.nome || "").localeCompare(b.influ.nome || "", "pt-BR");
    });
  }, [resumos, ordem]);

  const resumosFiltrados = filtroInfluId
    ? resumosOrdenados.filter((r) => r.influ.id === filtroInfluId)
    : resumosOrdenados;

  const selecionado = selected
    ? itens.find((it) => it.influ.id === selected.influId && it.entrega.id === selected.entregaId)
    : undefined;

  const updateEntrega = (influId: string, entregaId: string, patch: Partial<Entrega>) => {
    onChange(
      influs.map((x) =>
        x.id === influId
          ? { ...x, entregas: x.entregas.map((e) => (e.id === entregaId ? { ...e, ...patch } : e)) }
          : x,
      ),
    );
  };

  // Mesmo padrão de `runEntregaAction` (InfluencerBoard.tsx) — único ponto
  // que executa uma ação do motor e registra na Atividade do influenciador
  // dono, só que operando sobre `influs`/`onChange` recebidos da campanha
  // em vez do estado interno do perfil.
  const runAction = (
    influId: string,
    entregaId: string,
    action: EntregaEngineActionKind,
    opts?: EntregaActionOpts,
  ) => {
    onChange(
      influs.map((x) => {
        if (x.id !== influId) return x;
        const entrega = x.entregas.find((e) => e.id === entregaId);
        if (!entrega) return x;
        const anexos = opts?.anexo
          ? addAnexoComVersao(
              entrega.anexos ?? [],
              opts.anexo.categoria,
              opts.anexo.nome,
              opts.anexo.url,
            )
          : entrega.anexos;
        let patch: Partial<Entrega>;
        try {
          patch = applyEntregaAction({ ...entrega, anexos }, action, opts);
        } catch (err) {
          console.warn("[entrega-engine]", err);
          return x;
        }
        const label = entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo;
        return logInfluActivity(
          {
            ...x,
            entregas: x.entregas.map((e) => (e.id === entregaId ? { ...e, anexos, ...patch } : e)),
          },
          `${ENTREGA_ACTION_LOG[action]} — "${label}"`,
          entregaId,
        );
      }),
    );
  };

  // Mover manualmente pro estágio de entrada da coluna alvo — sem passar
  // pelo motor de ação, de propósito: o time pode querer colocar uma
  // entrega numa fase sem ter seguido o passo a passo (ex. já vinha
  // combinado fora da plataforma). Não valida transição nenhuma.
  const setEntregaStage = (influId: string, entregaId: string, coluna: EntregaKanbanColuna) => {
    const stage = COLUNA_ENTRY_STAGE[coluna];
    onChange(
      influs.map((x) => {
        if (x.id !== influId) return x;
        const entrega = x.entregas.find((e) => e.id === entregaId);
        if (!entrega) return x;
        const isPublicada = stage === "PUBLICADA";
        const patch: Partial<Entrega> = {
          stage,
          status: isPublicada
            ? "publicado"
            : entrega.status === "publicado"
              ? "combinado"
              : entrega.status,
          publicadoEm: isPublicada ? (entrega.publicadoEm ?? todayISO()) : entrega.publicadoEm,
        };
        const label = entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo;
        return logInfluActivity(
          { ...x, entregas: x.entregas.map((e) => (e.id === entregaId ? { ...e, ...patch } : e)) },
          `moveu "${label}" pra ${ENTREGA_KANBAN_COLUNA_LABEL[coluna]}`,
          entregaId,
        );
      }),
    );
  };

  const removeEntrega = (influId: string, entregaId: string) => {
    onChange(
      influs.map((x) =>
        x.id === influId ? { ...x, entregas: x.entregas.filter((e) => e.id !== entregaId) } : x,
      ),
    );
    setSelected(null);
  };

  // Único ponto de criação de entrega pra campanha inteira — a aba
  // Produção passou a ser a única gestão de entregas (perfil do
  // influenciador só mostra um resumo, ver `entregasGerenciadasNaProducao`
  // em InfluencerBoard.tsx), então "adicionar entrega" precisa existir
  // aqui, não só dentro do perfil.
  const addEntrega = (influId: string) => {
    const id = crypto.randomUUID();
    onChange(
      influs.map((x) =>
        x.id === influId
          ? {
              ...x,
              entregas: [
                ...x.entregas,
                {
                  id,
                  tipo: "Reels",
                  quantidade: 1,
                  status: "combinado" as const,
                  stage: "ROTEIRO_PRODUCAO" as const,
                },
              ],
            }
          : x,
      ),
    );
    setSelected({ influId, entregaId: id });
  };

  if (aprovados.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium text-foreground">Nenhum influenciador aprovado ainda.</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Assim que alguém for aprovado na aba "Seleção", ele aparece aqui pra você adicionar as
          entregas dele.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <datalist id="entregas-tipos">
        {ENTREGAS_OPTS.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>

      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Produção
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {itens.length} {itens.length === 1 ? "entrega" : "entregas"} no total
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar entrega
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {aprovados.map((influ) => (
              <DropdownMenuItem key={influ.id} onClick={() => addEntrega(influ.id)}>
                {influ.nome || "Sem nome"}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Resumo por influenciador — sempre visível, clique filtra a
          visão abaixo pra só aquele influenciador (clicar de novo limpa). */}
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Resumo por influenciador
        </h3>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
          {resumosOrdenados.map(({ influ, resumo, porColuna: pc }) => {
            const ativo = filtroInfluId === influ.id;
            return (
              <button
                key={influ.id}
                type="button"
                onClick={() => setFiltroInfluId(ativo ? null : influ.id)}
                className={`flex w-[190px] shrink-0 flex-col gap-1.5 rounded-lg border p-2.5 text-left transition-colors ${
                  ativo
                    ? "border-foreground bg-muted/40"
                    : "border-border bg-background hover:border-foreground/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
                    {influ.foto ? (
                      <img src={influ.foto} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-3 w-3 text-muted-foreground" strokeWidth={1.5} />
                    )}
                  </div>
                  <p className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">
                    {influ.nome || "Sem nome"}
                  </p>
                </div>
                <p className="text-[11px] font-medium text-foreground/80">
                  {resumo.publicadas}/{resumo.total}{" "}
                  {resumo.total === 1 ? "publicada" : "publicadas"}
                </p>
                {resumo.total > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    {ENTREGA_KANBAN_COLUNAS.filter((c) => pc[c] > 0).map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${COLUNA_DOT[c]}`} /> {pc[c]}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Controles de visualização/ordenação */}
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              {visualizacao === "etapa" ? (
                <Columns3 className="h-3.5 w-3.5" />
              ) : (
                <LayoutList className="h-3.5 w-3.5" />
              )}
              {visualizacao === "etapa" ? "Por etapa" : "Por influenciador"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setVisualizacao("etapa")}>
              <Columns3 className="mr-2 h-3.5 w-3.5" /> Por etapa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setVisualizacao("influenciador")}>
              <LayoutList className="mr-2 h-3.5 w-3.5" /> Por influenciador
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {ordem === "nome" ? "Nome (A-Z)" : "Mais pendências"}
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setOrdem("nome")}>Nome (A-Z)</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setOrdem("pendencias")}>
              Mais pendências primeiro
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {filtroInfluId && (
          <button
            type="button"
            onClick={() => setFiltroInfluId(null)}
            className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:border-foreground/30 hover:text-foreground"
          >
            <X className="h-3 w-3" /> Limpar filtro
          </button>
        )}
      </div>

      {itensFiltrados.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma entrega ainda.</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Use "Adicionar entrega" acima pra criar a primeira entrega de um influenciador aprovado.
          </p>
        </div>
      ) : visualizacao === "etapa" ? (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3 [scrollbar-width:thin]">
          {ENTREGA_KANBAN_COLUNAS.map((coluna) => (
            <div
              key={coluna}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggedId) {
                  const arrastado = itens.find((it) => it.entrega.id === draggedId);
                  if (
                    arrastado &&
                    entregaKanbanColuna(arrastado.entrega.stage ?? "ROTEIRO_PRODUCAO") !== coluna
                  ) {
                    setEntregaStage(arrastado.influ.id, arrastado.entrega.id, coluna);
                  }
                }
                setDraggedId(null);
              }}
              className="flex w-[260px] shrink-0 flex-col rounded-xl border border-border bg-background p-3"
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${COLUNA_DOT[coluna]}`} />
                  <h3 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {ENTREGA_KANBAN_COLUNA_LABEL[coluna]}
                  </h3>
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {porColuna[coluna].length}
                </span>
              </div>
              <div className="flex-1 space-y-2">
                {porColuna[coluna].length === 0 ? (
                  <p className="px-1 py-4 text-center text-[11px] text-muted-foreground/50">
                    Nenhuma entrega
                  </p>
                ) : (
                  porColuna[coluna].map(({ influ, entrega }) => (
                    <EntregaCard
                      key={entrega.id}
                      influ={influ}
                      entrega={entrega}
                      onOpen={() => setSelected({ influId: influ.id, entregaId: entrega.id })}
                      onRunAction={(action, opts) => runAction(influ.id, entrega.id, action, opts)}
                      onDragStart={() => setDraggedId(entrega.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {resumosFiltrados.map(({ influ }) => (
            <InfluenciadorProducaoCard
              key={influ.id}
              influ={influ}
              onOpenEntrega={(entregaId) => setSelected({ influId: influ.id, entregaId })}
              onRunAction={(entregaId, action, opts) =>
                runAction(influ.id, entregaId, action, opts)
              }
            />
          ))}
        </div>
      )}

      {selecionado && (
        <EntregaProducaoSheet
          influ={selecionado.influ}
          entrega={selecionado.entrega}
          influActivity={selecionado.influ.activity ?? []}
          open={!!selecionado}
          onOpenChange={(open) => !open && setSelected(null)}
          onChange={(patch) => updateEntrega(selecionado.influ.id, selecionado.entrega.id, patch)}
          onRunAction={(action, opts) =>
            runAction(selecionado.influ.id, selecionado.entrega.id, action, opts)
          }
          onSetStage={(coluna) =>
            setEntregaStage(selecionado.influ.id, selecionado.entrega.id, coluna)
          }
          onRemove={() => removeEntrega(selecionado.influ.id, selecionado.entrega.id)}
        />
      )}
    </section>
  );
}

function EntregaCard({
  influ,
  entrega,
  onOpen,
  onRunAction,
  onDragStart,
}: {
  influ: Influ;
  entrega: Entrega;
  onOpen: () => void;
  onRunAction: (action: EntregaEngineActionKind, opts?: EntregaActionOpts) => void;
  onDragStart: () => void;
}) {
  const stage = entrega.stage ?? "ROTEIRO_PRODUCAO";
  const step = deriveEntregaNextStep(entrega);
  const fase = entregaFaseConceitual(stage);
  const label = entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo || "Sem tipo";
  // Anexar exige escolher um arquivo — abre o painel de detalhe (que já
  // tem o input de arquivo) em vez de rodar a ação sem anexo nenhum.
  const precisaDeArquivo = step.action === "anexar_roteiro" || step.action === "anexar_conteudo";

  return (
    <article
      role="button"
      tabIndex={0}
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group cursor-grab rounded-md border border-border bg-background p-3 text-sm shadow-sm transition-colors hover:border-foreground/20 focus:outline-none focus:ring-2 focus:ring-ring active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate font-medium text-foreground">{label}</p>
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ENTREGA_STAGE_TONE[stage]}`}
        >
          {fase.subLabel}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <div className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
          {influ.foto ? (
            <img src={influ.foto} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-2.5 w-2.5 text-muted-foreground" strokeWidth={1.5} />
          )}
        </div>
        <span className="truncate">{influ.nome || "Sem nome"}</span>
      </div>

      {step.action ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (precisaDeArquivo) {
              onOpen();
              return;
            }
            onRunAction(step.action!);
          }}
          className="mt-2 flex w-full items-center justify-between gap-1 rounded-md bg-muted/60 px-2 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted"
        >
          <span className="truncate">{step.actionLabel}</span>
          <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        step.responsavel === "cliente" && (
          <p className="mt-2 text-[11px] text-muted-foreground">Aguardando aprovação do cliente</p>
        )
      )}
    </article>
  );
}

// Visualização "Por influenciador" — todas as entregas de UM influenciador
// juntas num card só, em vez de espalhadas pelas 4 colunas de etapa.
function InfluenciadorProducaoCard({
  influ,
  onOpenEntrega,
  onRunAction,
}: {
  influ: Influ;
  onOpenEntrega: (entregaId: string) => void;
  onRunAction: (
    entregaId: string,
    action: EntregaEngineActionKind,
    opts?: EntregaActionOpts,
  ) => void;
}) {
  const { total, publicadas } = producaoResumo(influ.entregas);
  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
          {influ.foto ? (
            <img src={influ.foto} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
          )}
        </div>
        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
          {influ.nome || "Sem nome"}
        </p>
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
          {publicadas}/{total} {total === 1 ? "publicada" : "publicadas"}
        </span>
      </div>

      {influ.entregas.length === 0 ? (
        <p className="px-1 py-3 text-center text-[11px] text-muted-foreground/50">
          Nenhuma entrega
        </p>
      ) : (
        <div className="divide-y divide-border/60">
          {influ.entregas.map((entrega) => (
            <EntregaRow
              key={entrega.id}
              entrega={entrega}
              onOpen={() => onOpenEntrega(entrega.id)}
              onRunAction={(action, opts) => onRunAction(entrega.id, action, opts)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntregaRow({
  entrega,
  onOpen,
  onRunAction,
}: {
  entrega: Entrega;
  onOpen: () => void;
  onRunAction: (action: EntregaEngineActionKind, opts?: EntregaActionOpts) => void;
}) {
  const stage = entrega.stage ?? "ROTEIRO_PRODUCAO";
  const step = deriveEntregaNextStep(entrega);
  const label = entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo || "Sem tipo";
  const precisaDeArquivo = step.action === "anexar_roteiro" || step.action === "anexar_conteudo";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="flex cursor-pointer items-center gap-2 py-2 text-xs hover:bg-muted/30"
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${COLUNA_DOT[entregaKanbanColuna(stage)]}`}
      />
      <p className="min-w-0 flex-1 truncate font-medium text-foreground">{label}</p>
      <span
        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${ENTREGA_STAGE_TONE[stage]}`}
      >
        {entregaFaseConceitual(stage).subLabel}
      </span>
      {step.action && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (precisaDeArquivo) {
              onOpen();
              return;
            }
            onRunAction(step.action!);
          }}
          className="shrink-0 rounded-md bg-muted/60 px-2 py-1 text-[10px] font-medium text-foreground hover:bg-muted"
        >
          {step.actionLabel}
        </button>
      )}
    </div>
  );
}

function FieldLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Campo de data compacto (rótulo em cima, não ao lado) — cabe numa
 * coluna estreita de uma grade de 3, diferente da variante de linha
 * inteira usada no perfil do influenciador. */
function PrazoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (v: string | undefined) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="truncate text-[10px] font-medium text-muted-foreground">{label}</span>
      <input
        type="date"
        value={value ?? ""}
        onChange={(ev) => onChange(ev.target.value || undefined)}
        className="w-full min-w-0 rounded-md border border-border bg-background px-1.5 py-1 text-[11px] outline-none focus:ring-1 focus:ring-ring"
      />
    </label>
  );
}

/**
 * Painel de detalhe de UMA entrega, desenhado pra aba Produção — desde o
 * início mostra DE QUEM é a entrega (avatar+nome no topo; o painel
 * antigo, reaproveitado do perfil do influenciador, nunca precisava disso
 * porque só abria dentro do perfil de UM influenciador já visível na
 * tela). Substitui "Situação atual" + "Etapas" + rótulo duplicado da
 * "Próxima ação" (3 blocos dizendo quase a mesma coisa) por um stepper
 * único + banner de situação + um botão de ação só. Ganha também "Mover
 * para", a mesma liberdade de arrastar já existente no board, aqui como
 * botões — pra quem prefere isso a arrastar.
 */
function EntregaProducaoSheet({
  influ,
  entrega,
  influActivity,
  open,
  onOpenChange,
  onChange,
  onRunAction,
  onSetStage,
  onRemove,
}: {
  influ: Influ;
  entrega: Entrega;
  influActivity: InfluActivity[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (patch: Partial<Entrega>) => void;
  onRunAction: (action: EntregaEngineActionKind, opts?: EntregaActionOpts) => void;
  onSetStage: (coluna: EntregaKanbanColuna) => void;
  onRemove: () => void;
}) {
  const stage = entrega.stage ?? "ROTEIRO_PRODUCAO";
  const step = deriveEntregaNextStep(entrega);
  const colunaAtual = entregaKanbanColuna(stage);
  const colunaAtualIndex = ENTREGA_KANBAN_COLUNAS.indexOf(colunaAtual);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [editandoCabecalho, setEditandoCabecalho] = useState(false);

  const reprovacao =
    stage === "ROTEIRO_AJUSTES"
      ? entrega.roteiroReprovacao
      : stage === "CONTEUDO_AJUSTES"
        ? entrega.conteudoReprovacao
        : undefined;

  const historico = influActivity
    .filter((a) =>
      a.entregaId
        ? a.entregaId === entrega.id
        : a.action.toLowerCase().includes(entrega.tipo.toLowerCase()),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const handleActionClick = () => {
    if (!step.action) return;
    if (step.action === "anexar_roteiro" || step.action === "anexar_conteudo") {
      fileRef.current?.click();
      return;
    }
    onRunAction(step.action);
  };

  const handleFileForAction = async (file: File) => {
    if (step.action !== "anexar_roteiro" && step.action !== "anexar_conteudo") return;
    setUploading(true);
    setUploadError("");
    try {
      const url = await uploadEntregaAnexo(file);
      const categoria: EntregaAnexoCategoria =
        step.action === "anexar_roteiro" ? "Roteiro" : "Conteúdo final";
      onRunAction(step.action, { anexo: { categoria, nome: file.name, url } });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Falha ao subir o arquivo.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        <SheetTitle className="sr-only">
          Entrega de {influ.nome} · {entrega.tipo}
        </SheetTitle>
        <SheetDescription className="sr-only">
          Detalhes de progresso, prazos, arquivos, aprovação e histórico desta entrega.
        </SheetDescription>

        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (fileRef.current) fileRef.current.value = "";
            if (file) void handleFileForAction(file);
          }}
        />

        {/* Cabeçalho — de quem é, o quê é. Sempre visível, é a informação
            que mais faltava no painel reaproveitado do perfil. */}
        <div className="flex items-start gap-3 border-b border-border p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
            {influ.foto ? (
              <img src={influ.foto} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-muted-foreground">{influ.nome}</p>
            <p className="truncate text-lg font-bold text-foreground">
              {entrega.tipo || "Sem tipo"}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                · {entrega.quantidade} {entrega.quantidade === 1 ? "unidade" : "unidades"}
              </span>
            </p>
            {entrega.titulo && !editandoCabecalho && (
              <p className="truncate text-xs text-muted-foreground">{entrega.titulo}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditandoCabecalho((v) => !v)}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Editar tipo, título e quantidade"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>

        {editandoCabecalho && (
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 p-3">
            <input
              list="entregas-tipos"
              value={entrega.tipo}
              onChange={(ev) => onChange({ tipo: ev.target.value })}
              placeholder="Tipo (Reels, Stories...)"
              className="min-w-[130px] rounded-md border border-border bg-background px-2 py-1 text-xs font-medium outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              value={entrega.titulo ?? ""}
              onChange={(ev) => onChange({ titulo: ev.target.value || undefined })}
              placeholder="Título (opcional)"
              className="min-w-[130px] flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex shrink-0 items-center rounded-md bg-background">
              <button
                type="button"
                onClick={() => onChange({ quantidade: Math.max(1, entrega.quantidade - 1) })}
                className="h-7 w-7 text-sm text-muted-foreground hover:text-foreground"
              >
                −
              </button>
              <span className="w-7 text-center text-xs font-medium tabular-nums">
                {entrega.quantidade}
              </span>
              <button
                type="button"
                onClick={() => onChange({ quantidade: entrega.quantidade + 1 })}
                className="h-7 w-7 text-sm text-muted-foreground hover:text-foreground"
              >
                +
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {/* Progresso — as 4 colunas do board, num stepper único. Não
              repete "Situação atual"/"Etapas" como dois blocos separados
              dizendo quase a mesma coisa. */}
          <div className="space-y-2">
            <FieldLabel title="Progresso" />
            <div className="flex items-center gap-1.5">
              {ENTREGA_KANBAN_COLUNAS.map((c, i) => (
                <div key={c} className="flex flex-1 flex-col items-center gap-1">
                  <span
                    className={`h-1.5 w-full rounded-full ${
                      i <= colunaAtualIndex ? COLUNA_DOT[c] : "bg-muted"
                    }`}
                  />
                  <span
                    className={`text-center text-[9px] font-medium ${
                      i === colunaAtualIndex ? "text-foreground" : "text-muted-foreground/70"
                    }`}
                  >
                    {ENTREGA_KANBAN_COLUNA_LABEL[c]}
                  </span>
                </div>
              ))}
            </div>
            <EntregaSituacaoBanner stage={stage} reprovacao={reprovacao} />
          </div>

          {/* Próxima ação — um botão só, sem repetir o rótulo por cima. */}
          {step.action ? (
            <button
              type="button"
              onClick={handleActionClick}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background shadow-sm hover:opacity-90 disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Enviando...
                </>
              ) : (
                step.actionLabel
              )}
            </button>
          ) : (
            stage !== "PUBLICADA" && (
              <p className="text-xs text-muted-foreground">
                {step.responsavel === "cliente"
                  ? "Aguardando aprovação do cliente."
                  : "Nenhuma ação pendente no momento."}
              </p>
            )
          )}
          {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}

          {/* Mover manualmente — a mesma liberdade do arraste no board,
              aqui como botões (pedido explícito: poder colocar a entrega
              na fase desejada sem depender da ação certa). */}
          <div className="space-y-2">
            <FieldLabel title="Mover para" hint="Direto, sem passar pela ação." />
            <div className="grid grid-cols-4 gap-1.5">
              {ENTREGA_KANBAN_COLUNAS.map((c) => {
                const ativo = c === colunaAtual;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onSetStage(c)}
                    className={`rounded-md border px-1.5 py-1.5 text-center text-[11px] font-medium transition-colors ${
                      ativo
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                    }`}
                  >
                    {ENTREGA_KANBAN_COLUNA_LABEL[c]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prazos — 3 campos compactos com rótulo em cima do input, não
              ao lado (a variante de linha inteira reservava largura fixa
              pro rótulo, o que estourava/sobrepunha numa coluna estreita
              como esta — o painel é um Sheet lateral, não segue a largura
              da viewport). */}
          <div className="space-y-2">
            <FieldLabel title="Prazos" />
            <div className="grid grid-cols-3 gap-2">
              <PrazoField
                label="Roteiro"
                value={entrega.dataRecebimentoRoteiro}
                onChange={(v) => onChange({ dataRecebimentoRoteiro: v })}
              />
              <PrazoField
                label="Conteúdo"
                value={entrega.dataRecebimentoConteudo}
                onChange={(v) => onChange({ dataRecebimentoConteudo: v })}
              />
              <PrazoField
                label="Publicação"
                value={entrega.dataPostagem}
                onChange={(v) => onChange({ dataPostagem: v })}
              />
            </div>
          </div>

          {/* Arquivos */}
          <div className="space-y-2">
            <FieldLabel title="Arquivos" />
            <EntregaAnexosEditor
              anexos={entrega.anexos ?? []}
              onChange={(anexos) => onChange({ anexos })}
            />
          </div>

          {/* Publicação — só quando já concluída (link + métricas). */}
          {stage === "PUBLICADA" && (
            <div className="space-y-2 border-t border-border pt-4">
              <FieldLabel title="Publicação" />
              <div className="space-y-2">
                <AutoSaveInput
                  key={entrega.id}
                  value={entrega.url ?? ""}
                  onSave={(v) => onChange({ url: v })}
                  placeholder="Link do conteúdo publicado"
                />
                <MetricsEditor value={entrega.metrics} onChange={(m) => onChange({ metrics: m })} />
              </div>
            </div>
          )}

          {/* Histórico */}
          <div className="space-y-2 border-t border-border pt-4">
            <FieldLabel title="Histórico" />
            {historico.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">Nenhum evento registrado ainda.</p>
            ) : (
              <div className="space-y-2">
                {historico.map((a) => (
                  <div key={a.id} className="text-xs leading-relaxed">
                    <span className="font-medium text-foreground">{a.author}</span>{" "}
                    <span className="text-muted-foreground">{a.action}</span>
                    <div className="text-[10px] text-muted-foreground/70">
                      {new Date(a.createdAt).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-border bg-muted/30 p-3">
          <button
            type="button"
            onClick={onRemove}
            className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remover entrega
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
