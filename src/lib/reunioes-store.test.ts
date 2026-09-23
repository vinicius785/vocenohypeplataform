import { describe, expect, it } from "vitest";
import {
  meetingNeedsMyAction,
  meetingSource,
  classifyDialogSyncResult,
  type Meeting,
} from "@/lib/reunioes-store";

/**
 * Cobre a Fase 1 do reconstrução de Reuniões: o bug do badge "629
 * pendentes" numa única série recorrente. Causa raiz — `meetingNeedsMyAction`
 * não filtrava ocorrências já passadas nem excluía reuniões importadas do
 * Google (sem fluxo de convite/resposta na plataforma), então uma série de
 * longa duração acumulava uma "pendência" por ocorrência, pra sempre.
 */

function baseMeeting(overrides: Partial<Meeting> = {}): Meeting {
  return {
    id: "m1",
    titulo: "Reunião",
    data: "2026-09-23",
    hora: "10:00",
    duracao: 30,
    com: "",
    local: "",
    status: "Pendente",
    ...overrides,
  };
}

const ME = "user-1";

// Datas calculadas em relação a "agora" (não fixas) — a função sob teste
// compara contra `new Date()` de verdade, então fixar strings de data corre
// o risco de o teste começar a falhar sozinho passado um certo dia.
function isoOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
const TODAY = isoOffset(0);
const YESTERDAY = isoOffset(-1);
const TOMORROW = isoOffset(1);

describe("meetingNeedsMyAction", () => {
  it("é pendente para uma ocorrência futura da plataforma sem resposta ainda", () => {
    const m = baseMeeting({ data: TOMORROW });
    expect(meetingNeedsMyAction(m, ME)).toBe(true);
  });

  it("uma série recorrente com centenas de ocorrências futuras conta cada uma individualmente aqui — a deduplicação por série acontece na camada acima (SolicitacoesTab/AppShell), não nesta função", () => {
    // Este teste documenta o contrato: `meetingNeedsMyAction` decide só
    // "esta ocorrência específica precisa da minha ação?" — quem soma e
    // deduplica por `seriesId` é quem itera a lista (ver
    // `SolicitacoesTab.pend` e `AppShell.meetingItems`).
    const series = Array.from({ length: 300 }, (_, i) =>
      baseMeeting({ id: `occ-${i}`, seriesId: "serie-1", data: isoOffset(i) }),
    );
    const pendingCount = series.filter((m) => meetingNeedsMyAction(m, ME)).length;
    expect(pendingCount).toBeGreaterThan(1);
  });

  it("nunca conta uma ocorrência já passada como pendente — corrige o acúmulo sem fim de séries antigas", () => {
    const m = baseMeeting({ data: YESTERDAY });
    expect(meetingNeedsMyAction(m, ME)).toBe(false);
  });

  it("conta uma ocorrência de hoje como pendente (limite inclusivo)", () => {
    const m = baseMeeting({ data: TODAY });
    expect(meetingNeedsMyAction(m, ME)).toBe(true);
  });

  it("nunca conta uma reunião importada do Google como pendente — não há fluxo de convite/resposta na plataforma para ela", () => {
    const m = baseMeeting({ data: TOMORROW, origem: "google", status: "Confirmada" });
    expect(meetingNeedsMyAction(m, ME)).toBe(false);
  });

  it("uma série recorrente importada do Google de longa duração nunca acumula pendência — a causa raiz do bug 629 pendentes", () => {
    const importedSeries = Array.from({ length: 629 }, (_, i) =>
      baseMeeting({
        id: `google-occ-${i}`,
        seriesId: "google-recurring-event-id",
        origem: "google",
        status: "Confirmada",
        data: i < 500 ? YESTERDAY : TOMORROW,
      }),
    );
    const pendingCount = importedSeries.filter((m) => meetingNeedsMyAction(m, ME)).length;
    expect(pendingCount).toBe(0);
  });

  it("continua respeitando cancelamento e confirmação/recusa já registradas", () => {
    expect(meetingNeedsMyAction(baseMeeting({ data: TOMORROW, status: "Cancelada" }), ME)).toBe(
      false,
    );
    expect(meetingNeedsMyAction(baseMeeting({ data: TOMORROW, confirmedBy: [ME] }), ME)).toBe(
      false,
    );
    expect(meetingNeedsMyAction(baseMeeting({ data: TOMORROW, declinedBy: [ME] }), ME)).toBe(false);
  });
});

describe("meetingSource", () => {
  it("é 'platform' quando origem está ausente (reuniões antigas, criadas antes deste campo existir)", () => {
    expect(meetingSource({ origem: undefined })).toBe("platform");
  });

  it("é 'google' só quando origem === 'google'", () => {
    expect(meetingSource({ origem: "google" })).toBe("google");
  });
});

describe("classifyDialogSyncResult", () => {
  it("'not-attempted' quando nenhuma linha tem syncStatus (criador sem Google conectado)", () => {
    expect(classifyDialogSyncResult([{ syncStatus: undefined, lastSyncError: undefined }])).toEqual(
      { outcome: "not-attempted" },
    );
  });

  it("'synced' quando ao menos uma foi tentada e nenhuma falhou", () => {
    expect(classifyDialogSyncResult([{ syncStatus: "synced", lastSyncError: undefined }])).toEqual({
      outcome: "synced",
    });
  });

  it("'error' quando ao menos uma linha falhou, com a mensagem dela", () => {
    expect(
      classifyDialogSyncResult([
        { syncStatus: "synced", lastSyncError: undefined },
        { syncStatus: "error", lastSyncError: "HTTP 403" },
      ]),
    ).toEqual({ outcome: "error", error: "HTTP 403" });
  });

  it("uma série com várias ocorrências: só volta 'not-attempted' se NENHUMA foi tentada", () => {
    expect(
      classifyDialogSyncResult([
        { syncStatus: undefined, lastSyncError: undefined },
        { syncStatus: "synced", lastSyncError: undefined },
      ]),
    ).toEqual({ outcome: "synced" });
  });
});
