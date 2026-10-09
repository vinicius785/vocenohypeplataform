import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star, Pencil, Trash2, ChevronDown, MoreHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/hooks/use-confirm";
import { formatSeguidores } from "@/lib/format";
import { type BankInflu } from "@/lib/banco-influs-store";
import { producaoResumo } from "@/lib/influencer-model";
import { CAMPANHA_STATUS_LABEL } from "@/components/campanhas/campanha-ui";
import {
  totalSeguidores,
  participacaoProntaParaAvaliacao,
  type ParticipacaoCampanha,
} from "@/lib/influencer-banco-v2";
import {
  mediaAvaliacao,
  mediaGeralAvaliacoes,
  type CampanhaInfluenciadorAvaliacao,
} from "@/lib/campanha-influenciador-avaliacao";
import { getAvaliacoesPorParticipacoes } from "@/lib/campanha-influenciador-avaliacao.functions";
import { getNpsPorParticipacoes } from "@/lib/campanha-nps-influenciador-interno.functions";
import { InfluencerAvaliarDialog } from "./InfluencerAvaliarDialog";
import { InstagramConnectionCard } from "./InstagramConnectionCard";

function initials(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

/** Botão só-de-ícone do header (⋯ e X): mesma linguagem do `ProblemDetailSheet`/`EntregaV2`,
 * com área de clique de 36px e foco visível. */
const HEADER_ICON_BUTTON =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand data-[state=open]:bg-muted data-[state=open]:text-foreground";

const SECTION_HEADING = "text-xs font-semibold uppercase tracking-wide text-text-secondary";

type NpsBasico = {
  influenciadorId: string;
  respondido: boolean;
  score: number | null;
};

function HistoricoItem({
  p,
  avaliacao,
  nps,
  onAvaliar,
}: {
  p: ParticipacaoCampanha;
  avaliacao?: CampanhaInfluenciadorAvaliacao;
  nps?: NpsBasico;
  onAvaliar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const resumo = producaoResumo(p.influ.entregas);
  const podeAvaliar = participacaoProntaParaAvaliacao(p);

  const statusLabel = CAMPANHA_STATUS_LABEL[p.campanhaStatus];

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{p.campanhaNome}</p>
          <p className="truncate text-xs text-text-secondary">
            {p.clienteEmpresa}
            <span className="sm:hidden"> · {statusLabel}</span>
          </p>
        </div>
        <Badge variant="secondary" className="hidden shrink-0 text-[11px] sm:inline-flex">
          {statusLabel}
        </Badge>
        <span className="shrink-0 text-xs tabular-nums text-text-secondary">
          {resumo.publicadas}/{resumo.total} entregas
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            "h-4 w-4 shrink-0 text-text-secondary transition-transform duration-150",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 bg-muted/20 px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-muted/40 p-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                Avaliação do time
              </p>
              {avaliacao ? (
                <p className="mt-0.5 flex items-baseline gap-1.5">
                  <span className="inline-flex items-center gap-1 text-sm font-medium text-foreground">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {mediaAvaliacao(avaliacao).toFixed(1).replace(".", ",")}
                  </span>
                  <span className="text-xs text-text-secondary">1 avaliação</span>
                </p>
              ) : podeAvaliar ? (
                <p className="mt-0.5 inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 dark:text-amber-400">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                    aria-hidden="true"
                  />
                  Avaliação pendente
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-text-secondary">
                  Disponível quando todas as entregas forem publicadas
                </p>
              )}
            </div>
            <div className="rounded-md bg-muted/40 p-2.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">
                NPS do influenciador
              </p>
              {nps?.respondido ? (
                <p className="mt-0.5 text-sm font-medium text-foreground">{nps.score}</p>
              ) : (
                <p className="mt-0.5 text-sm text-text-secondary">Sem resposta</p>
              )}
            </div>
          </div>

          {avaliacao?.observacao && (
            <p className="rounded-md bg-muted/30 px-2.5 py-2 text-xs text-text-secondary">
              “{avaliacao.observacao}”
            </p>
          )}

          {podeAvaliar && (
            <Button variant="outline" size="sm" onClick={onAvaliar}>
              {avaliacao ? "Ver avaliação" : "Avaliar influenciador"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** Perfil completo — `Sheet` grande (padrão já usado pelo workspace atual
 * do Banco), três blocos principais: resumo, perfil e histórico de
 * participações (onde Avaliação do Time e NPS aparecem lado a lado, SEM
 * nunca se somarem). */
export function InfluencerBancoDrawer({
  influ,
  participacoes,
  onClose,
  onEdit,
  onRemove,
}: {
  influ: BankInflu | null;
  participacoes: ParticipacaoCampanha[];
  onClose: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { confirm, confirmDialog } = useConfirm();
  const fetchAvaliacoes = useServerFn(getAvaliacoesPorParticipacoes);
  const fetchNps = useServerFn(getNpsPorParticipacoes);

  const [avaliacoesByParticipacao, setAvaliacoesByParticipacao] = useState<
    Map<string, CampanhaInfluenciadorAvaliacao>
  >(new Map());
  const [npsByParticipacao, setNpsByParticipacao] = useState<Map<string, NpsBasico>>(new Map());
  const [avaliarAlvo, setAvaliarAlvo] = useState<ParticipacaoCampanha | null>(null);

  const ids = useMemo(() => participacoes.map((p) => p.campanhaInfluenciadorId), [participacoes]);

  useEffect(() => {
    if (!influ || ids.length === 0) {
      setAvaliacoesByParticipacao(new Map());
      setNpsByParticipacao(new Map());
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchAvaliacoes({ data: { campanhaInfluenciadorIds: ids } }),
      fetchNps({ data: { campanhaInfluenciadorIds: ids } }),
    ])
      .then(([avals, npsRows]) => {
        if (cancelled) return;
        setAvaliacoesByParticipacao(new Map(avals.map((a) => [a.campanhaInfluenciadorId, a])));
        setNpsByParticipacao(new Map(npsRows.map((n) => [n.influenciadorId, n])));
      })
      .catch(() => {
        if (!cancelled) {
          setAvaliacoesByParticipacao(new Map());
          setNpsByParticipacao(new Map());
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAvaliacoes/fetchNps (useServerFn) não são estáveis entre renders
  }, [influ?.id, ids]);

  if (!influ) return null;

  const rede = influ.redes.find((r) => r.id === influ.redePrincipalId) ?? influ.redes[0];
  const seguidores = totalSeguidores(influ.redes);
  const avaliacoesExistentes = Array.from(avaliacoesByParticipacao.values());
  const mediaGeral = mediaGeralAvaliacoes(avaliacoesExistentes);
  const totalEntregas = participacoes.reduce(
    (sum, p) => sum + producaoResumo(p.influ.entregas).total,
    0,
  );
  const pendentes = participacoes.filter(
    (p) =>
      participacaoProntaParaAvaliacao(p) &&
      !avaliacoesByParticipacao.has(p.campanhaInfluenciadorId),
  );

  const handleRemove = async () => {
    const ok = await confirm(
      `Remover "${influ.nome}" do Banco de Influenciadores? O histórico de campanhas não é afetado.`,
      {
        title: "Excluir influenciador?",
        confirmLabel: "Excluir influenciador",
        destructive: true,
      },
    );
    if (ok) onRemove();
  };

  return (
    <>
      <Sheet open={!!influ} onOpenChange={(v) => !v && onClose()}>
        <SheetContent
          side="right"
          hideClose
          className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:w-[90vw] sm:max-w-[820px]"
        >
          <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar className="h-12 w-12 shrink-0">
                <AvatarImage src={influ.foto} alt="" className="object-cover" />
                <AvatarFallback className="text-base">{initials(influ.nome)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <SheetTitle className="truncate text-base leading-tight sm:text-lg">
                  {influ.nome}
                </SheetTitle>
                <SheetDescription className="truncate">
                  {rede ? `@${rede.handle} · ${rede.plataforma}` : "Sem rede cadastrada"}
                </SheetDescription>
                {influ.nicho && (
                  <Badge variant="secondary" className="mt-1.5 max-w-[180px] text-[11px]">
                    <span className="truncate">{influ.nicho}</span>
                  </Badge>
                )}
              </div>

              {/* Editar (principal) · ⋯ (secundárias/destrutivas) · X (só fecha). O X é
                  separado por um divisor sutil para nunca parecer parte do grupo de ações. */}
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onEdit}
                  aria-label="Editar influenciador"
                  className="h-9 gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Editar</span>
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label="Mais ações do influenciador"
                      className={HEADER_ICON_BUTTON}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuItem
                      onSelect={() => void handleRemove()}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir influenciador
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border" />
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Fechar"
                  className={HEADER_ICON_BUTTON}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
            <KpiStrip aria-label="Resumo do influenciador">
              <KpiCell label="Seguidores" value={formatSeguidores(String(seguidores))} />
              <KpiCell label="Campanhas" value={participacoes.length} />
              <KpiCell
                label="Avaliação do time"
                value={
                  mediaGeral !== null ? mediaGeral.toFixed(1).replace(".", ",") : "Sem avaliação"
                }
                labelExtra={
                  mediaGeral !== null ? (
                    <Star aria-hidden="true" className="h-3 w-3 fill-amber-400 text-amber-400" />
                  ) : undefined
                }
                complement={
                  mediaGeral !== null
                    ? `${avaliacoesExistentes.length} ${avaliacoesExistentes.length === 1 ? "avaliação" : "avaliações"}`
                    : undefined
                }
              />
              <KpiCell label="Entregas totais" value={totalEntregas} />
            </KpiStrip>

            <section>
              <h3 className={SECTION_HEADING}>Contato</h3>
              {influ.telefone || influ.email ? (
                <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  {influ.telefone && (
                    <>
                      <dt className="text-text-secondary">Telefone</dt>
                      <dd className="min-w-0 break-words text-foreground">{influ.telefone}</dd>
                    </>
                  )}
                  {influ.email && (
                    <>
                      <dt className="text-text-secondary">E-mail</dt>
                      <dd className="min-w-0 break-words text-foreground">{influ.email}</dd>
                    </>
                  )}
                </dl>
              ) : (
                <p className="mt-1 text-xs text-text-secondary">Sem contato cadastrado.</p>
              )}
            </section>

            <InstagramConnectionCard influenciadorId={influ.id} />

            {influ.observacoes && (
              <section>
                <h3 className={SECTION_HEADING}>Observações</h3>
                <p className="mt-2 break-words text-sm text-foreground">{influ.observacoes}</p>
              </section>
            )}

            {pendentes.length > 0 && (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
                    aria-hidden="true"
                  />
                  Avaliações pendentes
                </h3>
                <div className="space-y-2">
                  {pendentes.map((p) => {
                    const resumo = producaoResumo(p.influ.entregas);
                    return (
                      <div
                        key={p.campanhaInfluenciadorId}
                        className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {p.campanhaNome}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {resumo.publicadas}/{resumo.total} entregas concluídas
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => setAvaliarAlvo(p)}
                        >
                          Avaliar
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section>
              <h3 className={cn(SECTION_HEADING, "mb-2")}>Histórico de participações</h3>
              {participacoes.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-text-secondary">
                  Nenhuma participação em campanhas encontrada para este influenciador.
                </p>
              ) : (
                <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
                  {participacoes.map((p) => (
                    <HistoricoItem
                      key={p.campanhaInfluenciadorId}
                      p={p}
                      avaliacao={avaliacoesByParticipacao.get(p.campanhaInfluenciadorId)}
                      nps={npsByParticipacao.get(p.campanhaInfluenciadorId)}
                      onAvaliar={() => setAvaliarAlvo(p)}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        </SheetContent>
      </Sheet>

      <InfluencerAvaliarDialog
        open={!!avaliarAlvo}
        participacao={avaliarAlvo}
        existing={
          avaliarAlvo
            ? (avaliacoesByParticipacao.get(avaliarAlvo.campanhaInfluenciadorId) ?? null)
            : null
        }
        onClose={() => setAvaliarAlvo(null)}
        onSaved={(a) => {
          setAvaliacoesByParticipacao((prev) => {
            const next = new Map(prev);
            next.set(a.campanhaInfluenciadorId, a);
            return next;
          });
          setAvaliarAlvo(null);
        }}
      />

      {confirmDialog}
    </>
  );
}
