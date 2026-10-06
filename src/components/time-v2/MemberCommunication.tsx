import { Skeleton } from "@/components/ui/skeleton";
import { AGENCY_HOURS_LABEL } from "@/lib/agency-hours";
import { formatResponseDuration, type MemberResponseTime } from "@/lib/member-response-time";
import { formatRelativeChange, relativeChangePct } from "./member-metrics";
import { VS_TEAM_LABEL, type CommunicationReading } from "./member-v2";
import { Bloco, Vazio } from "./MemberViews";
import type { ResponseTimeState } from "./use-response-time";

/* ---------------- Comunicação ---------------- */

function CommunicationBody({
  state,
  reading,
  data,
  previous,
}: {
  state: ResponseTimeState;
  reading: CommunicationReading;
  data: MemberResponseTime | null;
  previous: MemberResponseTime | null;
}) {
  if (state === "loading") return <Skeleton className="h-40 rounded-lg" />;
  if (state === "error")
    return (
      <Vazio>Ainda não disponível — não foi possível carregar o tempo de resposta agora.</Vazio>
    );
  if (reading.state === "sem_dados") return <Vazio>Ainda não há dados suficientes.</Vazio>;
  const change = formatRelativeChange(
    relativeChangePct(data?.all.averageSeconds ?? null, previous?.all.averageSeconds ?? null),
  );
  return (
    <div className="space-y-8">
      <Bloco title="Tempo médio de resposta">
        <p className="text-4xl font-semibold tabular-nums text-foreground">
          {formatResponseDuration(reading.averageSeconds)}
        </p>
        <p className="text-sm text-text-secondary">
          {[reading.vsTeam ? VS_TEAM_LABEL[reading.vsTeam] : null, change]
            .filter(Boolean)
            .join(" · ") || "Tempo médio no período"}
        </p>
      </Bloco>
      {reading.slowest && (
        <Bloco title="Demora mais em">
          <p className="text-sm font-medium text-foreground">
            {reading.slowest.label} · {formatResponseDuration(reading.slowest.seconds)}
          </p>
        </Bloco>
      )}
      {reading.recommendation && (
        <Bloco title="Recomendação">
          <p className="text-sm leading-relaxed text-foreground">{reading.recommendation}</p>
        </Bloco>
      )}
    </div>
  );
}

export function CommunicationView(props: Parameters<typeof CommunicationBody>[0]) {
  return (
    <div className="space-y-8">
      <CommunicationBody {...props} />
      <p className="text-[11px] leading-relaxed text-text-secondary">
        Métrica agregada: o conteúdo das conversas não é exibido. Conta só o horário útil da agência
        ({AGENCY_HOURS_LABEL}), de segunda a sexta, sem feriados. Mede velocidade de resposta e não
        faz parte do Score.
      </p>
    </div>
  );
}
