import { describe, expect, it } from "vitest";
import type { ChatChannel, ChatMember, ChatMention } from "@/lib/chat-store";
import {
  canMentionPeople,
  conversationKind,
  detectMentionTrigger,
  eligibleMentionMembers,
  expandEveryoneMention,
  highlightSegments,
  rankPeople,
  sanitizeMentionsForConversation,
} from "./chat-mentions";

const m = (id: string, name: string, role?: string, email?: string): ChatMember => ({
  id,
  name,
  role,
  email,
});
const MEMBERS = [
  m("me", "Eu Mesmo"),
  m("lucas", "Lucas Ragnoni", "Head de Marketing", "lucas@vocenohype.com"),
  m("rodrigo", "Rodrigo Hype", "Diretor", "rodrigo@vocenohype.com"),
  m("toni", "Toni Aversa", "Influencer Manager", "toni@vocenohype.com"),
  m("luana", "Luana Álvares", "Designer"),
];

describe("tipos de conversa", () => {
  it("classifica pelo convoId", () => {
    expect(conversationKind("dm:a|b")).toBe("dm");
    expect(conversationKind("c:123")).toBe("channel");
    expect(conversationKind("proj:9")).toBe("project");
    expect(conversationKind("camp:9")).toBe("campaign");
  });
  it("menção só em conversa coletiva", () => {
    expect(canMentionPeople("dm:a|b")).toBe(false);
    expect(canMentionPeople("c:1")).toBe(true);
    expect(canMentionPeople("proj:1")).toBe(true);
    expect(canMentionPeople("camp:1")).toBe(true);
  });
});

describe("gatilho de menção", () => {
  it("DM: '@' nunca abre autocomplete", () => {
    expect(detectMentionTrigger("@", 1, false)).toBeNull();
    expect(detectMentionTrigger("oi @Lucas", 9, false)).toBeNull();
  });
  it("canal: '@' abre, filtra e fecha com espaço", () => {
    expect(detectMentionTrigger("@", 1, true)).toEqual({ char: "@", start: 0, query: "" });
    expect(detectMentionTrigger("oi @luc", 7, true)).toEqual({ char: "@", start: 3, query: "luc" });
    expect(detectMentionTrigger("oi @luc ", 8, true)).toBeNull();
  });
  it("e-mail no meio da palavra não abre", () => {
    expect(detectMentionTrigger("fale com a@b.com", 16, true)).toBeNull();
  });
  it("'#' abre já ao digitar (lista sugerida), em qualquer conversa; '# ' com espaço não abre", () => {
    expect(detectMentionTrigger("# Título", 2, false)).toBeNull();
    expect(detectMentionTrigger("#", 1, false)).toEqual({ char: "#", start: 0, query: "" });
    expect(detectMentionTrigger("veja #lan", 9, false)).toEqual({
      char: "#",
      start: 5,
      query: "lan",
    });
  });
});

describe("elegibilidade", () => {
  const channels: ChatChannel[] = [
    {
      id: "c:priv",
      name: "Diretoria",
      createdAt: 0,
      private: true,
      allowedMemberIds: ["me", "rodrigo"],
    },
    { id: "c:pub", name: "Geral", createdAt: 0 },
  ];
  it("DM: ninguém", () => {
    expect(
      eligibleMentionMembers({ convoId: "dm:me|lucas", members: MEMBERS, channels, meId: "me" }),
    ).toEqual([]);
  });
  it("canal público/projeto: o time, sem o próprio autor", () => {
    const ids = eligibleMentionMembers({
      convoId: "c:pub",
      members: MEMBERS,
      channels,
      meId: "me",
    }).map((x) => x.id);
    expect(ids).toEqual(["lucas", "rodrigo", "toni", "luana"]);
    expect(
      eligibleMentionMembers({ convoId: "proj:1", members: MEMBERS, channels, meId: "me" }),
    ).toHaveLength(4);
  });
  it("canal privado: só os membros permitidos", () => {
    const ids = eligibleMentionMembers({
      convoId: "c:priv",
      members: MEMBERS,
      channels,
      meId: "me",
    }).map((x) => x.id);
    expect(ids).toEqual(["rodrigo"]);
  });
});

describe("normalização de menções ao gravar", () => {
  const user: ChatMention = { kind: "user", id: "lucas", label: "Lucas Ragnoni" };
  const task: ChatMention = { kind: "task", id: "t1", label: "Revisar briefing" };
  it("DM descarta menções de pessoa e mantém referências", () => {
    expect(sanitizeMentionsForConversation("dm:a|b", [user, task])).toEqual([task]);
    expect(
      sanitizeMentionsForConversation("dm:a|b", [
        { kind: "user", id: "__everyone__", label: "Todos" },
      ]),
    ).toEqual([]);
  });
  it("canal mantém e deduplica", () => {
    expect(sanitizeMentionsForConversation("c:1", [user, user, task])).toEqual([user, task]);
    expect(sanitizeMentionsForConversation("c:1", undefined)).toEqual([]);
  });
  it("@Todos vira uma menção por participante elegível, sem repetir quem já foi mencionado", () => {
    const out = expandEveryoneMention(
      [{ kind: "user", id: "__everyone__", label: "Todos" }, user],
      ["lucas", "rodrigo"],
    );
    expect(out.map((x) => x.id)).toEqual(["lucas", "rodrigo"]);
    expect(expandEveryoneMention([user], ["rodrigo"])).toEqual([user]);
  });
});

describe("busca de pessoas", () => {
  const pool = MEMBERS.filter((x) => x.id !== "me");
  it("sem busca: recentes primeiro, depois ordem alfabética, limitado", () => {
    const r = rankPeople(pool, "", { recentIds: ["toni", "rodrigo"], limit: 3 });
    expect(r.map((x) => x.member.id)).toEqual(["toni", "rodrigo", "luana"]);
  });
  it("com busca: por nome, usuário (e-mail) e cargo, sem acento", () => {
    expect(rankPeople(pool, "luc").map((x) => x.member.id)).toEqual(["lucas"]);
  });
  it("busca por cargo e usuário", () => {
    expect(rankPeople(pool, "diretor").map((x) => x.member.id)).toEqual(["rodrigo"]);
    expect(rankPeople(pool, "alvares").map((x) => x.member.id)).toEqual(["luana"]);
    expect(rankPeople(pool, "zzz")).toEqual([]);
  });
});

describe("destaque da busca", () => {
  it("marca o trecho encontrado, ignorando acento e maiúscula", () => {
    expect(highlightSegments("Lucas Ragnoni", "luc")).toEqual([
      { text: "Luc", match: true },
      { text: "as Ragnoni", match: false },
    ]);
    expect(highlightSegments("Luana Álvares", "alva")).toEqual([
      { text: "Luana ", match: false },
      { text: "Álva", match: true },
      { text: "res", match: false },
    ]);
    expect(highlightSegments("Toni", "")).toEqual([{ text: "Toni", match: false }]);
    expect(highlightSegments("Toni", "zz")).toEqual([{ text: "Toni", match: false }]);
  });
});
