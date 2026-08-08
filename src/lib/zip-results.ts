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

export function subscribeZipLeaderboard(dateKey: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`zip-leaderboard-${dateKey}`)
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
