import { describe, expect, it, beforeEach } from "vitest";
import type { ChatMessage } from "@/lib/chat-store";

// `vitest.config.ts` usa `environment: "node"` (só lógica pura, sem DOM) —
// sem `localStorage` global. As funções de rascunho/preferência de sidebar
// já toleram sua ausência (`typeof localStorage === "undefined"`), mas pra
// exercitar o caminho feliz aqui precisamos de um stub mínimo em memória.
class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string) {
    return this.store.has(key) ? this.store.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();
import {
  countUnreadMentions,
  dateDividerLabel,
  firstUnreadIndex,
  getLastConvoRoute,
  groupMessages,
  isSameDay,
  isSidebarSectionCollapsed,
  setLastConvoRoute,
  setSidebarSectionCollapsed,
} from "./chat-v2-utils";

function msg(partial: Partial<ChatMessage> & { id: string; createdAt: number }): ChatMessage {
  return {
    convoId: "c:1",
    authorId: "u1",
    authorName: "Fulano",
    text: "oi",
    ...partial,
  };
}

describe("groupMessages", () => {
  it("agrupa mensagens consecutivas do mesmo autor dentro da janela", () => {
    const t0 = Date.now();
    const groups = groupMessages([
      msg({ id: "1", createdAt: t0, authorId: "u1" }),
      msg({ id: "2", createdAt: t0 + 1000, authorId: "u1" }),
      msg({ id: "3", createdAt: t0 + 2000, authorId: "u2", authorName: "Ciclano" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].messages.map((m) => m.id)).toEqual(["1", "2"]);
    expect(groups[1].messages.map((m) => m.id)).toEqual(["3"]);
  });

  it("interrompe o agrupamento depois de 5 minutos", () => {
    const t0 = Date.now();
    const groups = groupMessages([
      msg({ id: "1", createdAt: t0, authorId: "u1" }),
      msg({ id: "2", createdAt: t0 + 6 * 60 * 1000, authorId: "u1" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("nunca agrupa mensagens de sistema", () => {
    const t0 = Date.now();
    const groups = groupMessages([
      msg({ id: "1", createdAt: t0, authorId: "system", authorName: "Sistema" }),
      msg({ id: "2", createdAt: t0 + 1000, authorId: "system", authorName: "Sistema" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("interrompe o agrupamento ao trocar de dia", () => {
    const day1 = new Date(2026, 0, 1, 23, 59, 0).getTime();
    const day2 = new Date(2026, 0, 2, 0, 1, 0).getTime();
    const groups = groupMessages([
      msg({ id: "1", createdAt: day1, authorId: "u1" }),
      msg({ id: "2", createdAt: day2, authorId: "u1" }),
    ]);
    expect(groups).toHaveLength(2);
  });
});

describe("dateDividerLabel", () => {
  const now = new Date(2026, 8, 28, 12, 0, 0).getTime();

  it('retorna "Hoje"', () => {
    expect(dateDividerLabel(now, now)).toBe("Hoje");
  });

  it('retorna "Ontem"', () => {
    const yesterday = now - 24 * 60 * 60 * 1000;
    expect(dateDividerLabel(yesterday, now)).toBe("Ontem");
  });

  it("retorna dia da semana + data por extenso pra dias mais antigos no mesmo ano", () => {
    const d = new Date(2026, 8, 25, 10, 0, 0).getTime();
    expect(dateDividerLabel(d, now)).toBe("Sexta-feira, 25 de setembro");
  });

  it("inclui o ano quando é de um ano diferente do atual", () => {
    const d = new Date(2025, 8, 25, 10, 0, 0).getTime();
    expect(dateDividerLabel(d, now)).toContain("2025");
  });
});

describe("isSameDay", () => {
  it("compara corretamente dois timestamps do mesmo dia", () => {
    const a = new Date(2026, 0, 1, 1, 0).getTime();
    const b = new Date(2026, 0, 1, 23, 0).getTime();
    expect(isSameDay(a, b)).toBe(true);
  });
  it("retorna false pra dias diferentes", () => {
    const a = new Date(2026, 0, 1).getTime();
    const b = new Date(2026, 0, 2).getTime();
    expect(isSameDay(a, b)).toBe(false);
  });
});

describe("firstUnreadIndex", () => {
  it("acha a primeira mensagem de outra pessoa após o último read", () => {
    const t0 = Date.now();
    const messages = [
      msg({ id: "1", createdAt: t0, authorId: "u2" }),
      msg({ id: "2", createdAt: t0 + 1000, authorId: "u2" }),
      msg({ id: "3", createdAt: t0 + 2000, authorId: "me" }),
    ];
    expect(firstUnreadIndex(messages, t0 - 1, "me")).toBe(0);
  });

  it("ignora mensagens do próprio usuário", () => {
    const t0 = Date.now();
    const messages = [msg({ id: "1", createdAt: t0, authorId: "me" })];
    expect(firstUnreadIndex(messages, t0 - 1, "me")).toBeNull();
  });

  it("retorna null quando tudo já foi lido", () => {
    const t0 = Date.now();
    const messages = [msg({ id: "1", createdAt: t0, authorId: "u2" })];
    expect(firstUnreadIndex(messages, t0 + 1, "me")).toBeNull();
  });
});

describe("countUnreadMentions", () => {
  it("conta só menções de outra pessoa a mim, não lidas", () => {
    const t0 = Date.now();
    const messages = [
      msg({
        id: "1",
        createdAt: t0,
        authorId: "u2",
        convoId: "c:geral",
        mentions: [{ kind: "user", id: "me", label: "Você" }],
      }),
      msg({
        id: "2",
        createdAt: t0,
        authorId: "me",
        convoId: "c:geral",
        mentions: [{ kind: "user", id: "me", label: "Você" }],
      }),
      msg({
        id: "3",
        createdAt: t0 - 10_000,
        authorId: "u2",
        convoId: "c:geral",
        mentions: [{ kind: "user", id: "me", label: "Você" }],
      }),
    ];
    expect(countUnreadMentions(messages, "me", { "c:geral": t0 - 5000 })).toBe(1);
  });
});

describe("rota da última conversa (localStorage)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persiste e recupera a última conversa aberta", () => {
    setLastConvoRoute({ kind: "dm", id: "u2" });
    expect(getLastConvoRoute()).toEqual({ kind: "dm", id: "u2" });
  });

  it("retorna null quando nunca foi setado", () => {
    expect(getLastConvoRoute()).toBeNull();
  });
});

describe("estado de recolhimento da sidebar", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("começa expandido por padrão", () => {
    expect(isSidebarSectionCollapsed("canais")).toBe(false);
  });

  it("persiste o estado recolhido", () => {
    setSidebarSectionCollapsed("canais", true);
    expect(isSidebarSectionCollapsed("canais")).toBe(true);
    setSidebarSectionCollapsed("canais", false);
    expect(isSidebarSectionCollapsed("canais")).toBe(false);
  });
});
