import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data: unknown; error: { message: string } | null };
let likes: Result;
let comments: Result;

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const res = () => (table === "blog_likes" ? likes : comments);
      const chain = {
        select: () => chain,
        eq: () => (table === "blog_likes" ? Promise.resolve(res()) : chain),
        order: () => Promise.resolve(res()),
      };
      return chain;
    },
  },
}));

import { readArtigoEngagement } from "./cliente-link.functions";

const ok = (data: unknown): Result => ({ data, error: null });

describe("readArtigoEngagement", () => {
  beforeEach(() => {
    likes = ok([]);
    comments = ok([]);
  });

  it("artigo sem curtidas nem comentários: zeros, sem erro", async () => {
    expect(await readArtigoEngagement("c1", "p1")).toEqual({
      likeCount: 0,
      likedByMe: false,
      comments: [],
    });
  });

  it("curtidas de outros clientes contam, mas likedByMe é só do cliente da sessão", async () => {
    likes = ok([{ liker_key: "cliente:c2" }, { liker_key: "cliente:c3" }]);
    expect(await readArtigoEngagement("c1", "p1")).toMatchObject({
      likeCount: 2,
      likedByMe: false,
    });
    likes = ok([{ liker_key: "cliente:c1" }, { liker_key: "cliente:c2" }]);
    expect(await readArtigoEngagement("c1", "p1")).toMatchObject({ likeCount: 2, likedByMe: true });
  });

  it("comentários: mapeia só autor, tipo, texto e data (nada interno)", async () => {
    comments = ok([
      {
        id: "k1",
        author_label: "Equipe VNH",
        author_kind: "team",
        body: "Oi",
        created_at: "2026-10-01T10:00:00Z",
        email: "interno@x.com",
      },
      {
        id: "k2",
        author_label: "Acme",
        author_kind: "cliente",
        body: "Olá",
        created_at: "2026-10-02T10:00:00Z",
      },
    ]);
    const r = await readArtigoEngagement("c1", "p1");
    expect(r.comments).toEqual([
      {
        id: "k1",
        authorLabel: "Equipe VNH",
        authorKind: "team",
        body: "Oi",
        createdAt: "2026-10-01T10:00:00Z",
      },
      {
        id: "k2",
        authorLabel: "Acme",
        authorKind: "cliente",
        body: "Olá",
        createdAt: "2026-10-02T10:00:00Z",
      },
    ]);
  });

  it("erro de banco vira mensagem genérica (sem vazar o texto do Postgres)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    likes = { data: null, error: { message: 'relation "blog_likes" does not exist' } };
    await expect(readArtigoEngagement("c1", "p1")).rejects.toThrow(/Não foi possível completar/);
    await expect(readArtigoEngagement("c1", "p1")).rejects.not.toThrow(/relation/);
  });
});
