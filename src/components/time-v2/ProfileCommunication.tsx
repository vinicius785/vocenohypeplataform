import { useState } from "react";
import { Info } from "lucide-react";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatResponseDuration,
  segmentOf,
  type MemberResponseTime,
  type ResponseTimeFilter,
} from "@/lib/member-response-time";
import type { ResponseTimeState } from "./use-response-time";

const FILTER_OPTIONS = [
  { value: "all", label: "Todas" },
  { value: "direct", label: "Diretas" },
  { value: "mention", label: "Menções" },
] as const;

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
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
 * Comunicação → Tempo de resposta. PRIVACIDADE: este componente só recebe
 * os agregados de `getMemberResponseTime` (média, mediana, contagens) — o
 * tipo `MemberResponseTime` nem tem campo para mensagem, remetente,
 * destinatário, conversa ou link. Não há, nesta tela, nenhum caminho para
 * abrir uma conversa ou listar interações. Os dados vêm do perfil (uma
 * única busca compartilhada com a faixa de resumo).
 */
export function ProfileCommunication({
  data,
  state,
}: {
  data: MemberResponseTime | null;
  state: ResponseTimeState;
}) {
  const [filter, setFilter] = useState<ResponseTimeFilter>("all");
  const seg = data ? segmentOf(data, filter) : null;
  const noData = state === "ready" && seg != null && seg.answered === 0 && seg.unanswered === 0;

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
          options={FILTER_OPTIONS}
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

      {state === "ready" && seg && (
        <>
          {noData ? (
            <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-text-secondary">
              Sem dados suficientes neste período.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Média" value={formatResponseDuration(seg.averageSeconds)} />
              <Stat
                label="Mediana"
                value={formatResponseDuration(seg.medianSeconds)}
                hint="Valor típico, sem distorção de casos extremos"
              />
              <Stat label="Respostas analisadas" value={seg.answered} />
              <Stat
                label="Sem resposta"
                value={seg.unanswered}
                hint="Ainda em aberto — fora da média"
              />
            </div>
          )}

          {data && filter === "all" && (data.direct.answered > 0 || data.mention.answered > 0) && (
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Diretas"
                value={formatResponseDuration(data.direct.averageSeconds)}
                hint={`${data.direct.answered} analisadas`}
              />
              <Stat
                label="Menções"
                value={formatResponseDuration(data.mention.averageSeconds)}
                hint={`${data.mention.answered} analisadas`}
              />
            </div>
          )}
        </>
      )}

      <div className="flex items-start gap-2 rounded-lg bg-muted/30 px-3 py-2.5 text-[11px] leading-relaxed text-text-secondary">
        <Info className="mt-0.5 h-3 w-3 shrink-0" />
        <p>
          Métrica agregada. O conteúdo das mensagens e as conversas utilizadas no cálculo não são
          exibidos. Mensagens seguidas da mesma pessoa contam como uma única demanda, medida desde a
          primeira. O tempo é corrido (a plataforma ainda não tem horário de trabalho configurado) e
          não faz parte do Score.
        </p>
      </div>
    </div>
  );
}
