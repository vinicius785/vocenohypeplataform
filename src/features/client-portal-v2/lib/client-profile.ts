import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * `profiles` já é a tabela real de perfil pra QUALQUER usuário autenticado
 * (o trigger `handle_new_user` cria uma linha ali pra todo `auth.users`
 * novo, time interno OU portal do cliente — ver
 * `20260722144248_..._profiles.sql`). Nenhuma tabela nova: reaproveita a
 * mesma fonte de verdade já usada pelo time (`PerfilSection.tsx`), só com
 * RLS já cobrindo "cada um só edita o próprio perfil"
 * (`auth.uid() = id`).
 */
export type ClientProfile = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  photoUrl: string | null;
};

export const CLIENT_PROFILE_QUERY_KEY = ["portal-v2-profile"] as const;

async function fetchClientProfile(): Promise<ClientProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, photo_url")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name ?? "",
    phone: data.phone ?? "",
    photoUrl: data.photo_url,
  };
}

export function useClientProfile() {
  const query = useQuery({
    queryKey: CLIENT_PROFILE_QUERY_KEY,
    queryFn: fetchClientProfile,
    staleTime: 60 * 1000,
  });
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: CLIENT_PROFILE_QUERY_KEY });
  return { ...query, invalidate };
}

export function initialsFromName(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?"
  );
}
