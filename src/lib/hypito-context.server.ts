/**
 * Contexto da conversa do Hypito — resumo estruturado persistido em
 * `hypito_conversation_state` (uma linha por usuário; RLS garante que
 * ninguém lê/escreve o contexto de outra pessoa — pedido, seção 7:
 * "nunca compartilhar contexto entre usuários"). Nunca guarda o
 * histórico de mensagens inteiro, só o estado necessário pra entender a
 * PRÓXIMA mensagem: intenção anterior, entidade em foco, pergunta de
 * esclarecimento pendente, rascunho de ação em preenchimento.
 *
 * Server-only — usa o client injetado por quem chama (sempre
 * `supabaseAdmin`, já que o contexto é lido/escrito pelo motor da
 * conversa, não diretamente pelo cliente).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { DEFAULT_WORKSPACE_ID } from "@/lib/hypito";

type DB = SupabaseClient<Database>;

/** Depois desse tempo sem mensagens, o contexto expira sozinho — evita
 * que uma pergunta de esclarecimento de ontem seja respondida hoje como
 * se fosse a mesma conversa (pedido: "aplicar expiração"). */
const CONTEXT_TTL_MS = 30 * 60_000;

export type HypitoEntityType = "campanha" | "projeto" | "pessoa";

export type HypitoDraft = {
  kind: "create_task" | "create_reminder";
  title: string | null;
  assigneeName: string | null;
  assigneeId: string | null;
  scope: "projeto" | "campanha" | null;
  scopeId: string | null;
  scopeName: string | null;
  dueAtIso: string | null;
  priority: "Urgente" | "Alta" | "Normal" | "Baixa";
  askedAssigneeAndDate: boolean;
};

export type PendingClarificationCandidate = { id: string; name: string; score: number };

export type PendingClarification = {
  entityType: HypitoEntityType;
  query: string;
  candidates: PendingClarificationCandidate[];
  /** O que fazer com a entidade depois de resolvida — reexecuta a
   * mesma intenção original em vez de tratar a resposta como uma nova
   * pergunta isolada (pedido: "interpretar a próxima resposta como
   * continuação da pergunta anterior"). */
  forIntent: "campaign_summary" | "project_summary" | "task_assignee" | "person_tasks";
};

export type LastEntity = { type: "campanha" | "projeto"; id: string; name: string };

export type HypitoConversationState = {
  lastIntent: string | null;
  lastEntity: LastEntity | null;
  pendingClarification: PendingClarification | null;
  draft: HypitoDraft | null;
  awaitingField: "title" | "assignee_and_date" | null;
  updatedAt: string;
};

function emptyState(): HypitoConversationState {
  return {
    lastIntent: null,
    lastEntity: null,
    pendingClarification: null,
    draft: null,
    awaitingField: null,
    updatedAt: new Date().toISOString(),
  };
}

export async function loadContext(
  db: DB,
  userId: string,
  now: Date = new Date(),
): Promise<HypitoConversationState> {
  const { data } = await db
    .from("hypito_conversation_state")
    .select("state, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return emptyState();
  const age = now.getTime() - new Date(data.updated_at).getTime();
  if (age > CONTEXT_TTL_MS) return emptyState();
  const state = data.state as Partial<HypitoConversationState> | null;
  return { ...emptyState(), ...(state ?? {}) };
}

export async function saveContext(
  db: DB,
  userId: string,
  state: HypitoConversationState,
): Promise<void> {
  const next = { ...state, updatedAt: new Date().toISOString() };
  await db.from("hypito_conversation_state").upsert(
    {
      user_id: userId,
      workspace_id: DEFAULT_WORKSPACE_ID,
      state: next as unknown as never,
      updated_at: next.updatedAt,
    },
    { onConflict: "user_id" },
  );
}

/** Usuário pediu explicitamente pra mudar de assunto/cancelar o que
 * estava em aberto (pedido: "permitir ao usuário mudar de assunto" /
 * "cancelar contexto pendente quando o usuário pedir"). */
export async function clearContext(db: DB, userId: string): Promise<void> {
  await saveContext(db, userId, emptyState());
}
