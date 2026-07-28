import { useEffect, useState } from "react";
import { Sun } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const SHOWN_KEY = "bomdia:lastDate";
const MEMBERS_KEY = "time:membros";
const PERFIL_KEY = "config:perfil";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BomDiaDialog() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const now = new Date();
      if (now.getHours() < 6) return;
      const today = todayStr();
      if (localStorage.getItem(SHOWN_KEY) === today) return;
      setOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  const start = async () => {
    const today = todayStr();
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    try {
      localStorage.setItem(SHOWN_KEY, today);

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
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("start_times")
          .eq("id", uid)
          .maybeSingle();
        const current =
          prof?.start_times && typeof prof.start_times === "object"
            ? (prof.start_times as Record<string, string>)
            : {};
        await supabase
          .from("profiles")
          .update({ start_times: { ...current, [today]: hhmm } })
          .eq("id", uid);
      }
    } catch {
      /* ignore */
    }
    setOpen(false);
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
