import { describe, expect, it, vi } from "vitest";
import {
  MEETING_WRITE_MAX_ATTEMPTS,
  updateMeetingData,
  type MeetingStore,
} from "@/lib/google-meeting-write";
import { applySyncPatch } from "@/lib/google-calendar.functions";

/** Banco em memória com o mesmo contrato do trigger: toda escrita muda `updated_at`. */
function makeDb(initial: Record<string, unknown>) {
  let version = 1;
  let data = initial;
  const writes: Record<string, unknown>[] = [];
  const store: MeetingStore = {
    read: vi.fn(async () => ({ data: { ...data }, updated_at: `v${version}` })),
    writeIfUnchanged: vi.fn(async (_id, next, expected) => {
      if (expected !== `v${version}`) return "conflict";
      data = next;
      version++;
      writes.push(next);
      return "written";
    }),
  };
  /** Simula o usuário gravando a reunião (como o app, que muda `updated_at` via trigger). */
  const userEdits = (patch: Record<string, unknown>) => {
    data = { ...data, ...patch };
    version++;
  };
  return { store, writes, userEdits, current: () => data };
}

describe("updateMeetingData — concorrência otimista", () => {
  it("sem concorrência: grava uma vez", async () => {
    const db = makeDb({ titulo: "A", syncStatus: "pending" });
    const res = await updateMeetingData(db.store, "m1", (f) =>
      applySyncPatch(f, { syncStatus: "synced" }),
    );
    expect(res).toBe("written");
    expect(db.current()).toEqual({ titulo: "A", syncStatus: "synced" });
    expect(db.store.writeIfUnchanged).toHaveBeenCalledTimes(1);
  });

  it("o usuário edita ENTRE a leitura e a escrita: conflito detectado, relê e PRESERVA a edição", async () => {
    const db = makeDb({ titulo: "A", notas: "antigas", syncStatus: "pending" });
    let first = true;
    const realRead = db.store.read;
    db.store.read = vi.fn(async (id: string) => {
      const row = await realRead(id);
      if (first) {
        first = false;
        db.userEdits({ notas: "editadas pelo usuário", titulo: "A (renomeada)" });
      }
      return row;
    });
    const res = await updateMeetingData(db.store, "m1", (f) =>
      applySyncPatch(f, { syncStatus: "synced", etag: "e1" }),
    );
    expect(res).toBe("written");
    expect(db.current()).toMatchObject({
      titulo: "A (renomeada)",
      notas: "editadas pelo usuário",
      syncStatus: "synced",
      etag: "e1",
    });
    expect(db.store.writeIfUnchanged).toHaveBeenCalledTimes(2); // 1ª conflitou, 2ª gravou
  });

  it("conflito persistente: tentativas limitadas e NADA é sobrescrito", async () => {
    const db = makeDb({ titulo: "A", notas: "x" });
    db.store.writeIfUnchanged = vi.fn(async () => "conflict" as const);
    const res = await updateMeetingData(db.store, "m1", (f) => applySyncPatch(f, { etag: "e" }));
    expect(res).toBe("conflict");
    expect(db.store.writeIfUnchanged).toHaveBeenCalledTimes(MEETING_WRITE_MAX_ATTEMPTS);
    expect(db.current()).toEqual({ titulo: "A", notas: "x" });
  });

  it("reunião excluída entre os ciclos → gone (não recria)", async () => {
    const store: MeetingStore = {
      read: vi.fn(async () => null),
      writeIfUnchanged: vi.fn(async () => "written" as const),
    };
    expect(await updateMeetingData(store, "m1", (f) => f)).toBe("gone");
    expect(store.writeIfUnchanged).not.toHaveBeenCalled();
  });

  it("nada a mudar (mutate devolve null ou o mesmo conteúdo) → unchanged, sem escrita", async () => {
    const db = makeDb({ a: 1 });
    expect(await updateMeetingData(db.store, "m1", () => null)).toBe("unchanged");
    expect(await updateMeetingData(db.store, "m1", (f) => ({ ...f }))).toBe("unchanged");
    expect(db.store.writeIfUnchanged).not.toHaveBeenCalled();
  });

  it("erro de leitura ou de escrita é devolvido como 'error' (sem lançar)", async () => {
    const readFails: MeetingStore = {
      read: vi.fn(async () => {
        throw new Error("x");
      }),
      writeIfUnchanged: vi.fn(async () => "written" as const),
    };
    expect(await updateMeetingData(readFails, "m", (f) => ({ ...f, a: 1 }))).toBe("error");
    const db = makeDb({});
    db.store.writeIfUnchanged = vi.fn(async () => "error" as const);
    expect(await updateMeetingData(db.store, "m", (f) => ({ ...f, a: 1 }))).toBe("error");
  });

  it("duas execuções simultâneas sobre a mesma reunião não perdem as alterações uma da outra", async () => {
    const db = makeDb({ titulo: "A" });
    await Promise.all([
      updateMeetingData(db.store, "m1", (f) => applySyncPatch(f, { etag: "e1" })),
      updateMeetingData(db.store, "m1", (f) => applySyncPatch(f, { meetLink: "https://meet/x" })),
    ]);
    expect(db.current()).toMatchObject({ titulo: "A", etag: "e1", meetLink: "https://meet/x" });
  });
});

describe("applySyncPatch", () => {
  it("aplica só os campos informados e preserva o resto", () => {
    expect(applySyncPatch({ a: 1, b: 2 }, { b: 3, c: 4 })).toEqual({ a: 1, b: 3, c: 4 });
  });
  it("undefined remove a chave (ex.: lastSyncError após sucesso)", () => {
    const out = applySyncPatch({ lastSyncError: "x", a: 1 }, { lastSyncError: undefined });
    expect(out).toEqual({ a: 1 });
    expect("lastSyncError" in out).toBe(false);
  });
  it("não altera o objeto original", () => {
    const orig = { a: 1 };
    applySyncPatch(orig, { a: 2 });
    expect(orig).toEqual({ a: 1 });
  });
});
