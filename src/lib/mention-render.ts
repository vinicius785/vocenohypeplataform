import type { ChatMention } from "./chat-store";

/** Quebra um texto de mensagem em segmentos de string + `ChatMention`, na
 * ordem em que aparecem — extraído como função pura (sem JSX) pra ser
 * testável sem DOM. Cada `ChatMention` já carrega `{kind, id, label}`
 * persistidos de verdade (nunca só o texto "@Nome"): a busca aqui é só
 * pra decidir ONDE recortar o texto pra render, o vínculo real (id/tipo)
 * já veio pronto de `message.mentions`. Mesma técnica de sempre: primeira
 * ocorrência de `"@" + label` por menção, na ordem em que as menções
 * aparecem no array (não na ordem em que aparecem no texto — mensagens
 * reais têm as menções na ordem de digitação, que já bate com a ordem no
 * texto na prática). */
export function splitMentionParts(
  text: string,
  mentions: ChatMention[] | undefined,
): (string | ChatMention)[] {
  const parts: (string | ChatMention)[] = [text];
  if (!mentions || mentions.length === 0) return parts;
  for (const m of mentions) {
    // Pessoa: "@Nome". Referência a entidade (tarefa/projeto/campanha/cliente): "#Rótulo" — e,
    // para mensagens antigas (anteriores à separação @/#), "@Rótulo" também continua valendo.
    const tokens = m.kind === "user" ? ["@" + m.label] : ["#" + m.label, "@" + m.label];
    for (let i = 0; i < parts.length; i++) {
      const seg = parts[i];
      if (typeof seg !== "string") continue;
      let token = tokens[0];
      let idx = seg.indexOf(token);
      for (let t = 1; idx < 0 && t < tokens.length; t++) {
        token = tokens[t];
        idx = seg.indexOf(token);
      }
      if (idx < 0) continue;
      const before = seg.slice(0, idx);
      const after = seg.slice(idx + token.length);
      parts.splice(i, 1, before, m, after);
      i += 2;
    }
  }
  return parts;
}
