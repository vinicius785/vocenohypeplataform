import { describe, expect, it } from "vitest";
import {
  MAX_AVATAR_BYTES,
  sniffImageType,
  validateAvatarFile,
  extensionForType,
} from "../lib/avatar-upload";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
const FAKE_EXE = new Uint8Array([0x4d, 0x5a, 0x90, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

describe("sniffImageType — nunca confia na extensão, só nos bytes reais", () => {
  it("reconhece JPEG/PNG/WebP pelos magic numbers", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("rejeita um arquivo renomeado (ex: .exe disfarçado de .jpg)", () => {
    expect(sniffImageType(FAKE_EXE)).toBeNull();
  });

  it("rejeita bytes insuficientes", () => {
    expect(sniffImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });
});

describe("validateAvatarFile", () => {
  it("aceita um JPEG dentro do limite", () => {
    expect(validateAvatarFile(1024, "image/jpeg")).toBeNull();
  });

  it("rejeita acima do limite de tamanho", () => {
    const error = validateAvatarFile(MAX_AVATAR_BYTES + 1, "image/jpeg");
    expect(error?.code).toBe("too_large");
  });

  it("rejeita formato não reconhecido", () => {
    const error = validateAvatarFile(1024, null);
    expect(error?.code).toBe("invalid_format");
  });
});

describe("extensionForType", () => {
  it("mapeia cada tipo reconhecido pra sua extensão", () => {
    expect(extensionForType("image/jpeg")).toBe("jpg");
    expect(extensionForType("image/png")).toBe("png");
    expect(extensionForType("image/webp")).toBe("webp");
  });
});
