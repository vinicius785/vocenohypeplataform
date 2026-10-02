import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  formatResponseDuration,
  mapResponseTimeRow,
  responsePeriodRange,
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
      mention_answered: 2,
      mention_unanswered: 2,
      mention_avg_seconds: 1620,
      mention_median_seconds: 1500,
      all_avg_seconds: 1152,
      all_median_seconds: 900,
    });
    expect(r.all.answered).toBe(5);
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

describe("responsePeriodRange", () => {
  const now = new Date(2026, 9, 2, 15, 30); // sex 2/out/2026
  it("hoje = [00:00, 24:00)", () => {
    const { from, to } = responsePeriodRange("hoje", now);
    expect(from.getDate()).toBe(2);
    expect(to.getTime() - from.getTime()).toBe(24 * 3600 * 1000);
  });
  it("semana começa na segunda e dura 7 dias", () => {
    const { from, to } = responsePeriodRange("semana", now);
    expect(from.getDay()).toBe(1);
    expect(from.getDate()).toBe(28); // seg 28/set
    expect(to.getDate()).toBe(5);
  });
  it("mês = dia 1 até dia 1 do próximo", () => {
    const { from, to } = responsePeriodRange("mes", now);
    expect(from.getDate()).toBe(1);
    expect(from.getMonth()).toBe(9);
    expect(to.getMonth()).toBe(10);
  });
});

describe("guarda de privacidade — Comunicação só agregada", () => {
  // Se alguém um dia fizer a UI/servidor da métrica ler ou exibir mensagens,
  // este teste quebra de propósito: a regra do produto é "somente agregados".
  const files = [
    "src/lib/member-response-time.ts",
    "src/lib/member-response-time.functions.ts",
    "src/components/time-v2/ProfileCommunication.tsx",
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
