import { describe, expect, it } from "vitest";
import { formatIsoDate, parseIsoDateLocal } from "./utils";

describe("datas só-dia (fuso local, nunca UTC)", () => {
  it("formatIsoDate mostra o mesmo dia, mesmo com sufixo de hora", () => {
    expect(formatIsoDate("2026-10-20")).toBe("20/10/2026");
    expect(formatIsoDate("2026-10-20T00:00:00.000Z")).toBe("20/10/2026");
  });
  it("parseIsoDateLocal é meia-noite local do dia informado", () => {
    const d = parseIsoDateLocal("2026-10-20");
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 20, 0]);
  });
});
