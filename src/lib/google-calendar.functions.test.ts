import { describe, expect, it } from "vitest";
import {
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
