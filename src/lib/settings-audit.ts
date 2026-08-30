import { supabase } from "@/integrations/supabase/client";
import { getMe } from "@/lib/chat-store";

export type SettingsAuditCategory = "pricing" | "export";

/** Fire-and-forget: grava uma linha no ledger `settings_audit_log`.
 * Nunca bloqueia a ação principal do usuário (salvar precificação,
 * exportar dados) — falha aqui só fica registrada no console, mesmo
 * espírito de `recordPerformanceEvent` em `performance-events-store.ts`. */
export function logSettingsAudit(input: {
  category: SettingsAuditCategory;
  action: string;
  detail?: string;
}): void {
  const me = getMe();
  void supabase.auth.getSession().then(() =>
    supabase
      .from("settings_audit_log")
      .insert({
        category: input.category,
        action: input.action,
        detail: input.detail ?? null,
        actor_id: me.id,
        actor_name: me.name,
      } as never)
      .then(({ error }) => {
        if (error) console.warn("[settings_audit_log] insert failed", error);
      }),
  );
}
