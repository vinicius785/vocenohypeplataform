import { beforeEach, describe, expect, it, vi } from "vitest";

const inMock = vi.fn();
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { from: () => ({ select: () => ({ in: inMock }) }) },
}));

import { attachArtigoAuthors } from "./cliente-link.functions";

const art = (id: string, extra: Record<string, unknown> = {}) => ({ id, title: id, ...extra });

describe("attachArtigoAuthors", () => {
  beforeEach(() => inMock.mockReset());

  it("autor com foto: nome do cadastro + avatar, sem authorId", async () => {
    inMock.mockResolvedValue({
      data: [{ id: "u1", full_name: " Vinícius Garcia ", photo_url: "https://x/a.jpg" }],
      error: null,
    });
    const [a] = await attachArtigoAuthors([art("1", { authorId: "u1", authorName: "velho" })]);
    expect(a.authorName).toBe("Vinícius Garcia");
    expect(a.authorAvatar).toBe("https://x/a.jpg");
    expect(a).not.toHaveProperty("authorId");
  });

  it("autor sem foto: só o nome", async () => {
    inMock.mockResolvedValue({
      data: [{ id: "u1", full_name: "Ana", photo_url: null }],
      error: null,
    });
    const [a] = await attachArtigoAuthors([art("1", { authorId: "u1" })]);
    expect(a.authorName).toBe("Ana");
    expect(a.authorAvatar).toBeUndefined();
  });

  it("autor não encontrado: mantém authorName gravado, sem foto", async () => {
    inMock.mockResolvedValue({ data: [], error: null });
    const [a] = await attachArtigoAuthors([art("1", { authorId: "gone", authorName: "Fulano" })]);
    expect(a.authorName).toBe("Fulano");
    expect(a.authorAvatar).toBeUndefined();
  });

  it("artigo antigo / autor em texto livre: nenhuma consulta", async () => {
    const out = await attachArtigoAuthors([art("1"), art("2", { authorName: "Livre" })]);
    expect(inMock).not.toHaveBeenCalled();
    expect(out[1].authorName).toBe("Livre");
  });

  it("uma única consulta para vários artigos do mesmo autor", async () => {
    inMock.mockResolvedValue({
      data: [{ id: "u1", full_name: "Ana", photo_url: null }],
      error: null,
    });
    await attachArtigoAuthors([art("1", { authorId: "u1" }), art("2", { authorId: "u1" })]);
    expect(inMock).toHaveBeenCalledTimes(1);
    expect(inMock.mock.calls[0][1]).toEqual(["u1"]);
  });
});
