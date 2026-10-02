import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMemberResponseTime } from "@/lib/member-response-time.functions";
import type { MemberResponseTime } from "@/lib/member-response-time";
import { isoRangeToTimestamps, type IsoRange } from "./time-v2-utils";

export type ResponseTimeState = "loading" | "ready" | "error";

/** Uma única busca do tempo de resposta por perfil/período — alimenta tanto
 * a faixa de resumo quanto a seção Comunicação (nunca duas requisições).
 * Só agregados: ver `ProfileCommunication` e a migration da RPC. */
export function useMemberResponseTimeData(memberId: string, range: IsoRange) {
  const fetchRt = useServerFn(getMemberResponseTime);
  const [data, setData] = useState<MemberResponseTime | null>(null);
  const [state, setState] = useState<ResponseTimeState>("loading");
  const { from, to } = useMemo(() => isoRangeToTimestamps(range), [range]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetchRt({ data: { userId: memberId, from, to } })
      .then((res) => {
        if (cancelled) return;
        setData(res);
        setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchRt (useServerFn) não é estável entre renders
  }, [memberId, from, to]);

  return { data, state };
}
