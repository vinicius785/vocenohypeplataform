import { useMemo, useState } from "react";
import { ChevronRight, Plus, User } from "lucide-react";
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
  EntregaDetailSheet,
  addAnexoComVersao,
  logInfluActivity,
  ENTREGA_ACTION_LOG,
  ENTREGAS_OPTS,
  todayISO,
  type Influ,
  type Entrega,
  type EntregaActionOpts,
} from "@/components/influenciadores/InfluencerBoard";

/**
 * Kanban por ENTREGA (não por influenciador) — aba "Produção" da campanha.
 * Populado automaticamente por todo influenciador `APROVADO`. O botão de
 * próxima ação avança sozinho seguindo o motor (`entrega-engine.ts`), mas
 * o card também pode ser arrastado livremente pra qualquer coluna a
 * qualquer momento — o time decide onde colocar, sem depender de rodar
 * a ação certa (pedido explícito: mover manualmente pra fase desejada).
 * Mesmo padrão visual do kanban de tarefas (`tasks/TaskBoard.tsx`): coluna
 * é um cartão único contendo a lista, não uma coluna solta flutuando na
 * página.
 */

type EntregaComDono = { influ: Influ; entrega: Entrega };

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
}: {
  influs: Influ[];
  onChange: (next: Influ[]) => void;
}) {
  const [selected, setSelected] = useState<{ influId: string; entregaId: string } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const aprovados = useMemo(() => influs.filter((i) => i.status === "APROVADO"), [influs]);

  const itens: EntregaComDono[] = useMemo(
    () => aprovados.flatMap((influ) => influ.entregas.map((entrega) => ({ influ, entrega }))),
    [aprovados],
  );

  const porColuna = useMemo(() => {
    const map: Record<EntregaKanbanColuna, EntregaComDono[]> = {
      ROTEIRO: [],
      CONTEUDO: [],
      PUBLICACAO: [],
      CONCLUIDO: [],
    };
    for (const item of itens) {
      map[entregaKanbanColuna(item.entrega.stage ?? "ROTEIRO_PRODUCAO")].push(item);
    }
    return map;
  }, [itens]);

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

      {itens.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-16 text-center">
          <p className="text-sm font-medium text-foreground">Nenhuma entrega ainda.</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Use "Adicionar entrega" acima pra criar a primeira entrega de um influenciador aprovado.
          </p>
        </div>
      ) : (
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
      )}

      {selecionado && (
        <EntregaDetailSheet
          entrega={selecionado.entrega}
          influActivity={selecionado.influ.activity ?? []}
          open={!!selecionado}
          onOpenChange={(open) => !open && setSelected(null)}
          onChange={(patch) => updateEntrega(selecionado.influ.id, selecionado.entrega.id, patch)}
          onRunAction={(action, opts) =>
            runAction(selecionado.influ.id, selecionado.entrega.id, action, opts)
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
