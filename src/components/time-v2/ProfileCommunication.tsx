import { useState } from "react";
import { AtSign, Info, MessagesSquare, MessageSquare } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatResponseDuration,
  MIN_RESPONSE_SAMPLE,
  segmentOf,
  type MemberResponseTime,
  type ResponseTimeFilter,
} from "@/lib/member-response-time";
import { formatRelativeChange, relativeChangePct } from "./member-metrics";
import type { ResponseTimeState } from "./use-response-time";

const FILTERS = [
  { value: "all", label: "Todas", icon: <MessageSquare className="h-3 w-3" /> },
  { value: "direct", label: "Diretas", icon: <MessagesSquare className="h-3 w-3" /> },
  { value: "mention", label: "Menções", icon: <AtSign className="h-3 w-3" /> },
] as const;

function Stat({ label, value, hint }: { label: string; value: string; hint?: string | null }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5">
      <p className="truncate text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-text-secondary">{hint}</p>}
    </div>
  );
}

/**
 * Comunicação → Tempo médio de resposta. PRIVACIDADE: este componente só
 * recebe os agregados de `getMemberResponseTime` (média, mediana) — o tipo
 * `MemberResponseTime` nem tem campo para mensagem, remetente,
 * destinatário, conversa ou link, e nenhuma contagem é exibida. Abaixo da
 * amostra mínima a média nem sai do banco. Não há, nesta tela, nenhum
 * caminho para abrir uma conversa ou listar interações.
 */
export function ProfileCommunication({
  data,
  previous,
  state,
}: {
  data: MemberResponseTime | null;
  previous: MemberResponseTime | null;
  state: ResponseTimeState;
}) {
  const [filter, setFilter] = useState<ResponseTimeFilter>("all");
  const seg = data ? segmentOf(data, filter) : null;
  const prevSeg = previous ? segmentOf(previous, filter) : null;
  const change = formatRelativeChange(
    relativeChangePct(seg?.averageSeconds ?? null, prevSeg?.averageSeconds ?? null),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-xs text-text-secondary">
          Quanto o membro leva, em média, para responder a quem fala com ele.
        </p>
        <SegmentedControl
          aria-label="Tipo de comunicação"
          size="sm"
          value={filter}
          onChange={setFilter}
          options={FILTERS}
        />
      </div>

      {state === "loading" && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[74px] rounded-lg" />
          ))}
        </div>
      )}

      {state === "error" && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-secondary">
          Ainda não disponível — não foi possível carregar o tempo de resposta agora.
        </p>
      )}

      {state === "ready" && seg && data && (
        <>
          {seg.averageSeconds == null ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-secondary">
              Sem dados suficientes neste período (mínimo de {MIN_RESPONSE_SAMPLE} respostas para
              exibir a média).
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Tempo médio"
                value={formatResponseDuration(seg.averageSeconds)}
                hint={change}
              />
              <Stat
                label="Mediana"
                value={formatResponseDuration(seg.medianSeconds)}
                hint="Valor típico"
              />
              {filter === "all" && (
                <>
                  <Stat
                    label="Diretas"
                    value={formatResponseDuration(data.direct.averageSeconds)}
                  />
                  <Stat
                    label="Menções"
                    value={formatResponseDuration(data.mention.averageSeconds)}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2.5 text-[11px] leading-relaxed text-text-secondary">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <p>
          Esta é uma métrica agregada. O conteúdo, participantes e conversas utilizados no cálculo
          não são exibidos. O tempo é calculado com base nos eventos registrados pela plataforma, em
          tempo corrido (não há horário de trabalho configurado). Mensagens seguidas da mesma pessoa
          contam como uma única demanda; mensagens do sistema e do bot ficam fora. Não faz parte do
          Score.
        </p>
      </div>
    </div>
  );
}
