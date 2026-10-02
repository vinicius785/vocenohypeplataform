import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  formatResponseDuration,
  mapResponseTimeRow,
  mapTeamResponseRows,
  segmentOf,
} from "./member-response-time";

describe("formatResponseDuration", () => {
  it("formata minutos, horas e dias; sem dado vira travessão", () => {
    expect(formatResponseDuration(null)).toBe("—");
    expect(formatResponseDuration(20)).toBe("< 1 min");
    expect(formatResponseDuration(18 * 60)).toBe("18 min");
    expect(formatResponseDuration(2 * 3600)).toBe("2h");
    expect(formatResponseDuration(2 * 3600 + 5 * 60)).toBe("2h 05min");
    expect(formatResponseDuration(27 * 3600)).toBe("1d 3h");
    expect(formatResponseDuration(48 * 3600)).toBe("2d");
  });
});

describe("mapResponseTimeRow", () => {
  it("sem linha (membro sem histórico) devolve zeros e nulos, nunca quebra", () => {
    const r = mapResponseTimeRow(null);
    expect(r.all).toEqual({
      answered: 0,
      unanswered: 0,
      averageSeconds: null,
      medianSeconds: null,
    });
    expect(r.direct.answered).toBe(0);
  });

  it("soma respondidas/sem resposta de diretas + menções e preserva média/mediana do banco", () => {
    const r = mapResponseTimeRow({
      direct_answered: 3,
      direct_unanswered: 1,
      direct_avg_seconds: 840,
      direct_median_seconds: 600,
      mention_answered: 3,
      mention_unanswered: 2,
      mention_avg_seconds: 1620,
      mention_median_seconds: 1500,
      all_avg_seconds: 1152,
      all_median_seconds: 900,
    });
    expect(r.all.answered).toBe(6);
    expect(r.all.unanswered).toBe(3);
    expect(segmentOf(r, "direct").averageSeconds).toBe(840);
    expect(segmentOf(r, "mention").medianSeconds).toBe(1500);
    expect(segmentOf(r, "all").medianSeconds).toBe(900);
  });

  it("o tipo de saída não tem NENHUM campo que carregue mensagem/remetente/destinatário", () => {
    const keys = JSON.stringify(Object.keys(mapResponseTimeRow(null).direct));
    expect(keys).not.toMatch(/text|message|sender|author|recipient|convo|link/i);
  });
});

describe("amostra mínima (privacidade)", () => {
  it("com menos de 3 respondidas, média/mediana nunca saem — só a contagem", () => {
    const r = mapResponseTimeRow({
      direct_answered: 1,
      direct_unanswered: 0,
      direct_avg_seconds: 600,
      direct_median_seconds: 600,
      mention_answered: 1,
      mention_unanswered: 0,
      mention_avg_seconds: 1200,
      mention_median_seconds: 1200,
      all_avg_seconds: 900,
      all_median_seconds: 900,
    });
    expect(r.direct.averageSeconds).toBeNull();
    expect(r.mention.medianSeconds).toBeNull();
    expect(r.all.averageSeconds).toBeNull();
  });
  it("time: média ponderada só com quem passou da amostra mínima", () => {
    const t = mapTeamResponseRows([
      { member_id: "a", answered_count: 3, average_seconds: 600 },
      { member_id: "b", answered_count: 1, average_seconds: 60_000 },
      { member_id: "c", answered_count: 6, average_seconds: 1200 },
    ]);
    expect(t.byMemberId.get("b")?.averageSeconds).toBeNull();
    expect(t.teamAverageSeconds).toBe((600 * 3 + 1200 * 6) / 9);
    expect(mapTeamResponseRows([]).teamAverageSeconds).toBeNull();
  });
});

describe("guarda de privacidade — Comunicação só agregada", () => {
  // Se alguém um dia fizer a UI/servidor da métrica ler ou exibir mensagens,
  // este teste quebra de propósito: a regra do produto é "somente agregados".
  const files = [
    "src/lib/member-response-time.ts",
    "src/lib/member-response-time.functions.ts",
    "src/components/time-v2/ProfileCommunication.tsx",
    "src/components/time-v2/use-response-time.ts",
  ];
  const FORBIDDEN = [
    /chat_messages/,
    /chat-store/,
    /from\(["']chat/,
    /author_id|authorId|author_name/,
    /convo_id|convoId/,
    /\.text\b/,
    /to=["']\/chat|navigate\(\{\s*to:\s*["']\/chat/,
  ];
  for (const f of files) {
    it(`${f} não toca em mensagens, remetentes, conversas nem links de chat`, () => {
      const src = readFileSync(path.resolve(process.cwd(), f), "utf8")
        // comentários explicam a regra citando os termos proibidos
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const re of FORBIDDEN) expect(src).not.toMatch(re);
    });
  }
});
