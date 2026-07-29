import { useEffect, useState } from "react";
import { Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const MEMBERS_KEY = "time:membros";
const PERFIL_KEY = "config:perfil";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function todaySixAM(): number {
  const d = new Date();
  d.setHours(6, 0, 0, 0);
  return d.getTime();
}

/**
 * "Já começou o dia hoje?" precisa ser um estado por usuário no banco, não
 * por navegador (localStorage) — senão a pessoa vê o convite de novo em
 * cada dispositivo que abrir. E o check roda num intervalo (não só uma vez
 * no mount) pra aparecer sozinho se a aba ficar aberta cruzando as 6h, sem
 * precisar de refresh.
 */
export function BomDiaDialog() {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [lastStartedAt, setLastStartedAt] = useState<string | null | undefined>(undefined);
  const [now, setNow] = useState(() => Date.now());

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
    const iv = window.setInterval(() => setNow(Date.now()), 30_000);
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
    const sixAM = todaySixAM();
    const alreadyStartedToday = !!lastStartedAt && new Date(lastStartedAt).getTime() >= sixAM;
    setOpen(now >= sixAM && !alreadyStartedToday);
  }, [now, lastStartedAt]);

  const start = async () => {
    const today = todayStr();
    const nowDate = new Date();
    const hhmm = `${String(nowDate.getHours()).padStart(2, "0")}:${String(nowDate.getMinutes()).padStart(2, "0")}`;
    const iso = nowDate.toISOString();
    setLastStartedAt(iso);
    setOpen(false);

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
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <Sun className="h-7 w-7" />
        </div>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Bom dia{nome ? `, ${nome}` : ""}!
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Que seu dia seja leve e produtivo.</p>
        <button
          onClick={start}
          className="mt-5 w-full rounded-md bg-foreground px-4 py-2.5 text-sm font-medium text-background hover:opacity-90"
        >
          Começar o dia
        </button>
      </div>
    </div>
  );
}
