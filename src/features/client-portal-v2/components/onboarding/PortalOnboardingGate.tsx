import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { onboardingStateFrom, type OnboardingState } from "../../lib/onboarding";
import { PortalOnboardingDialog } from "./PortalOnboardingDialog";

export const ONBOARDING_QUERY_KEY = ["portal-v2-onboarding"] as const;

/** `profiles.portal_onboarding_completed_at` do usuário logado. Qualquer falha (inclusive a coluna
 * ainda não existir) vira "unknown" → o onboarding não aparece e o portal segue normal. */
async function fetchOnboardingState(): Promise<OnboardingState> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "unknown";
  const { data, error } = await supabase
    .from("profiles")
    .select("portal_onboarding_completed_at" as never)
    .eq("id", user.id)
    .maybeSingle();
  if (error || !data) return onboardingStateFrom(null, true);
  const value = (data as unknown as { portal_onboarding_completed_at: string | null })
    .portal_onboarding_completed_at;
  return onboardingStateFrom(value, false);
}

/**
 * Primeiro acesso do Portal do Cliente: enquanto o perfil não foi confirmado, um modal obrigatório
 * (nome, telefone, foto) fica por cima do portal. O estado mora no perfil do usuário no banco —
 * fechar o navegador no meio não conclui nada, e outro usuário no mesmo navegador não herda o estado.
 */
export function PortalOnboardingGate({ children }: { children: ReactNode }) {
  const { data: state } = useQuery({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: fetchOnboardingState,
    staleTime: 5 * 60 * 1000,
  });
  return (
    <>
      {children}
      {state === "needed" && <PortalOnboardingDialog />}
    </>
  );
}
