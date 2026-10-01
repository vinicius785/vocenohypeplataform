import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star, Pencil, Trash2, ChevronDown, ChevronUp, Users } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/hooks/use-confirm";
import { formatSeguidores } from "@/lib/format";
import { type BankInflu } from "@/lib/banco-influs-store";
import { producaoResumo } from "@/components/influenciadores/InfluencerBoard";
import { CAMPANHA_STATUS_LABEL } from "@/components/campanhas/campanha-ui";
import { totalSeguidores, type ParticipacaoCampanha } from "@/lib/influencer-banco-v2";
import {
  mediaAvaliacao,
  mediaGeralAvaliacoes,
  type CampanhaInfluenciadorAvaliacao,
} from "@/lib/campanha-influenciador-avaliacao";
import { getAvaliacoesPorParticipacoes } from "@/lib/campanha-influenciador-avaliacao.functions";
import { getNpsPorParticipacoes } from "@/lib/campanha-nps-influenciador-interno.functions";
import { InfluencerAvaliarDialog } from "./InfluencerAvaliarDialog";

function initials(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

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
  const podeAvaliar = p.campanhaStatus === "completed";

  return (
    <div className="rounded-lg border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{p.campanhaNome}</p>
          <p className="truncate text-xs text-text-secondary">
            {p.clienteEmpresa} · {CAMPANHA_STATUS_LABEL[p.campanhaStatus]} · {resumo.publicadas}/
            {resumo.total} entregas publicadas
          </p>
        </div>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-text-secondary" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-border/60 px-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-muted/40 p-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                Avaliação do time
              </p>
              {avaliacao ? (
                <p className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-foreground">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {mediaAvaliacao(avaliacao).toFixed(1).replace(".", ",")}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-text-secondary">
                  {podeAvaliar ? "Ainda não avaliado" : "Disponível após a conclusão"}
                </p>
              )}
            </div>
            <div className="rounded-md bg-muted/40 p-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
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
              {avaliacao ? "Editar avaliação" : "Avaliar influenciador"}
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

  return (
    <>
      <Sheet open={!!influ} onOpenChange={(v) => !v && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:w-[90vw] sm:max-w-[820px]">
          <SheetHeader className="text-left">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar className="h-14 w-14">
                  <AvatarImage src={influ.foto} alt={influ.nome} />
                  <AvatarFallback className="text-lg">{initials(influ.nome)}</AvatarFallback>
                </Avatar>
                <div>
                  <SheetTitle>{influ.nome}</SheetTitle>
                  <SheetDescription>
                    {rede ? `@${rede.handle} · ${rede.plataforma}` : "Sem rede cadastrada"}
                  </SheetDescription>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {influ.nicho && (
                      <Badge variant="secondary" className="text-[10px]">
                        {influ.nicho}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={onEdit} className="gap-1.5">
                  <Pencil className="h-3.5 w-3.5" /> Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={async () => {
                    if (
                      await confirm(
                        `Remover "${influ.nome}" do Banco de Influenciadores? O histórico de campanhas não é afetado.`,
                      )
                    ) {
                      onRemove();
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </SheetHeader>

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                Seguidores
              </p>
              <p className="mt-0.5 inline-flex items-center gap-1 text-lg font-semibold text-foreground">
                <Users className="h-4 w-4 text-text-secondary" />
                {formatSeguidores(String(seguidores))}
              </p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                Campanhas
              </p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{participacoes.length}</p>
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                Avaliação do time
              </p>
              {mediaGeral !== null ? (
                <p className="mt-0.5 inline-flex items-center gap-1 text-lg font-semibold text-foreground">
                  <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                  {mediaGeral.toFixed(1).replace(".", ",")}
                  <span className="text-xs font-normal text-text-secondary">
                    · {avaliacoesExistentes.length}
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-text-secondary">Sem avaliação</p>
              )}
            </div>
            <div className="rounded-lg border border-border/60 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">
                Entregas totais
              </p>
              <p className="mt-0.5 text-lg font-semibold text-foreground">{totalEntregas}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Contato
              </h3>
              <dl className="space-y-1 text-sm">
                {influ.telefone && (
                  <div className="flex gap-1.5">
                    <dt className="text-text-secondary">Telefone:</dt>
                    <dd className="text-foreground">{influ.telefone}</dd>
                  </div>
                )}
                {influ.email && (
                  <div className="flex gap-1.5">
                    <dt className="text-text-secondary">E-mail:</dt>
                    <dd className="text-foreground">{influ.email}</dd>
                  </div>
                )}
                {!influ.telefone && !influ.email && (
                  <p className="text-text-secondary">Sem contato cadastrado.</p>
                )}
              </dl>
            </div>
            {influ.observacoes && (
              <div>
                <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                  Observações
                </h3>
                <p className="text-sm text-foreground">{influ.observacoes}</p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Histórico de participações
            </h3>
            {participacoes.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-text-secondary">
                Nenhuma participação em campanhas encontrada para este influenciador.
              </p>
            ) : (
              <div className="space-y-2">
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
