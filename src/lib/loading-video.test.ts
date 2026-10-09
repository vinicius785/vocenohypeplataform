import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, statSync } from "node:fs";
import {
  LOADING_VIDEO_DESKTOP,
  LOADING_VIDEO_DURATION_MS,
  LOADING_VIDEO_MOBILE,
  pendingMinMsForLoadingVideo,
  pickLoadingVideo,
} from "@/lib/loading-video";

describe("pickLoadingVideo", () => {
  it("tela larga → vídeo horizontal; retrato → vertical", () => {
    expect(pickLoadingVideo({ reducedMotion: false, portrait: false })).toEqual({
      kind: "video",
      src: LOADING_VIDEO_DESKTOP,
    });
    expect(pickLoadingVideo({ reducedMotion: false, portrait: true })).toEqual({
      kind: "video",
      src: LOADING_VIDEO_MOBILE,
    });
  });

  it("movimento reduzido nunca recebe vídeo (indicador estático)", () => {
    expect(pickLoadingVideo({ reducedMotion: true, portrait: false })).toEqual({ kind: "static" });
    expect(pickLoadingVideo({ reducedMotion: true, portrait: true })).toEqual({ kind: "static" });
  });

  it("os arquivos referenciados existem em public/ e são leves (< 2 MB)", () => {
    for (const src of [LOADING_VIDEO_DESKTOP, LOADING_VIDEO_MOBILE]) {
      const path = `public${src}`;
      expect(existsSync(path), path).toBe(true);
      expect(statSync(path).size).toBeLessThan(2 * 1024 * 1024);
    }
  });
});

describe("pendingMinMsForLoadingVideo — o vídeo toca inteiro antes de trocar de tela", () => {
  it("com vídeo, a tela fica pelo menos a duração do vídeo (6 s) mais folga de início", () => {
    const ms = pendingMinMsForLoadingVideo(false);
    expect(ms).toBeGreaterThanOrEqual(LOADING_VIDEO_DURATION_MS);
    expect(ms).toBeLessThanOrEqual(LOADING_VIDEO_DURATION_MS + 1000);
  });
  it("movimento reduzido não espera 6 s (não há vídeo)", () => {
    expect(pendingMinMsForLoadingVideo(true)).toBeLessThan(1000);
  });
  it("a rota autenticada aplica esse tempo mínimo", () => {
    const route = readFileSync("src/routes/_authenticated/route.tsx", "utf8");
    expect(route).toContain("pendingMinMs: pendingMinMsForLoadingVideo(");
  });
  it("a duração declarada coincide com a dos arquivos (6 s)", () => {
    expect(LOADING_VIDEO_DURATION_MS).toBe(6000);
  });
});

describe("a tela toca o vídeo uma vez, sem loop", () => {
  it("o componente não usa o atributo loop", () => {
    const src = readFileSync("src/components/auth/PreparingEnvironmentScreen.tsx", "utf8");
    expect(src).not.toMatch(/^\s*loop\s*$/m);
    expect(src).toContain("autoPlay");
  });
});
