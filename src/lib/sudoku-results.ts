import { supabase } from "@/integrations/supabase/client";

export type SudokuResult = {
  id: string;
  userId: string;
  dateKey: string;
  timeMs: number;
  createdAt: string;
};

function mapRow(row: {
  id: string;
  user_id: string;
  date_key: string;
  time_ms: number;
  created_at: string;
}): SudokuResult {
  return {
    id: row.id,
    userId: row.user_id,
    dateKey: row.date_key,
    timeMs: row.time_ms,
    createdAt: row.created_at,
  };
}

export async function submitSudokuResult(input: {
  dateKey: string;
  timeMs: number;
}): Promise<void> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw authError ?? new Error("Sessão inválida.");
  const { error } = await supabase.from("sudoku_daily_results").insert({
    user_id: authData.user.id,
    date_key: input.dateKey,
    time_ms: input.timeMs,
  });
  if (error) throw new Error(error.message);
}

export async function getMySudokuResult(dateKey: string): Promise<SudokuResult | null> {
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) return null;
  const { data, error } = await supabase
    .from("sudoku_daily_results")
    .select("*")
    .eq("date_key", dateKey)
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data);
}

export async function listSudokuLeaderboard(dateKey: string): Promise<SudokuResult[]> {
  const { data, error } = await supabase
    .from("sudoku_daily_results")
    .select("*")
    .eq("date_key", dateKey)
    .order("time_ms", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}

export function subscribeSudokuLeaderboard(dateKey: string, onChange: () => void): () => void {
  const channel = supabase
    .channel(`sudoku-leaderboard-${dateKey}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sudoku_daily_results",
        filter: `date_key=eq.${dateKey}`,
      },
      onChange,
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
}
