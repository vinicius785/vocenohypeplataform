import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  canDeleteGoogleEvent,
  isInternalOrAdmin,
  runWithSyncLock,
  shouldSkipGoogleImportOverwrite,
  shouldSkipSyncDueToBackoff,
  applyGoogleAttendeeResponses,
} from "@/lib/google-calendar.functions";

/**
 * Fase 2 da reconstrução de Reuniões: antes de sobrescrever uma reunião já
 * importada com uma versão nova do Google, `runImportGoogleEventsToMeetings`
 * agora compara o `etag` gravado com o que veio na resposta — pedido
 * explícito de "comparar etag, IDs externos e datas de atualização antes de
 * sobrescrever dados". `shouldSkipGoogleImportOverwrite` é a decisão pura
 * por trás disso, extraída pra ser testável sem simular todo o ciclo de
 * sync (rede, Supabase, etc.).
 */
describe("shouldSkipGoogleImportOverwrite", () => {
  it("pula a escrita quando o etag é igual ao já gravado — nada mudou no Google", () => {
    expect(shouldSkipGoogleImportOverwrite("etag-1", "etag-1")).toBe(true);
  });

  it("não pula quando o etag mudou — o evento foi editado no Google desde a última importação", () => {
    expect(shouldSkipGoogleImportOverwrite("etag-1", "etag-2")).toBe(false);
  });

  it("não pula quando não há etag gravado ainda (primeira importação desta reunião)", () => {
    expect(shouldSkipGoogleImportOverwrite(undefined, "etag-1")).toBe(false);
  });

  it("não pula quando o Google não devolveu etag (nunca deve acontecer na prática, mas não trava o import)", () => {
    expect(shouldSkipGoogleImportOverwrite("etag-1", undefined)).toBe(false);
  });
});

/**
 * Fase 6, "retentativas seguras": depois de uma falha, `syncOneMeeting`
 * espera um período de backoff antes de tentar de novo a MESMA reunião —
 * sem isso, o disparo imediato de cada edição martelaria a API do Google a
 * cada poucos segundos enquanto o problema (token revogado, dado inválido)
 * não fosse resolvido.
 */
describe("shouldSkipSyncDueToBackoff", () => {
  const now = Date.parse("2026-09-23T12:00:00Z");

  it("nunca pula quando nunca houve erro", () => {
    expect(shouldSkipSyncDueToBackoff({ syncStatus: "synced" }, now)).toBe(false);
    expect(shouldSkipSyncDueToBackoff({ syncStatus: undefined }, now)).toBe(false);
  });

  it("pula quando a última tentativa falhou há menos de 60s", () => {
    const lastSyncAttemptAt = new Date(now - 10_000).toISOString();
    expect(shouldSkipSyncDueToBackoff({ syncStatus: "error", lastSyncAttemptAt }, now)).toBe(true);
  });

  it("não pula mais depois que o backoff expira", () => {
    const lastSyncAttemptAt = new Date(now - 61_000).toISOString();
    expect(shouldSkipSyncDueToBackoff({ syncStatus: "error", lastSyncAttemptAt }, now)).toBe(false);
  });

  it("não pula se está em erro mas nunca registrou quando foi a tentativa (dado antigo)", () => {
    expect(
      shouldSkipSyncDueToBackoff({ syncStatus: "error", lastSyncAttemptAt: undefined }, now),
    ).toBe(false);
  });
});

/**
 * Fase 6, "respostas dos participantes": eventos criados pela plataforma e
 * enviados por e-mail (`syncOneMeeting`) tinham a resposta do convidado
 * visível só no Google — quem respondia direto no Gmail/Agenda nunca via
 * isso refletido em `confirmedBy`/`declinedBy` na plataforma.
 */
