import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, X, LayoutGrid, List, Film, ExternalLink } from "lucide-react";
import { respondCampanhaEntregaSession } from "@/lib/portal-auth.functions";
import { ENTREGA_STAGE_TONE } from "@/lib/campanha-status";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import { deriveContentItems } from "../lib/derive";
import type { ContentItem } from "../types/content";

/**
 * Biblioteca de conteúdos — lê `entregas` já presentes em `ClienteLinkData`
 * (nenhuma tabela nova). Sem thumbnail real disponível hoje (o dado não
 * carrega uma imagem de capa, só `url` do post/roteiro) — em vez de um
 * placeholder cinza gigante, cada card mostra um ícone + o essencial
 * (spec explícita: "estado vazio compacto e informativo").
 */

type StatusFilter = "todos" | "aguardando" | "publicado" | "outros";

function statusGroupOf(stage: string): StatusFilter {
  if (stage === "ROTEIRO_APROVACAO" || stage === "CONTEUDO_APROVACAO") return "aguardando";
  if (stage === "PUBLICADA") return "publicado";
  return "outros";
}

function ContentCard({ item, onOpen }: { item: ContentItem; onOpen: () => void }) {
  const { entrega } = item;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-left hover:bg-muted/40"
    >
      <div className="flex h-24 items-center justify-center rounded-md bg-muted/50">
        <Film className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">
          {entrega.titulo || entrega.tipo}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.influencerNome}</p>
      </div>
      <span
        className={`w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${
          ENTREGA_STAGE_TONE[entrega.stage as keyof typeof ENTREGA_STAGE_TONE] ??
          "bg-muted text-muted-foreground"
        }`}
      >
        {entrega.statusCliente}
      </span>
    </button>
  );
}

function ContentRow({ item, onOpen }: { item: ContentItem; onOpen: () => void }) {
  const { entrega } = item;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 text-left hover:bg-muted/40"
    >
      <Film className="h-5 w-5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {entrega.titulo || entrega.tipo}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {item.influencerNome} · {item.campanhaNome}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          ENTREGA_STAGE_TONE[entrega.stage as keyof typeof ENTREGA_STAGE_TONE] ??
          "bg-muted text-muted-foreground"
        }`}
      >
        {entrega.statusCliente}
      </span>
    </button>
  );
}

export function ContentDetailDialog({ item, onClose }: { item: ContentItem; onClose: () => void }) {
  const { entrega } = item;
  const { reload, readOnly } = usePortalSessionData();
  const queryClient = useQueryClient();
  const respondEntregaFn = useServerFn(respondCampanhaEntregaSession);
  const [adjusting, setAdjusting] = useState(false);
  const [comentario, setComentario] = useState("");

  const canDecide = entrega.stage === "ROTEIRO_APROVACAO" || entrega.stage === "CONTEUDO_APROVACAO";

  const mutation = useMutation({
    mutationFn: (vars: { status: "aprovado" | "reprovado"; motivo?: string }) =>
      respondEntregaFn({
        data: {
          campanhaId: item.campanhaId,
          influencerId: item.influencerId,
          entregaId: entrega.id,
          ...vars,
        },
      }),
    onSuccess: () => {
      reload();
      queryClient.invalidateQueries();
      toast.success("Decisão registrada.");
      onClose();
    },
    onError: () => toast.error("Não foi possível registrar a decisão. Tente novamente."),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-xl border border-border bg-card p-5 sm:rounded-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {entrega.titulo || entrega.tipo}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {item.influencerNome} · {item.campanhaNome}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex h-40 items-center justify-center rounded-lg bg-muted/50">
          <Film className="h-8 w-8 text-muted-foreground" />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="mt-0.5 font-medium text-foreground">{entrega.statusCliente}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Última atualização</p>
            <p className="mt-0.5 font-medium text-foreground">
              {entrega.ultimaAtualizacao
                ? new Date(entrega.ultimaAtualizacao).toLocaleDateString("pt-BR")
                : "—"}
            </p>
          </div>
        </div>

        {entrega.url && (
          <a
            href={entrega.url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
          >
            <ExternalLink className="h-4 w-4" /> Abrir publicação
          </a>
        )}

        {canDecide && !readOnly && (
          <div className="mt-5 border-t border-border pt-4">
            {!adjusting ? (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ status: "aprovado" })}
                  className="flex items-center gap-1.5 rounded-md bg-success px-3 py-2 text-sm font-medium text-brand-foreground hover:opacity-90 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Aprovar
                </button>
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => setAdjusting(true)}
                  className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-warning hover:bg-warning-soft disabled:opacity-50"
                >
                  <X className="h-4 w-4" /> Solicitar ajustes
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Descreva o ajuste necessário (obrigatório)..."
                  className="min-h-20 rounded-md border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjusting(false)}
                    className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!comentario.trim() || mutation.isPending}
                    onClick={() =>
                      mutation.mutate({ status: "reprovado", motivo: comentario.trim() })
                    }
                    className="rounded-md bg-warning px-3 py-1.5 text-sm font-medium text-brand-foreground disabled:opacity-50"
                  >
                    Confirmar ajuste
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConteudosV2() {
  const { data } = usePortalSessionData();
  const [view, setView] = useState<"grid" | "list">("grid");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [campaignFilter, setCampaignFilter] = useState<string>("todas");
  const [selected, setSelected] = useState<ContentItem | null>(null);

  const items = useMemo(() => deriveContentItems(data), [data]);

  const filtered = items.filter((item) => {
    if (campaignFilter !== "todas" && item.campanhaId !== campaignFilter) return false;
    if (status !== "todos" && statusGroupOf(item.entrega.stage) !== status) return false;
    return true;
  });

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Conteúdos</h1>
        <p className="mt-1 text-sm text-muted-foreground">{data.clienteNome}</p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={campaignFilter}
          onChange={(e) => setCampaignFilter(e.target.value)}
          className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
        >
          <option value="todas">Todas as campanhas</option>
          {data.campanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>

        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {(["todos", "aguardando", "publicado", "outros"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium capitalize ${
                status === s ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-1 rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`rounded-md p-1.5 ${view === "grid" ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted"}`}
            aria-label="Grade"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-md p-1.5 ${view === "list" ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-muted"}`}
            aria-label="Lista"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum conteúdo encontrado.
        </p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {filtered.map((item) => (
            <ContentCard key={item.entrega.id} item={item} onOpen={() => setSelected(item)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((item) => (
            <ContentRow key={item.entrega.id} item={item} onOpen={() => setSelected(item)} />
          ))}
        </div>
      )}

      {selected && <ContentDetailDialog item={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
