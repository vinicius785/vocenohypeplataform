import { describe, expect, it } from "vitest";
import { buildDemoScenario, demoCampanhaId, demoClienteId } from "./cenario-campanha-completa";
import {
  buildCartoonAvatarSvg,
  cartoonAvatarDataUrl,
  shade,
  type AvatarHair,
  type AvatarSpec,
} from "./demo-avatars";

const SESSION = "11111111-2222-4333-8444-555555555555";
const influs = () =>
  buildDemoScenario({
    sessionId: SESSION,
    clienteId: demoClienteId(SESSION),
    campanhaId: demoCampanhaId(SESSION),
    now: new Date("2026-10-05T15:00:00.000Z"),
    empresa: "X",
    assetUrl: () => "u",
  }).payload.influenciadores.map((r) => r.data);

const decode = (url: string) => decodeURIComponent(url.slice(url.indexOf(",") + 1));

describe("avatares cartoon dos influenciadores fictícios", () => {
  it("todos os 7 têm foto, em data URL de SVG, e cada um é DIFERENTE", () => {
    const fotos = influs().map((i) => i.foto);
    expect(fotos).toHaveLength(7);
    for (const f of fotos) expect(f).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(new Set(fotos).size).toBe(7);
  });

  it("são SVG válidos, seguros (sem script, evento, link ou recurso externo) e leves", () => {
    for (const i of influs()) {
      const svg = decode(i.foto!);
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).not.toMatch(/<script|<foreignObject|<image|<a\s|\son\w+=|javascript:|href=/i);
      // a única URL é o namespace do SVG
      expect([...svg.matchAll(/https?:\/\/[^"'\s)]+/g)].map((m) => m[0])).toEqual([
        "http://www.w3.org/2000/svg",
      ]);
      expect(i.foto!.length).toBeLessThan(9_000);
    }
  });

  it("determinísticos: mesmo cenário ⇒ mesmas fotos (reiniciar não troca o rosto)", () => {
    expect(influs().map((i) => i.foto)).toEqual(influs().map((i) => i.foto));
  });

  it("ids internos do SVG são únicos por influenciador (vários na mesma página não colidem)", () => {
    const ids = influs().map((i) => /id="bg([^"]+)"/.exec(decode(i.foto!))![1]);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("gerador", () => {
  const base: AvatarSpec = {
    bg: ["#fff", "#eee"],
    skin: "#e8b48f",
    hair: "#3b2418",
    hairStyle: "curto",
    shirt: "#2563eb",
  };

  it("todos os estilos de cabelo geram um SVG completo", () => {
    const styles: AvatarHair[] = [
      "curto",
      "longo-ondulado",
      "longo-liso",
      "rabo",
      "coque",
      "bone",
      "crespo",
    ];
    for (const hairStyle of styles) {
      const svg = buildCartoonAvatarSvg({ ...base, hairStyle, cap: "#ef4444" });
      expect(svg, hairStyle).toContain("<ellipse"); // cabeça
      expect(svg.match(/<svg/g)).toHaveLength(1);
    }
  });

  it("acessórios só aparecem quando pedidos", () => {
    const plain = buildCartoonAvatarSvg(base);
    expect(plain).not.toContain('stroke="#1f2937"'); // óculos
    expect(buildCartoonAvatarSvg({ ...base, glasses: true })).toContain('stroke="#1f2937"');
    expect(buildCartoonAvatarSvg({ ...base, earrings: true })).toContain("#fbbf24");
    expect(buildCartoonAvatarSvg({ ...base, beard: true }).length).toBeGreaterThan(plain.length);
    expect(buildCartoonAvatarSvg({ ...base, freckles: true }).length).toBeGreaterThan(plain.length);
  });

  it("data URL é a codificação do SVG", () => {
    expect(decode(cartoonAvatarDataUrl(base, "z"))).toBe(buildCartoonAvatarSvg(base, "z"));
  });

  it("shade escurece sem estourar a faixa de cor", () => {
    expect(shade("#ffffff", 0.5)).toBe("#808080");
    expect(shade("#000000")).toBe("#000000");
    expect(shade("#e8b48f")).toMatch(/^#[0-9a-f]{6}$/);
  });
});
