import { Link } from "@tanstack/react-router";
import { CheckCircle2, ChevronRight, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HYPITO_AVATAR_URL, HYPITO_BADGE_LABEL, HYPITO_NAME, HYPITO_TAGLINE } from "@/lib/hypito";
import { SURFACE } from "@/lib/design-tokens";
import type { PortalLang } from "@/lib/portal-i18n";
import { pendingReason, pendingEntregaId } from "@/components/portal/portal-widgets";
import { mesLabel } from "@/lib/relatorio-mensal";
import type { ClienteLinkData } from "@/lib/portal-types";

type SummaryLine =
  | { kind: "influ"; campanhaId: string; influId: string; entregaId?: string; text: string }
  | { kind: "relatorio"; campanhaId: string; relatorioId: string; text: string }
  | { kind: "cronograma"; campanhaId: string; text: string };

/**
 * Resumo do Hypito na página inicial do portal (Seções 3 e 14 do pedido) —
 * mesma identidade visual já usada em `UpcomingMeetingAlert.tsx`/
 * `HypitoReportTab.tsx` (avatar + nome + badge "Assistente"), aplicada aqui
 * a um contexto de dashboard em vez de alerta/config. Cada linha é um fato
 * real, montado só a partir de dados já carregados (`ClienteLinkData`) —
 * nunca texto gerado livremente. Sem pendências, mostra uma única linha
 * positiva (o card nunca desaparece nem vira um bloco vazio — é a
 * confirmação do Hypito de que ele checou e está tudo certo).
 */
export function HypitoPortalSummary({
  token,
  data,
  lang,
}: {
  token: string;
  data: ClienteLinkData;
  lang: PortalLang;
}) {
  const lines: SummaryLine[] = [];

  for (const c of data.campanhas) {
    for (const inf of c.influencers) {
      const reason = pendingReason(inf, lang);
      if (reason) {
        lines.push({
          kind: "influ",
          campanhaId: c.id,
          influId: inf.id,
          entregaId: pendingEntregaId(inf) ?? undefined,
          text: `${inf.nome} · ${reason} em ${c.nome}`,
        });
      }
    }
    for (const r of c.relatorios) {
      if (!r.nps) {
        lines.push({
          kind: "relatorio",
          campanhaId: c.id,
          relatorioId: r.id,
          text: `Novo relatório de ${mesLabel(r.mes)} disponível em ${c.nome}`,
        });
      }
    }
  }

  // Próximo evento real do cronograma (qualquer campanha) — só entra se
  // existir de fato uma data futura, nunca um placeholder.
  const today = new Date().toISOString().slice(0, 10);
  const proximo = data.campanhas
    .flatMap((c) => c.cronograma.map((item) => ({ campanhaId: c.id, campanhaNome: c.nome, item })))
    .filter(({ item }) => item.date >= today)
    .sort((a, b) => a.item.date.localeCompare(b.item.date))[0];
  if (proximo) {
    lines.push({
      kind: "cronograma",
      campanhaId: proximo.campanhaId,
      text: `Próximo: ${proximo.item.title} · ${proximo.campanhaNome}`,
    });
  }

  const visible = lines.slice(0, 4);

  return (
    <div className={`rounded-2xl ${SURFACE.raised} p-4`}>
      <div className="flex items-center gap-3">
        <img
          src={HYPITO_AVATAR_URL}
          alt=""
          aria-hidden="true"
          className="h-9 w-9 shrink-0 rounded-full object-cover sm:h-10 sm:w-10"
        />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-xs font-semibold text-foreground">{HYPITO_NAME}</p>
            <Badge
              variant="brand"
              title={HYPITO_TAGLINE}
              className="px-1.5 py-0 text-[9px] normal-case"
            >
              {HYPITO_BADGE_LABEL}
            </Badge>
          </div>
        </div>
      </div>

      <div className="mt-3">
        {visible.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-foreground">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            Tudo certo por aqui, nenhuma pendência no momento.
          </p>
        ) : (
          <ul className="space-y-1">
            {visible.map((line, i) => {
              const search =
                line.kind === "influ"
                  ? {
                      influ: line.influId,
                      ...(line.entregaId ? { entregaId: line.entregaId } : {}),
                    }
                  : line.kind === "relatorio"
                    ? { relatorio: line.relatorioId }
                    : undefined;
              return (
                <li key={i}>
                  <Link
                    to="/portal/$token/campanhas/$campanhaId"
                    params={{ token, campanhaId: line.campanhaId }}
                    search={search}
                    className="flex min-h-9 items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground transition-colors hover:bg-muted/60"
                  >
                    <span className="flex min-w-0 items-center gap-1.5 truncate">
                      <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand" />
                      <span className="truncate">{line.text}</span>
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
