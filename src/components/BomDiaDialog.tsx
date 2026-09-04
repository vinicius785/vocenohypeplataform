import { useEffect, useState } from "react";
import { Sun } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { todayIsoInBrasilia, nowHHMMInBrasilia, currentHourInBrasilia } from "@/lib/timezone";

const MEMBERS_KEY = "time:membros";
const PERFIL_KEY = "config:perfil";

const WEEKDAY_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MONTH_SHORT = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

/** "SEX, 04 SET" a partir de uma data — sempre derivado do relógio de
 * Brasília (via `Intl.DateTimeFormat` com `timeZone` explícito), nunca do
 * fuso local do navegador. */
function formatWeekdayDateBrasilia(date: Date): string {
  const day =
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", day: "2-digit" }).format(
      date,
    ) ?? "";
  const weekdayName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "long",
  }).format(date);
  const monthName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    month: "long",
  }).format(date);
  const weekdayMap: Record<string, string> = {
    Sunday: WEEKDAY_SHORT[0],
    Monday: WEEKDAY_SHORT[1],
    Tuesday: WEEKDAY_SHORT[2],
    Wednesday: WEEKDAY_SHORT[3],
    Thursday: WEEKDAY_SHORT[4],
    Friday: WEEKDAY_SHORT[5],
    Saturday: WEEKDAY_SHORT[6],
  };
  const monthMap: Record<string, string> = {
    January: MONTH_SHORT[0],
    February: MONTH_SHORT[1],
    March: MONTH_SHORT[2],
    April: MONTH_SHORT[3],
    May: MONTH_SHORT[4],
    June: MONTH_SHORT[5],
    July: MONTH_SHORT[6],
    August: MONTH_SHORT[7],
    September: MONTH_SHORT[8],
    October: MONTH_SHORT[9],
    November: MONTH_SHORT[10],
    December: MONTH_SHORT[11],
  };
  return `${weekdayMap[weekdayName] ?? ""}, ${day} ${monthMap[monthName] ?? ""}`;
}

/**
 * "Já começou o dia hoje?" precisa ser um estado por usuário no banco, não
 * por navegador (localStorage) — senão a pessoa vê o convite de novo em
 * cada dispositivo que abrir. E o check roda num intervalo (não só uma vez
 * no mount) pra aparecer sozinho se a aba ficar aberta cruzando as 6h, sem
 * precisar de refresh. Todo cálculo de "agora"/"hoje" usa o horário de
 * Brasília explicitamente (`@/lib/timezone`) — nunca o fuso do navegador.
 */
export function BomDiaDialog() {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastStartedAt, setLastStartedAt] = useState<string | null | undefined>(undefined);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid || cancelled) return;
      setUserId(uid);
      const { data: prof } = await supabase
        .from("profiles")
        .select("last_day_started_at")
        .eq("id", uid)
        .maybeSingle();
      if (cancelled) return;
      setLastStartedAt(prof?.last_day_started_at ?? null);
    })();
    const iv = window.setInterval(() => setNow(new Date()), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  // Outro dispositivo pode marcar o dia como começado enquanto esta aba
  // segue aberta — a realtime fecha o convite aqui na hora, sem refresh.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`rt-bomdia-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { last_day_started_at?: string | null };
          setLastStartedAt(row.last_day_started_at ?? null);
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (lastStartedAt === undefined) return; // ainda carregando
    const alreadyStartedToday =
      !!lastStartedAt && todayIsoInBrasilia(new Date(lastStartedAt)) === todayIsoInBrasilia(now);
    setOpen(currentHourInBrasilia(now) >= 6 && !alreadyStartedToday);
  }, [now, lastStartedAt]);

  const start = async () => {
    // O DISPLAY do modal usa `now` (atualizado a cada 30s), mas o registro
    // em si sempre grava o instante real do clique — nunca o horário que
    // estava renderizado quando o modal abriu.
    const nowDate = new Date();
    const today = todayIsoInBrasilia(nowDate);
    const hhmm = nowHHMMInBrasilia(nowDate);
    const iso = nowDate.toISOString();
    setLastStartedAt(iso);
    setOpen(false);
    toast.success(`Início registrado às ${hhmm}.`);

    try {
      const perfilRaw = localStorage.getItem(PERFIL_KEY);
      const email = perfilRaw ? (JSON.parse(perfilRaw).email ?? "").trim().toLowerCase() : "";
      const membersRaw = localStorage.getItem(MEMBERS_KEY);
      if (email && membersRaw) {
        const members = JSON.parse(membersRaw) as Array<{
          email?: string;
          startTimes?: Record<string, string>;
        }>;
        const next = members.map((m) =>
          (m.email ?? "").trim().toLowerCase() === email
            ? { ...m, startTimes: { ...(m.startTimes ?? {}), [today]: hhmm } }
            : m,
        );
        localStorage.setItem(MEMBERS_KEY, JSON.stringify(next));
        window.dispatchEvent(new CustomEvent("time:membros:changed"));
      }
    } catch {
      /* ignore */
    }

    if (!userId) return;
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("start_times")
        .eq("id", userId)
        .maybeSingle();
      const current =
        prof?.start_times && typeof prof.start_times === "object"
          ? (prof.start_times as Record<string, string>)
          : {};
      await supabase
        .from("profiles")
        .update({ start_times: { ...current, [today]: hhmm }, last_day_started_at: iso })
        .eq("id", userId);
    } catch {
      /* ignore */
    }
  };

  if (!open) return null;

  const nome = (() => {
    try {
      const raw = localStorage.getItem(PERFIL_KEY);
      const p = raw ? JSON.parse(raw) : {};
      return (p.nome ?? "").split(" ")[0] ?? "";
    } catch {
      return "";
    }
  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 text-center shadow-xl">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted text-foreground/70">
          <Sun className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          Bom dia{nome ? `, ${nome}` : ""}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Registre o início do seu dia para manter sua atividade de hoje atualizada.
        </p>

        <div className="mt-5 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
            {formatWeekdayDateBrasilia(now)}
          </p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums text-foreground">
            {nowHHMMInBrasilia(now)}
          </p>
        </div>

        <button
          onClick={start}
          className="mt-5 inline-flex cursor-pointer items-center justify-center rounded-md bg-foreground px-6 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          Registrar início
        </button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          O horário será registrado ao confirmar.
        </p>
      </div>
    </div>
  );
}
