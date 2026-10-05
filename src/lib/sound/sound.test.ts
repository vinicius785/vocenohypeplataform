import { describe, expect, it } from "vitest";
import { SOUND_KINDS, SOUND_MANIFEST } from "./sound-manifest";
import {
  DEFAULT_SOUND_PREFS,
  isSoundAllowed,
  normalizeSoundPrefs,
  withinCooldown,
} from "./sound-prefs";

describe("preferências de som", () => {
  it("padrão: tudo ligado, volume moderado", () => {
    expect(DEFAULT_SOUND_PREFS).toMatchObject({
      enabled: true,
      chat: true,
      commercial: true,
      meeting: true,
      update: true,
    });
    expect(DEFAULT_SOUND_PREFS.volume).toBeGreaterThan(0);
    expect(DEFAULT_SOUND_PREFS.volume).toBeLessThan(1);
  });
  it("interruptor geral desligado: nenhum tipo toca", () => {
    const off = { ...DEFAULT_SOUND_PREFS, enabled: false };
    for (const k of SOUND_KINDS) expect(isSoundAllowed(off, k)).toBe(false);
  });
  it("desligar um tipo não afeta os outros", () => {
    const p = { ...DEFAULT_SOUND_PREFS, chat: false };
    expect(isSoundAllowed(p, "chat")).toBe(false);
    expect(isSoundAllowed(p, "commercial")).toBe(true);
    expect(isSoundAllowed(p, "meeting")).toBe(true);
  });
  it("normaliza lixo do armazenamento (volume fora da faixa, tipos errados)", () => {
    expect(normalizeSoundPrefs({ volume: 5 }).volume).toBe(1);
    expect(normalizeSoundPrefs({ volume: -2 }).volume).toBe(0);
    expect(normalizeSoundPrefs({ volume: "alto", chat: "sim" })).toEqual(DEFAULT_SOUND_PREFS);
    expect(normalizeSoundPrefs(null)).toEqual(DEFAULT_SOUND_PREFS);
  });
});

describe("cooldown por tipo", () => {
  it("suprime toques repetidos dentro da janela, só se houver cooldown", () => {
    expect(withinCooldown(1000, null, 2500)).toBe(false);
    expect(withinCooldown(2000, 1000, 2500)).toBe(true);
    expect(withinCooldown(4000, 1000, 2500)).toBe(false);
    expect(withinCooldown(1001, 1000, 0)).toBe(false);
  });
  it("chat tem cooldown; reunião nunca é suprimida", () => {
    expect(SOUND_MANIFEST.chat.cooldownMs).toBeGreaterThan(0);
    expect(SOUND_MANIFEST.meeting.cooldownMs).toBe(0);
  });
});

describe("manifest", () => {
  it("quatro eventos, assets oficiais em /audio/voce-no-hype com nomes distintos", () => {
    expect(SOUND_KINDS).toEqual(["chat", "commercial", "meeting", "update"]);
    const srcs = SOUND_KINDS.map((k) => SOUND_MANIFEST[k].src);
    expect(new Set(srcs).size).toBe(4);
    for (const s of srcs) expect(s).toMatch(/^\/audio\/voce-no-hype\/.+-notification\.mp3\?v=\w+$/);
  });
});
