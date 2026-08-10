import { supabase } from "@/integrations/supabase/client";

export type ZipResult = {
  id: string;
  userId: string;
  dateKey: string;
  timeMs: number;
  moves: number;
  createdAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  date_key: string;
  time_ms: number;
  moves: number;
  created_at: string;
}): ZipResult {
  return {
    id: row.id,
    userId: row.user_id,
    dateKey: row.date_key,
    timeMs: row.time_ms,
    moves: row.moves,
    createdAt: row.created_at,
  };
}

export async function submitZipResult(input: {
  dateKey: string;
  timeMs: number;
  moves: number;
}): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error("Sessão inválida.");
  const { error } = await supabase.from("zip_daily_results").insert({
    user_id: authData.user.id,
    date_key: input.dateKey,
    time_ms: input.timeMs,
    moves: input.moves,
  });
  if (error) throw new Error(error.message);
}

export async function getMyZipResult(dateKey: string): Promise<ZipResult | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data, error } = await supabase
    .from("zip_daily_results")
    .select("*")
    .eq("date_key", dateKey)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function listZipLeaderboard(dateKey: string): Promise<ZipResult[]> {
  const { data, error } = await supabase
    .from("zip_daily_results")
    .select("*")
    .eq("date_key", dateKey)
    .order("time_ms", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export type ZipMonthLeader = { userId: string; wins: number };

/** "Líder do mês" do Zip — quem venceu (tempo mais rápido) mais dias dentro
 * do mês corrente. Calcula em cima das mesmas linhas de `zip_daily_results`
 * (sem tabela/agregação nova): busca tudo do mês já ordenado por tempo, e
 * como o primeiro resultado de cada `date_key` nessa ordem é sempre o mais
 * rápido daquele dia, o primeiro `user_id` visto por data é o vencedor dela. */
export async function getZipMonthLeader(): Promise<ZipMonthLeader | null> {
  const now = new Date();
  const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { data, error } = await supabase
    .from("zip_daily_results")
    .select("user_id, date_key, time_ms")
    .gte("date_key", `${monthPrefix}-01`)
    .lte("date_key", `${monthPrefix}-31`)
    .order("time_ms", { ascending: true });
  if (error) throw new Error(error.message);

  const winnerByDate = new Map<string, string>();
  for (const row of data ?? []) {
    if (!winnerByDate.has(row.date_key)) winnerByDate.set(row.date_key, row.user_id);
  }

  const wins = new Map<string, number>();
  for (const userId of winnerByDate.values()) {
    wins.set(userId, (wins.get(userId) ?? 0) + 1);
  }

  let leader: ZipMonthLeader | null = null;
  for (const [userId, count] of wins) {
    if (!leader || count > leader.wins) leader = { userId, wins: count };
  }
  return leader;
}

/** `channelKey` distingue quem está assinando (ex.: o próprio jogo vs. o
 * card "Líder do mês" do dashboard) — `supabase.channel(topic)` devolve o
 * MESMO objeto de canal pra tópicos iguais, e chamar `.on()` de novo num
 * canal que outro assinante já colocou pra "joined" derruba a página inteira
 * (`RealtimeChannel.on()` lança exceção nesse caso). Tópicos distintos por
 * assinante evitam essa colisão sem duplicar dado nenhum. */
export function subscribeZipLeaderboard(
  dateKey: string,
  onChange: () => void,
  channelKey = "leaderboard",
): () => void {
  const channel = supabase
    .channel(`zip-${channelKey}-${dateKey}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "zip_daily_results",
        filter: `date_key=eq.${dateKey}`,
      },
      onChange,
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