describe("applyGoogleAttendeeResponses", () => {
  const idByEmail = new Map([
    ["ana@vocenohype.com", "user-ana"],
    ["bruno@vocenohype.com", "user-bruno"],
  ]);

  it("retorna null quando não há convidados", () => {
    expect(applyGoogleAttendeeResponses({}, undefined, idByEmail)).toBeNull();
    expect(applyGoogleAttendeeResponses({}, [], idByEmail)).toBeNull();
  });

  it("marca como confirmado quem respondeu 'accepted'", () => {
    const result = applyGoogleAttendeeResponses(
      {},
      [{ email: "ana@vocenohype.com", responseStatus: "accepted" }],
      idByEmail,
    );
    expect(result).toEqual({ confirmedBy: ["user-ana"], declinedBy: [] });
  });

  it("marca como recusado quem respondeu 'declined', e desfaz confirmação anterior", () => {
    const result = applyGoogleAttendeeResponses(
      { confirmedBy: ["user-ana"], declinedBy: [] },
      [{ email: "ana@vocenohype.com", responseStatus: "declined" }],
      idByEmail,
    );
    expect(result).toEqual({ confirmedBy: [], declinedBy: ["user-ana"] });
  });

  it("ignora o próprio organizador (self) mesmo que apareça na lista de convidados", () => {
    const result = applyGoogleAttendeeResponses(
      {},
      [{ email: "ana@vocenohype.com", responseStatus: "accepted", self: true }],
      idByEmail,
    );
    expect(result).toBeNull();
  });

  it("ignora convidados externos sem conta na plataforma", () => {
    const result = applyGoogleAttendeeResponses(
      {},
      [{ email: "cliente-externo@empresa.com", responseStatus: "accepted" }],
      idByEmail,
    );
    expect(result).toBeNull();
  });

  it("nunca regride uma resposta já registrada por causa de um estado ambíguo ('needsAction'/'tentative')", () => {
    const result = applyGoogleAttendeeResponses(
      { confirmedBy: ["user-ana"], declinedBy: [] },
      [{ email: "ana@vocenohype.com", responseStatus: "needsAction" }],
      idByEmail,
    );
    expect(result).toBeNull();
  });

  it("retorna null quando o estado já reflete a mesma resposta (nada mudou)", () => {
    const result = applyGoogleAttendeeResponses(
      { confirmedBy: ["user-ana"], declinedBy: [] },
      [{ email: "ana@vocenohype.com", responseStatus: "accepted" }],
      idByEmail,
    );
    expect(result).toBeNull();
  });

  it("processa vários convidados, cada um com sua própria resposta", () => {
    const result = applyGoogleAttendeeResponses(
      {},
      [
        { email: "ana@vocenohype.com", responseStatus: "accepted" },
        { email: "bruno@vocenohype.com", responseStatus: "declined" },
      ],
      idByEmail,
    );
    expect(result).toEqual({ confirmedBy: ["user-ana"], declinedBy: ["user-bruno"] });
  });
});

/**
 * Isolamento entre equipe e clientes: contas do portal do cliente são `authenticated` comuns (mesma
 * chave anon). As funções de sincronização usam o service role e tokens de terceiros, então só
 * equipe interna ou admin pode acioná-las (antes, qualquer sessão autenticada podia).
 */
type RpcResult = { data: boolean | null; error: { message: string } | null };
function fakeSupabase(results: Record<string, RpcResult>) {
  return {
    rpc: async (name: string) => results[name] ?? { data: false, error: null },
  } as unknown as Parameters<typeof isInternalOrAdmin>[0];
}

describe("isInternalOrAdmin", () => {
  it("admin passa", async () => {
    const sb = fakeSupabase({ is_admin: { data: true, error: null } });
    expect(await isInternalOrAdmin(sb, "u")).toBe(true);
  });

  it("membro interno (não admin) passa", async () => {
    const sb = fakeSupabase({ is_internal_team_member: { data: true, error: null } });
    expect(await isInternalOrAdmin(sb, "u")).toBe(true);
  });

  it("conta de cliente (nem admin nem interna) é negada", async () => {
    const sb = fakeSupabase({
      is_admin: { data: false, error: null },
      is_internal_team_member: { data: false, error: null },
    });
    expect(await isInternalOrAdmin(sb, "cliente")).toBe(false);
  });

  it("erro na verificação não libera acesso (lança)", async () => {
    const sb = fakeSupabase({ is_admin: { data: null, error: { message: "falhou" } } });
    await expect(isInternalOrAdmin(sb, "u")).rejects.toThrow("falhou");
  });
});

describe("funções de sincronização/conexão exigem equipe interna (guarda estrutural)", () => {
  const source = readFileSync("src/lib/google-calendar.functions.ts", "utf8");
  const block = (name: string) => {
    const start = source.indexOf(`export const ${name} = createServerFn`);
    expect(start, `${name} existe`).toBeGreaterThan(-1);
    const next = source.indexOf("\nexport ", start + 10);
    return source.slice(start, next === -1 ? undefined : next);
  };

  it.each([
    "startGoogleOAuth",
    "syncAllMeetingsToGoogle",
    "importGoogleEventsToMeetings",
    "runGoogleCalendarSync",
  ])("%s verifica isInternalOrAdmin antes de agir", (name) => {
    expect(block(name)).toContain("isInternalOrAdmin(context.supabase, context.userId)");
  });

  it("status e desconexão continuam restritos ao próprio usuário (context.userId)", () => {
    expect(block("getGoogleConnectionStatus")).toContain('.eq("user_id", context.userId)');
    expect(block("disconnectGoogleCalendar")).toContain('.eq("user_id", context.userId)');
  });
});

