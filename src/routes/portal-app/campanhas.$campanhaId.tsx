import { createFileRoute, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { usePortalSessionData } from "@/components/portal/portal-session-context";
import {
  respondCampanhaInfluSession,
  respondCampanhaEntregaSession,
  reopenCampanhaInfluSession,
} from "@/lib/portal-auth.functions";
import { PERFIL_REJEICAO_MOTIVOS, type PerfilRejeicaoMotivo } from "@/lib/campanha-status";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import type { PublicInfluencer, PublicEntrega } from "@/lib/portal-types";

/**
 * `/portal-app/campanhas/$campanhaId` — detalhe de campanha para o Portal
 * autenticado (Phase 2b). Cobre aprovar/reprovar perfil e responder
 * entregas (roteiro/conteúdo), reaproveitando as MESMAS server functions de
 * negócio do fluxo por token (via `*Session` em `portal-auth.functions.ts`,
 * que por sua vez chamam `applyInfluApproval`/`applyEntregaApproval` de
 * `campanha-aprovacao.ts` — zero duplicação de regra de negócio).
 *
 * Deliberadamente mais simples que `routes/portal.$token/campanhas.$campanhaId.tsx`
 * (534 linhas, com filtro segmentado + card de revisão do Hypito) — portar
 * aquele visual 1:1 exigiria generalizar `portal-widgets.tsx` (2072 linhas,
 * hoje inteiramente parametrizado por `token`) pra aceitar tanto token
 * quanto sessão, uma refatoração maior que não coube com segurança nesta
 * fase (ver relatório final, "Deferido pra Fase 3"). Esta página cobre o
 * fluxo funcional completo (ver influenciadores, aprovar/reprovar perfil,
 * responder entregas) com uma UI própria, mais enxuta.
 *
 * `beforeLoad` nunca confia no `campanhaId` da URL: ele só é aceito depois
 * de confirmar que pertence à organização já resolvida pela rota-pai
 * (`portal-app/route.tsx`) — mesmo espírito de `assertCampanhaDoCliente`,
 * mas a checagem de posse real acontece no servidor a cada mutação (
 * `assertCampanhaInCliente` dentro de cada `*Session` function); aqui no
 * client só decide se renderiza a página ou um 404-equivalente.
 */
export const Route = createFileRoute("/portal-app/campanhas/$campanhaId")({
  ssr: false,
  component: PortalAppCampanhaDetalhe,
});

function PortalAppCampanhaDetalhe() {
  const { campanhaId } = Route.useParams();
  const { data, reload, readOnly } = usePortalSessionData();
  const campanha = data.campanhas.find((c) => c.id === campanhaId);

  if (!campanha) {
    // Nunca vaza a existência de campanhas de outras organizações — mesma
    // tela de "não encontrado" tanto pra id inexistente quanto pra id de
    // outra organização.
    throw notFound();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight text-foreground">{campanha.nome}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {campanha.influencers.length} influenciador(es)
      </p>

      <div className="mt-6 space-y-4">
        {campanha.influencers.map((influ) => (
          <InfluCard
            key={influ.id}
            campanhaId={campanhaId}
            influ={influ}
            readOnly={readOnly}
            onChanged={reload}
          />
        ))}
        {campanha.influencers.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum influenciador enviado ainda.</p>
        )}
      </div>
    </div>
  );
}

