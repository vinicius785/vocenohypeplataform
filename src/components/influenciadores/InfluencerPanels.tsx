import { useState, type ReactNode } from "react";
import { ChevronRight, MoreVertical, Plus, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { entregaStatusLabel } from "@/lib/entrega-ajustes";
import {
  entregaNome,
  entregaTone,
  type ClientFeedback,
  type EntregaTone,
} from "@/lib/influencer-next-action";
import { formatFeedbackWhen, feedbackExcerpt } from "@/lib/entrega-ajustes";
import type { Entrega } from "@/lib/influencer-model";
import { cn } from "@/lib/utils";
import { CockpitTitle, QuietButton } from "./InfluencerCockpit";

/** Peças de apresentação da V2 do detalhe do influenciador (só layout; as regras estão em
 * `lib/influencer-next-action.ts` e os dados continuam onde sempre estiveram). */

const TONE_DOT: Record<EntregaTone, string> = {
  ok: "bg-emerald-500",
  waiting: "bg-amber-500",
  alert: "bg-rose-500",
  progress: "bg-sky-500",
  neutral: "bg-muted-foreground/50",
};

function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

/** Data mais relevante (a mais recente entre as três da entrega), só como valor informativo. */
function prazoOf(e: Entrega): { label: string; data: string } | null {
  const c: [string, string | undefined][] = [
    ["Roteiro", e.dataRecebimentoRoteiro],
    ["Conteúdo", e.dataRecebimentoConteudo],
    ["Publicação", e.dataPostagem],
  ];
  const ok = c.filter(
    (x): x is [string, string] => !!x[1] && !Number.isNaN(new Date(x[1]).getTime()),
  );
  if (ok.length === 0) return null;
  const [label, data] = ok.reduce((a, b) => (a[1] > b[1] ? a : b));
  return { label, data };
}

/** ENTREGAS — uma linha por entrega (unidade operacional), sem cartões. */
export function EntregasRows({
  entregas,
  onOpen,
  onAdd,
  onRemove,
}: {
  entregas: Entrega[];
  onOpen: (id: string) => void;
  onAdd: () => void;
  onRemove: (e: Entrega) => void;
}) {
  const publicadas = entregas.filter((e) => e.stage === "PUBLICADA").length;
  return (
    <section aria-label="Entregas" className="space-y-1">
      <CockpitTitle
        action={
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-foreground"
          >
            <Plus className="h-3.5 w-3.5" /> Adicionar
          </button>
        }
      >
        Entregas
        {entregas.length > 0 && (
          <span className="ml-1.5 font-normal normal-case tracking-normal">
            · {publicadas}/{entregas.length} publicadas
          </span>
        )}
      </CockpitTitle>
      {entregas.length === 0 ? (
        <p className="py-2 text-sm text-text-secondary">Nenhuma entrega adicionada ainda.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {entregas.map((e) => {
            const prazo = prazoOf(e);
            return (
              <li key={e.id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onOpen(e.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span
                    aria-hidden
                    className={cn("h-2 w-2 shrink-0 rounded-full", TONE_DOT[entregaTone(e)])}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {entregaNome(e)}
                      {!e.grupoId && (
                        <span className="font-normal text-text-secondary">
                          {" "}
                          · {e.quantidade} {e.quantidade === 1 ? "unidade" : "unidades"}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-text-secondary">
                      {entregaStatusLabel(e)}
                    </span>
                  </span>
                  {prazo && (
                    <span
                      title={prazo.label}
                      className="shrink-0 text-xs font-medium tabular-nums text-text-secondary"
                    >
                      {shortDate(prazo.data)}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Mais ações da entrega"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-text-secondary opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onSelect={() => onRemove(e)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Remover entrega
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** FEEDBACK DO CLIENTE — informação prioritária: destaque compacto (filete âmbar, sem preencher o
 * bloco). Só renderiza quando há feedback; mostra o mais recente e a contagem dos demais. */
export function ClientFeedbackBlock({
  items,
  onOpen,
}: {
  items: ClientFeedback[];
  onOpen: (entregaId: string) => void;
}) {
  const [i, setI] = useState(0);
  if (items.length === 0) return null;
  const f = items[Math.min(i, items.length - 1)];
  const excerpt = feedbackExcerpt(f.motivo, 180);
  const when = formatFeedbackWhen(f.respondedAt);
  return (
    <section aria-label="Feedback do cliente" className="space-y-1.5">
      <CockpitTitle
        action={
          <span className="flex items-center gap-3">
            {items.length > 1 && (
              <QuietButton onClick={() => setI((n) => (n + 1) % items.length)}>
                {Math.min(i, items.length - 1) + 1}/{items.length} · Próximo
              </QuietButton>
            )}
            {f.entregaId && (
              <QuietButton onClick={() => onOpen(f.entregaId!)}>
                Ver feedback completo →
              </QuietButton>
            )}
          </span>
        }
      >
        Feedback do cliente
      </CockpitTitle>
      <div className="space-y-1.5 border-l-2 border-amber-500/50 pl-3">
        <p className="text-xs font-medium text-text-secondary">
          {f.etapaLabel}
          {f.entregaNome ? ` · ${f.entregaNome}` : ""}
        </p>
        <p className="text-sm italic text-foreground">“{excerpt.text}”</p>
        <p className="text-xs text-text-secondary">
          {[f.autorNome, when].filter(Boolean).join(" · ")}
        </p>
        <p className="text-xs font-medium text-foreground">{f.statusLabel}</p>
      </div>
    </section>
  );
}

/** MAIS INFORMAÇÕES — uma única área recolhível para o que é consultado raramente. */
export function MoreInfo({
  open,
  onToggle,
  summary,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  summary?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label="Mais informações" className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
          Mais informações
          {summary && (
            <span className="ml-1.5 font-normal normal-case tracking-normal">· {summary}</span>
          )}
        </span>
        <ChevronRight
          className={cn("h-4 w-4 text-text-secondary transition-transform", open && "rotate-90")}
        />
      </button>
      {open && <div className="space-y-5">{children}</div>}
    </section>
  );
}
