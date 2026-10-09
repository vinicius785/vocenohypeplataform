import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const { summarizeUnread, visibleConvoIds, dmId, setViewingConvo, isConvoBeingViewed } =
  await import("./chat-store");
const { notificationSummary } = await import("./voice-messages");

const msg = (id: string, convoId: string, authorId: string, createdAt: number) =>
  ({ id, convoId, authorId, createdAt, text: id, attachments: [], mentions: [] }) as never;

afterEach(() => {
  setViewingConvo("");
  vi.unstubAllGlobals();
});

describe("summarizeUnread (fonte única do contador)", () => {
  const messages = [
    msg("a", "c1", "u2", 100),
    msg("b", "c1", "u2", 200),
    msg("c", "c2", "u3", 150),
    msg("d", "c2", "me", 160), // minha — nunca conta
  ];

  it("conta só mensagens de outras pessoas depois da última leitura", () => {
    const r = summarizeUnread(messages, "me", { c1: 100 });
    expect(r.byConvo.get("c1")).toBe(1);
    expect(r.byConvo.get("c2")).toBe(1);
    expect(r.total).toBe(2);
  });

  it("zera quando tudo foi lido", () => {
    expect(summarizeUnread(messages, "me", { c1: 999, c2: 999 }).total).toBe(0);
  });

  it("ignora a conversa em vista com a aba visível", () => {
    vi.stubGlobal("document", { visibilityState: "visible" });
    setViewingConvo("c1");
    expect(isConvoBeingViewed("c1")).toBe(true);
    const r = summarizeUnread(messages, "me", {});
    expect(r.byConvo.has("c1")).toBe(false);
    expect(r.total).toBe(1);
  });

  it("aba em background NÃO conta como vista", () => {
    vi.stubGlobal("document", { visibilityState: "hidden" });
    setViewingConvo("c1");
    expect(isConvoBeingViewed("c1")).toBe(false);
    expect(summarizeUnread(messages, "me", {}).byConvo.get("c1")).toBe(2);
  });
});

describe("notificationSummary (prévia da notificação)", () => {
  it("nunca expõe URL crua e trunca texto longo", () => {
    expect(
      notificationSummary({ text: "a".repeat(300), attachments: [], mentions: [] }).length,
    ).toBeLessThanOrEqual(101);
    expect(
      notificationSummary({ text: "https://exemplo.com/x", attachments: [], mentions: [] }),
    ).toBe("🔗 enviou um link");
  });
});

describe("conversas que não existem na lista não geram não lida", () => {
  const known = visibleConvoIds({
    channels: [
      { id: "c:pub", name: "geral" },
      { id: "c:priv", name: "sigilo", private: true, allowedMemberIds: ["outro"] },
    ] as never,
    campaignChannels: [{ id: "camp:1" }],
    projectChannels: [{ id: "proj:1" }],
    members: [{ id: "me" }, { id: "u2" }] as never,
    meId: "me",
  });

  it("inclui canal visível, campanha, projeto e DM com membro; exclui privado alheio e eu mesmo", () => {
    expect(known.has("c:pub")).toBe(true);
    expect(known.has("camp:1")).toBe(true);
    expect(known.has("proj:1")).toBe(true);
    expect(known.has(dmId("me", "u2"))).toBe(true);
    expect(known.has("c:priv")).toBe(false);
    expect(known.has(dmId("me", "me"))).toBe(false);
  });

  it("mensagens de conversas fora do conjunto (apagada, DM com conta de fora) não entram no total", () => {
    const msgs = [
      msg("1", "c:pub", "u2", 10),
      msg("2", "c:apagado", "u2", 10),
      msg("3", dmId("me", "cliente-x"), "cliente-x", 10),
      msg("4", "c:priv", "u2", 10),
    ];
    expect(summarizeUnread(msgs, "me", {}, known).total).toBe(1);
    expect(summarizeUnread(msgs, "me", {}).total).toBe(4);
  });
});