function InfluCard({
  campanhaId,
  influ,
  readOnly,
  onChanged,
}: {
  campanhaId: string;
  influ: PublicInfluencer;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const respondInflu = useServerFn(respondCampanhaInfluSession);
  const reopenInflu = useServerFn(reopenCampanhaInfluSession);
  const [motivo, setMotivo] = useState<PerfilRejeicaoMotivo | "">("");
  const [comentario, setComentario] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);

  const pendente = influ.status === "ENVIADO_AO_CLIENTE";
  const aprovado = influ.status === "APROVADO";
  const recusado = influ.status === "RECUSADO";

  const handleAprovar = async () => {
    setBusy(true);
    try {
      await respondInflu({ data: { campanhaId, influencerId: influ.id, status: "aprovado" } });
      toast.success("Perfil aprovado.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao aprovar.");
    } finally {
      setBusy(false);
    }
  };

  const handleReprovar = async () => {
    if (!motivo) {
      toast.error("Selecione um motivo.");
      return;
    }
    if (motivo === "Outro" && !comentario.trim()) {
      toast.error('Comentário obrigatório quando o motivo é "Outro".');
      return;
    }
    setBusy(true);
    try {
      await respondInflu({
        data: {
          campanhaId,
          influencerId: influ.id,
          status: "reprovado",
          motivoLabel: motivo,
          comentario: comentario.trim() || undefined,
        },
      });
      toast.success("Perfil não aprovado.");
      setShowReject(false);
      setMotivo("");
      setComentario("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar decisão.");
    } finally {
      setBusy(false);
    }
  };

  const handleReabrir = async () => {
    setBusy(true);
    try {
      await reopenInflu({ data: { campanhaId, influencerId: influ.id } });
      toast.success("Decisão reaberta.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao reabrir.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{influ.nome}</p>
          {influ.nicho && <p className="text-xs text-muted-foreground">{influ.nicho}</p>}
        </div>
        <Badge variant={aprovado ? "default" : recusado ? "destructive" : "secondary"}>
          {influ.statusCliente}
        </Badge>
      </div>

      {!readOnly && pendente && !showReject && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" disabled={busy} onClick={handleAprovar}>
            Aprovar perfil
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowReject(true)}>
            Não aprovar
          </Button>
        </div>
      )}

      {!readOnly && pendente && showReject && (
        <div className="mt-3 space-y-2 rounded-lg border border-border/60 p-3">
          <Select value={motivo} onValueChange={(v) => setMotivo(v as PerfilRejeicaoMotivo)}>
            <SelectTrigger className="h-9 text-xs">
              <SelectValue placeholder="Motivo" />
            </SelectTrigger>
            <SelectContent>
              {PERFIL_REJEICAO_MOTIVOS.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            placeholder="Comentário (opcional, exceto para 'Outro')"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={busy} onClick={handleReprovar}>
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setShowReject(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {!readOnly && (aprovado || recusado) && (
        <Button size="sm" variant="ghost" className="mt-3" disabled={busy} onClick={handleReabrir}>
          Reabrir decisão
        </Button>
      )}

      {aprovado && influ.entregas.length > 0 && (
        <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
          {influ.entregas.map((entrega) => (
            <EntregaRow
              key={entrega.id}
              campanhaId={campanhaId}
              influencerId={influ.id}
              entrega={entrega}
              readOnly={readOnly}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EntregaRow({
  campanhaId,
  influencerId,
  entrega,
  readOnly,
  onChanged,
}: {
  campanhaId: string;
  influencerId: string;
  entrega: PublicEntrega;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const respondEntrega = useServerFn(respondCampanhaEntregaSession);
  const [showAjuste, setShowAjuste] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const aguardandoCliente = /aguardando sua aprova/i.test(entrega.statusCliente);

  const handle = async (status: "aprovado" | "reprovado") => {
    if (status === "reprovado" && !motivo.trim()) {
      toast.error("Comentário obrigatório ao solicitar ajustes.");
      return;
    }
    setBusy(true);
    try {
      await respondEntrega({
        data: {
          campanhaId,
          influencerId,
          entregaId: entrega.id,
          status,
          motivo: status === "reprovado" ? motivo.trim() : undefined,
        },
      });
      toast.success(status === "aprovado" ? "Entrega aprovada." : "Ajustes solicitados.");
      setShowAjuste(false);
      setMotivo("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao registrar resposta.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg bg-muted/40 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-foreground">
          {entrega.titulo ? `${entrega.tipo} · ${entrega.titulo}` : entrega.tipo}
        </p>
        <span className="shrink-0 text-[11px] text-muted-foreground">{entrega.statusCliente}</span>
      </div>
      {!readOnly && aguardandoCliente && !showAjuste && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" disabled={busy} onClick={() => handle("aprovado")}>
            Aprovar
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setShowAjuste(true)}>
            Pedir ajuste
          </Button>
        </div>
      )}
      {!readOnly && aguardandoCliente && showAjuste && (
        <div className="mt-2 space-y-2">
          <Textarea
            placeholder="Descreva o ajuste necessário"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="text-xs"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={busy}
              onClick={() => handle("reprovado")}
            >
              Enviar
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setShowAjuste(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
