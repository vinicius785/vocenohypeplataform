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
  type FeedbackTone,
} from "@/lib/influencer-next-action";
import { formatFeedbackWhen, feedbackExcerpt } from "@/lib/entrega-ajustes";
import type { Entrega } from "@/lib/influencer-model";
import { cn } from "@/lib/utils";
import { CockpitTitle, QuietButton } from "./InfluencerCockpit";

/** Peças de apresentação da V2 do detalhe do influenciador (só layout; as regras estão em
 * `lib/influencer-next-action.ts` e os dados continuam onde sempre estiveram). */

/** Cor só como sinal semântico, na mesma família do Início: verde concluído, âmbar aguardando,
 * laranja ajuste pedido, azul em andamento. */
const TONE_DOT: Record<EntregaTone, string> = {
  ok: "bg-emerald-500",
  waiting: "bg-amber-500",
  adjust: "bg-orange-500",
  progress: "bg-sky-500",
  neutral: "bg-muted-foreground/50",
};
const FEEDBACK_BAR: Record<FeedbackTone, string> = {
  adjust: "border-orange-500/60",
  waiting: "border-amber-500/60",
  danger: "border-red-500/60",
};
const FEEDBACK_DOT: Record<FeedbackTone, string> = {
  adjust: "bg-orange-500",
  waiting: "bg-amber-500",
  danger: "bg-red-500",
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
  feedbacks = [],
  onOpen,
  onAdd,
  onRemove,
}: {
  entregas: Entrega[];
  /** Feedbacks do cliente vivos; cada um aparece DENTRO da linha da entrega a que se refere. */
  feedbacks?: ClientFeedback[];
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
            const feedback = feedbacks.find((f) => f.entregaId === e.id);
            return (
              <li key={e.id}>
                <div className="group flex items-center gap-1">
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
                </div>
                {feedback && <FeedbackNote f={feedback} onOpen={onOpen} className="mb-3 ml-5" />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Feedback do cliente, compacto: rótulo, citação curta (texto forte), autor · horário e um rodapé
 * com o que aconteceu depois + "Ver feedback completo →". O destaque é só um filete lateral
 * semântico (laranja = ajuste pedido, âmbar = reenviado aguardando aprovação, vermelho =
 * seleção não aprovada) — nada de caixa colorida. */
export function FeedbackNote({
  f,
  onOpen,
  className,
}: {
  f: ClientFeedback;
  onOpen?: (entregaId: string) => void;
  className?: string;
}) {
  const excerpt = feedbackExcerpt(f.motivo, 150);
  const when = formatFeedbackWhen(f.respondedAt);
  return (
    <div className={cn("space-y-1 border-l-2 pl-3", FEEDBACK_BAR[f.tone], className)}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary">
        Feedback do cliente
        <span className="font-normal normal-case tracking-normal"> · {f.etapaLabel}</span>
      </p>
      <p className="text-sm font-medium leading-snug text-foreground">“{excerpt.text}”</p>
      <p className="text-xs text-text-secondary">
        {[f.autorNome, when].filter(Boolean).join(" · ")}
      </p>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-0.5">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground">
          <span
            aria-hidden
            className={cn("h-1.5 w-1.5 shrink-0 rounded-full", FEEDBACK_DOT[f.tone])}
          />
          {f.statusLabel}
        </p>
        {f.entregaId && onOpen && (
          <QuietButton onClick={() => onOpen(f.entregaId!)}>Ver feedback completo →</QuietButton>
        )}
      </div>
    </div>
  );
}

/** Feedback que NÃO pertence a nenhuma entrega (seleção não aprovada): único caso em que o
 * feedback aparece fora da linha de uma entrega. Sem feedback, não renderiza nada. */
export function SelectionFeedback({ items }: { items: ClientFeedback[] }) {
  const f = items.find((x) => !x.entregaId);
  if (!f) return null;
  return (
    <section aria-label="Feedback do cliente">
      <FeedbackNote f={f} />
    </section>
  );
}
