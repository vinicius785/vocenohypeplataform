import { describe, expect, it } from "vitest";
import { existsSync, statSync } from "node:fs";
import { LOADING_VIDEO_DESKTOP, LOADING_VIDEO_MOBILE, pickLoadingVideo } from "@/lib/loading-video";

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
