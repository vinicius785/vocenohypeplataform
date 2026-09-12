import { describe, expect, it } from "vitest";
import {
  loadContext,
  saveContext,
  clearContext,
  type HypitoConversationState,
} from "@/lib/hypito-context.server";

/** Fake mínimo do client Supabase só pra `hypito_conversation_state` —
 * um Map em memória por `user_id`, simulando exatamente as chamadas que
 * `hypito-context.server.ts` faz (`select().eq().maybeSingle()` e
 * `upsert(...)`). Não testa RLS/schema real (isso é integração, não
 * unidade) — só o contrato de leitura/escrita/expiração do módulo. */
function makeFakeDb() {
  const rows = new Map<string, { state: unknown; updated_at: string }>();
  const db = {
    from() {
      return {
        select() {
          return {
            eq(_col: string, userId: string) {
              return {
                async maybeSingle() {
                  const row = rows.get(userId);
                  return { data: row ?? null, error: null };
                },
              };
            },
          };
        },
        async upsert(row: { user_id: string; state: unknown; updated_at: string }) {
          rows.set(row.user_id, { state: row.state, updated_at: row.updated_at });
          return { data: null, error: null };
        },
      };
    },
  };
  return { db: db as unknown as Parameters<typeof loadContext>[0], rows };
}

describe("loadContext / saveContext", () => {
  it("usuário sem contexto salvo recebe estado vazio", async () => {
    const { db } = makeFakeDb();
    const state = await loadContext(db, "user-1");
    expect(state.lastIntent).toBeNull();
    expect(state.pendingClarification).toBeNull();
    expect(state.draft).toBeNull();
  });

  it("round-trip: o que é salvo é o que volta pro mesmo usuário", async () => {
    const { db } = makeFakeDb();
    const state: HypitoConversationState = {
      lastIntent: "campaign_summary",
      lastEntity: { type: "campanha", id: "c1", name: "Poupatempo RJ" },
      pendingClarification: null,
      draft: null,
      awaitingField: null,
      updatedAt: new Date().toISOString(),
    };
    await saveContext(db, "user-1", state);
    const loaded = await loadContext(db, "user-1");
    expect(loaded.lastIntent).toBe("campaign_summary");
    expect(loaded.lastEntity?.name).toBe("Poupatempo RJ");
  });

  it("contexto é isolado por usuário — nunca vaza entre contas", async () => {
    const { db } = makeFakeDb();
    await saveContext(db, "user-1", {
      lastIntent: "campaign_summary",
      lastEntity: null,
      pendingClarification: null,
      draft: null,
      awaitingField: null,
      updatedAt: new Date().toISOString(),
    });
    const otherUser = await loadContext(db, "user-2");
    expect(otherUser.lastIntent).toBeNull();
  });

  it("contexto expira depois do TTL de inatividade (30min)", async () => {
    const { db, rows } = makeFakeDb();
    const old = new Date(Date.now() - 31 * 60_000);
    // Grava direto no fake (não via saveContext, que sempre carimba "agora")
    // pra simular uma linha real que ficou parada há mais de 30min.
    rows.set("user-1", {
      state: { lastIntent: "campaign_summary" },
      updated_at: old.toISOString(),
    });
    const loaded = await loadContext(db, "user-1", new Date());
    expect(loaded.lastIntent).toBeNull();
  });

  it("contexto dentro do TTL continua válido", async () => {
    const { db, rows } = makeFakeDb();
    const recent = new Date(Date.now() - 5 * 60_000);
    rows.set("user-1", {
      state: { lastIntent: "campaign_summary" },
      updated_at: recent.toISOString(),
    });
    const loaded = await loadContext(db, "user-1", new Date());
    expect(loaded.lastIntent).toBe("campaign_summary");
  });
});

describe("clearContext", () => {
  it("mudança explícita de assunto/cancelamento limpa o contexto salvo", async () => {
    const { db } = makeFakeDb();
    await saveContext(db, "user-1", {
      lastIntent: "create_task",
      lastEntity: null,
      pendingClarification: {
        entityType: "campanha",
        query: "poupatempo",
        candidates: [{ id: "c1", name: "Poupatempo RJ", score: 0.6 }],
        forIntent: "campaign_summary",
      },
      draft: null,
      awaitingField: null,
      updatedAt: new Date().toISOString(),
    });
    await clearContext(db, "user-1");
    const loaded = await loadContext(db, "user-1");
    expect(loaded.lastIntent).toBeNull();
    expect(loaded.pendingClarification).toBeNull();
  });
});
