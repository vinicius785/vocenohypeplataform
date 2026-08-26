import { useMemo, useState } from "react";
import { User } from "lucide-react";
import {
  ENTREGA_KANBAN_COLUNAS,
  ENTREGA_KANBAN_COLUNA_LABEL,
  ENTREGA_STAGE_TONE,
  entregaFaseConceitual,
  entregaKanbanColuna,
  type EntregaKanbanColuna,
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
  type Influ,
  type Entrega,
  type EntregaActionOpts,
} from "@/components/influenciadores/InfluencerBoard";

/**
 * Kanban por ENTREGA (não por influenciador) — aba "Produção" da campanha.
 * Populado automaticamente por todo influenciador `APROVADO`; nunca precisa
 * arrastar nada manualmente, o card muda de coluna sozinho quando a ação
 * certa é executada (ver `entregaKanbanColuna`/`entrega-engine.ts`).
 */

type EntregaComDono = { influ: Influ; entrega: Entrega };

const COLUNA_BORDER: Record<EntregaKanbanColuna, string> = {
  ROTEIRO: "border-t-muted-foreground/40",
  CONTEUDO: "border-t-sky-500",
  PUBLICACAO: "border-t-teal-500",
  CONCLUIDO: "border-t-emerald-500",
};

export function ProducaoBoard({
  influs,
  onChange,
}: {
  influs: Influ[];
  onChange: (next: Influ[]) => void;
}) {
  const [selected, setSelected] = useState<{ influId: string; entregaId: string } | null>(null);

  const itens: EntregaComDono[] = useMemo(
    () =>
      influs
        .filter((i) => i.status === "APROVADO")
        .flatMap((influ) => influ.entregas.map((entrega) => ({ influ, entrega }))),
    [influs],
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

  const removeEntrega = (influId: string, entregaId: string) => {
    onChange(
      influs.map((x) =>
        x.id === influId ? { ...x, entregas: x.entregas.filter((e) => e.id !== entregaId) } : x,
      ),
    );
    setSelected(null);
  };

  if (itens.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-16 text-center">
        <p className="text-sm font-medium text-foreground">Nenhuma entrega em produção ainda.</p>
        <p className="max-w-sm text-xs text-muted-foreground">
          Assim que um influenciador for aprovado na aba "Seleção", as entregas dele aparecem aqui
          automaticamente.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {ENTREGA_KANBAN_COLUNAS.map((coluna) => (
          <div key={coluna} className="flex w-[280px] shrink-0 flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {ENTREGA_KANBAN_COLUNA_LABEL[coluna]}
              </h3>
              <span className="text-[11px] font-medium text-muted-foreground">
                {porColuna[coluna].length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {porColuna[coluna].length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 py-6 text-center text-[11px] text-muted-foreground">
                  Vazio
                </div>
              ) : (
                porColuna[coluna].map(({ influ, entrega }) => (
                  <EntregaCard
                    key={entrega.id}
                    influ={influ}
                    entrega={entrega}
                    coluna={coluna}
                    onOpen={() => setSelected({ influId: influ.id, entregaId: entrega.id })}
                    onRunAction={(action, opts) => runAction(influ.id, entrega.id, action, opts)}
                  />
                ))
              )}
            </div>
          </div>
        ))}
      </div>

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
    </>
  );
}

function EntregaCard({
  influ,
  entrega,
  coluna,
  onOpen,
  onRunAction,
}: {
  influ: Influ;
  entrega: Entrega;
  coluna: EntregaKanbanColuna;
  onOpen: () => void;
  onRunAction: (action: EntregaEngineActionKind, opts?: EntregaActionOpts) => void;
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
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`flex cursor-pointer flex-col gap-2 rounded-xl border border-t-2 border-border bg-background p-3 shadow-sm transition-colors hover:border-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring ${COLUNA_BORDER[coluna]}`}
    >
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted ring-1 ring-border">
          {influ.foto ? (
            <img src={influ.foto} alt="" className="h-full w-full object-cover" />
          ) : (
            <User className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
          )}
        </div>
        <p className="min-w-0 truncate text-xs font-semibold text-foreground">
          {influ.nome || "Sem nome"}
        </p>
      </div>

      <p className="truncate text-sm font-medium text-foreground">{label}</p>

      <span
        className={`inline-flex w-fit shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${ENTREGA_STAGE_TONE[stage]}`}
      >
        {fase.subLabel}
      </span>

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
          className="mt-1 inline-flex items-center justify-center gap-1 rounded-full bg-foreground px-2.5 py-1.5 text-[11px] font-semibold text-background shadow-sm hover:opacity-90"
        >
          {step.actionLabel}
        </button>
      ) : (
        step.responsavel === "cliente" && (
          <p className="text-[11px] text-muted-foreground">Aguardando aprovação do cliente</p>
        )
      )}
    </article>
  );
}
