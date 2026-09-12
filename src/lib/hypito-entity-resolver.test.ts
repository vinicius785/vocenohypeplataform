import { describe, expect, it } from "vitest";
import { resolveEntity, resolveFollowUp, type EntityCandidate } from "@/lib/hypito-entity-resolver";

const pool: EntityCandidate[] = [
  { id: "1", name: "Poupatempo RJ" },
  { id: "2", name: "Poupatempo SP" },
  { id: "3", name: "Jackery" },
];

describe("resolveEntity", () => {
  it("resolve sozinho em correspondência exata/normalizada clara", () => {
    const r = resolveEntity("Jackery", pool);
    expect(r.kind).toBe("resolved");
    if (r.kind === "resolved") expect(r.match.entity.id).toBe("3");
  });

  it("resolve variações grafadas (PoupatempoRJ / poupatempo-rj) como o mesmo item", () => {
    const r1 = resolveEntity("PoupatempoRJ", pool);
    expect(r1.kind).toBe("resolved");
    if (r1.kind === "resolved") expect(r1.match.entity.id).toBe("1");

    const r2 = resolveEntity("poupatempo-rj", pool);
    expect(r2.kind).toBe("resolved");
    if (r2.kind === "resolved") expect(r2.match.entity.id).toBe("1");
  });

  it("dois candidatos próximos o bastante geram ambiguidade (pergunta, não escolhe sozinho)", () => {
    const r = resolveEntity("poupatempo", pool);
    expect(r.kind).toBe("ambiguous");
    if (r.kind === "ambiguous") expect(r.candidates.length).toBe(2);
  });

  it("nenhum candidato plausível -> not_found", () => {
    const r = resolveEntity("campanha inexistente xyz", pool);
    expect(r.kind).toBe("not_found");
  });

  it("query vazia ou pool vazio -> not_found", () => {
    expect(resolveEntity("", pool).kind).toBe("not_found");
    expect(resolveEntity("Jackery", []).kind).toBe("not_found");
  });

  it("candidato fora do pool (workspace/permissão) nunca aparece — resolver só enxerga o pool passado", () => {
    const restrictedPool = pool.filter((p) => p.id !== "3");
    const r = resolveEntity("Jackery", restrictedPool);
    expect(r.kind).toBe("not_found");
  });
});

describe("resolveFollowUp", () => {
  it("confirmação curta ('sim') só é válida com exatamente 1 candidato ofertado", () => {
    const single = [{ entity: pool[2], score: 0.7, reasons: [] }];
    expect(resolveFollowUp("sim", single)).toEqual(pool[2]);

    const many = [
      { entity: pool[0], score: 0.7, reasons: [] },
      { entity: pool[1], score: 0.65, reasons: [] },
    ];
    // "sim" sem contexto de escolha entre 2+ não resolve sozinho pra nenhum
    expect(resolveFollowUp("sim", many)).not.toEqual(pool[0]);
  });

  it("negação explícita devolve null (usuário recusou a sugestão)", () => {
    const single = [{ entity: pool[2], score: 0.7, reasons: [] }];
    expect(resolveFollowUp("não", single)).toBeNull();
  });

  it("nome corrigido/completado resolve contra os candidatos JÁ oferecidos, não a base inteira", () => {
    const candidates = [
      { entity: pool[0], score: 0.6, reasons: [] },
      { entity: pool[1], score: 0.58, reasons: [] },
    ];
    expect(resolveFollowUp("PoupatempoRJ", candidates)).toEqual(pool[0]);
  });

  it("resposta que não bate com nenhum candidato ofertado devolve null", () => {
    const candidates = [{ entity: pool[2], score: 0.7, reasons: [] }];
    expect(resolveFollowUp("outra coisa completamente diferente", candidates)).toBeNull();
  });
});