describe("runWithSyncLock — execuções simultâneas usando a trava existente", () => {
  /** Simula `google_calendar_sync_state`: o UPDATE condicional só vence se não estiver rodando. */
  function fakeLockAdmin() {
    const state = { running: false, acquired: 0, releases: [] as Record<string, unknown>[] };
    const admin = {
      from: () => ({
        update: (patch: Record<string, unknown>) => {
          const chain: Record<string, unknown> = {};
          chain.eq = () => chain;
          chain.or = () => chain;
          chain.select = async () => {
            if (state.running) return { data: [], error: null };
            state.running = true;
            state.acquired++;
            return { data: [{ id: true }], error: null };
          };
          chain.then = (resolve: (v: unknown) => void) => {
            state.running = false;
            state.releases.push(patch);
            resolve({ error: null });
          };
          return chain;
        },
      }),
    } as unknown as Parameters<typeof runWithSyncLock>[0];
    return { admin, state };
  }
  const gate = () => {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    return { promise, release };
  };

  it("duas execuções ao mesmo tempo: só UMA roda; a outra devolve ran:false sem executar o trabalho", async () => {
    const { admin, state } = fakeLockAdmin();
    const g = gate();
    const workA = vi.fn(async () => {
      await g.promise;
      return "A";
    });
    const workB = vi.fn(async () => "B");
    const first = runWithSyncLock(admin, workA);
    const second = await runWithSyncLock(admin, workB);
    expect(second).toEqual({ ran: false });
    expect(workB).not.toHaveBeenCalled();
    g.release();
    expect(await first).toEqual({ ran: true, value: "A" });
    expect(state.acquired).toBe(1);
    expect(state.running).toBe(false);
  });

  it("várias chamadas manuais + automática simultâneas: exatamente uma executa", async () => {
    const { admin } = fakeLockAdmin();
    const g = gate();
    const work = vi.fn(async () => {
      await g.promise;
      return 1;
    });
    const calls = [1, 2, 3, 4, 5].map(() => runWithSyncLock(admin, work));
    await Promise.resolve();
    g.release();
    const results = await Promise.all(calls);
    expect(results.filter((r) => r.ran)).toHaveLength(1);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("libera a trava após o término e depois do erro (não fica presa)", async () => {
    const { admin, state } = fakeLockAdmin();
    await expect(
      runWithSyncLock(admin, async () => {
        throw new Error("falhou");
      }),
    ).rejects.toThrow("falhou");
    expect(state.running).toBe(false);
    expect(state.releases.at(-1)).toMatchObject({ last_error: "falhou" });
    expect(await runWithSyncLock(admin, async () => "ok")).toEqual({ ran: true, value: "ok" });
  });
});

describe("canDeleteGoogleEvent — a exclusão só atinge o que a reunião excluída possui", () => {
  const base = {
    meetingId: "m-1",
    requesterId: "u-req",
    calendarOwnerId: "u-owner",
    requesterIsAdmin: false,
  };
  it("evento criado pela plataforma para ESTA reunião: permitido", () => {
    expect(canDeleteGoogleEvent({ ...base, eventMarker: "m-1" })).toBe(true);
  });
  it("evento marcado com OUTRA reunião: negado, até para admin", () => {
    expect(canDeleteGoogleEvent({ ...base, eventMarker: "m-2" })).toBe(false);
    expect(canDeleteGoogleEvent({ ...base, eventMarker: "m-2", requesterIsAdmin: true })).toBe(
      false,
    );
  });
  it("evento sem marcador (importado) de calendário de OUTRA pessoa: negado a quem não é admin", () => {
    expect(canDeleteGoogleEvent({ ...base, eventMarker: undefined })).toBe(false);
  });
  it("evento sem marcador do próprio calendário do solicitante: permitido", () => {
    expect(canDeleteGoogleEvent({ ...base, eventMarker: undefined, requesterId: "u-owner" })).toBe(
      true,
    );
  });
  it("admin pode remover evento importado (sem marcador) de qualquer conta", () => {
    expect(canDeleteGoogleEvent({ ...base, eventMarker: undefined, requesterIsAdmin: true })).toBe(
      true,
    );
  });
});

describe("pontos de entrada: trava, autorização e vínculo do state (guarda estrutural)", () => {
  const source = readFileSync("src/lib/google-calendar.functions.ts", "utf8");
  const block = (name: string) => {
    const start = source.indexOf(`export const ${name} = createServerFn`);
    expect(start, `${name} existe`).toBeGreaterThan(-1);
    const next = source.indexOf("\nexport ", start + 10);
    return source.slice(start, next === -1 ? undefined : next);
  };

  it("as funções manuais de sincronização rodam sob a trava existente", () => {
    expect(block("syncAllMeetingsToGoogle")).toContain("runWithSyncLock(");
    expect(block("importGoogleEventsToMeetings")).toContain("runWithSyncLock(");
  });

  it("o ciclo (cron, polling, botão) também usa a mesma trava", () => {
    const start = source.indexOf("export async function runGoogleCalendarSyncCycle");
    expect(source.slice(start, start + 1500)).toContain("runWithSyncLock(");
  });

  it("a exclusão de eventos exige permissão, equipe interna e confere o evento antes de apagar", () => {
    const b = block("deleteGoogleEventsForMeetings");
    expect(b).toContain("isInternalOrAdmin(context.supabase, context.userId)");
    expect(b).toContain("canDeleteGoogleEvent(");
    expect(b).toContain('_permission: "reunioes"');
  });

  it("o início do OAuth grava o cookie de vínculo do state", () => {
    expect(block("startGoogleOAuth")).toContain("buildStateCookie(token");
  });

  it("nenhum log registra corpo de resposta do Google nem tokens", () => {
    expect(source).not.toMatch(/console\.\w+\([^)]*await \w+\.text\(\)/);
    expect(source).not.toMatch(/console\.\w+\([^)]*(access_token|refresh_token)/);
  });
});
