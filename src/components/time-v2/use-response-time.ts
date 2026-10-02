import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMemberResponseTime, getTeamResponseTime } from "@/lib/member-response-time.functions";
import {
  mapTeamResponseRows,
  type MemberResponseTime,
  type TeamResponseTime,
} from "@/lib/member-response-time";
import { previousEquivalentRange } from "@/lib/performance-engine";
import { isoRangeToTimestamps, type IsoRange } from "./time-v2-utils";

export type ResponseTimeState = "loading" | "ready" | "error";

/** Tempo de resposta do perfil: período atual + período anterior
 * equivalente (pra "↓ 12% vs período anterior"), buscados juntos uma vez
 * por perfil/período e compartilhados entre resumo, seção e insights.
 * Só agregados: ver `ProfileCommunication` e as migrations da RPC. */
export function useMemberResponseTimeData(memberId: string, range: IsoRange) {
  const fetchRt = useServerFn(getMemberResponseTime);
  const [data, setData] = useState<MemberResponseTime | null>(null);
  const [previous, setPrevious] = useState<MemberResponseTime | null>(null);
  const [state, setState] = useState<ResponseTimeState>("loading");
  const { from, to } = useMemo(() => isoRangeToTimestamps(range), [range]);
  const prev = useMemo(() => {
    const p = previousEquivalentRange(range);
    return p.from && p.to ? isoRangeToTimestamps({ from: p.from, to: p.to }) : null;
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    const current = fetchRt({ data: { userId: memberId, from, to } });
    // O anterior é só comparação: se falhar, o atual continua valendo.
    const before = prev
      ? fetchRt({ data: { userId: memberId, from: prev.from, to: prev.to } }).catch(() => null)
      : Promise.resolve(null);
    Promise.all([current, before])
      .then(([cur, old]) => {
        if (cancelled) return;
        setData(cur);
        setPrevious(old);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchRt (useServerFn) não é estável entre renders
  }, [memberId, from, to, prev?.from, prev?.to]);

  return { data, previous, state };
}

/** Agregado do time (uma chamada) pra lista e o resumo da página. */
export function useTeamResponseTime(range: { from?: string; to?: string }) {
  const fetchTeam = useServerFn(getTeamResponseTime);
  const [data, setData] = useState<TeamResponseTime | null>(null);
  const [state, setState] = useState<ResponseTimeState>("loading");
  const span = useMemo(
    () =>
      range.from && range.to ? isoRangeToTimestamps({ from: range.from, to: range.to }) : null,
    [range.from, range.to],
  );

  useEffect(() => {
    if (!span) return;
    let cancelled = false;
    setState("loading");
    fetchTeam({ data: span })
      .then((rows) => {
        if (cancelled) return;
        setData(mapTeamResponseRows(rows));
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchTeam (useServerFn) não é estável entre renders
  }, [span?.from, span?.to]);

  return { data, state };
}
