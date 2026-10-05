import { describe, expect, it } from "vitest";
import { splitMentionParts } from "./mention-render";
import type { ChatMention } from "./chat-store";

const user: ChatMention = { kind: "user", id: "u1", label: "Lucas Ragnoni" };
const task: ChatMention = { kind: "task", id: "t1", label: "Refazer o roadmap" };
const campaign: ChatMention = { kind: "campaign", id: "c1", label: "Poupatempo RJ" };

describe("splitMentionParts", () => {
  it("retorna o texto inteiro como única parte quando não há menções", () => {
    expect(splitMentionParts("mensagem sem nada", undefined)).toEqual(["mensagem sem nada"]);
    expect(splitMentionParts("mensagem sem nada", [])).toEqual(["mensagem sem nada"]);
  });

  it("separa uma única menção mantendo o texto ao redor", () => {
    const parts = splitMentionParts("Oi @Lucas Ragnoni, tudo bem?", [user]);
    expect(parts).toEqual(["Oi ", user, ", tudo bem?"]);
  });

  it("separa duas menções diferentes, na ordem em que aparecem no texto", () => {
    const parts = splitMentionParts("@Lucas Ragnoni vê a @Poupatempo RJ", [user, campaign]);
    expect(parts).toEqual(["", user, " vê a ", campaign, ""]);
  });

  it("preserva o mention real (kind/id) mesmo pra rótulos com espaço", () => {
    const parts = splitMentionParts("segue a @Refazer o roadmap", [task]);
    const found = parts.find((p) => typeof p !== "string") as ChatMention;
    expect(found).toEqual(task);
  });

  it("não quebra nada quando a menção não aparece de fato no texto (dado inconsistente)", () => {
    const parts = splitMentionParts("mensagem qualquer", [user]);
    expect(parts).toEqual(["mensagem qualquer"]);
  });

  it("não deixa o mesmo texto ser recortado duas vezes para a mesma menção repetida no array", () => {
    const parts = splitMentionParts("Oi @Lucas Ragnoni", [user, user]);
    const mentionCount = parts.filter((p) => typeof p !== "string").length;
    expect(mentionCount).toBe(1);
  });
});

describe("referências com '#' (separadas das menções de pessoa com '@')", () => {
  const user = { kind: "user", id: "u1", label: "Lucas" } as const;
  const task = { kind: "task", id: "t1", label: "Briefing" } as const;
  it("pessoa é recortada por '@Nome' e referência por '#Rótulo'", () => {
    expect(splitMentionParts("Oi @Lucas veja #Briefing hoje", [user, task])).toEqual([
      "Oi ",
      user,
      " veja ",
      task,
      " hoje",
    ]);
  });
  it("mensagens antigas com '@Rótulo' para entidade continuam renderizando", () => {
    expect(splitMentionParts("veja @Briefing", [task])).toEqual(["veja ", task, ""]);
  });
  it("'@Rótulo' de uma entidade não é confundido com pessoa e '#Nome' de pessoa não casa", () => {
    expect(splitMentionParts("#Lucas", [user])).toEqual(["#Lucas"]);
  });
});
