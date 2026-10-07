import { describe, expect, it } from "vitest";
import { describeStorageUploadError } from "./storage-upload-error";

const file = { size: 120 * 1024 * 1024 };

describe("describeStorageUploadError", () => {
  it("arquivo acima do limite do servidor (mensagem do Storage ou 413)", () => {
    const msg = "The object exceeded the maximum allowed size";
    expect(describeStorageUploadError({ message: msg }, file)).toContain("120.0MB");
    expect(describeStorageUploadError({ message: msg }, file)).toContain("limite de envio");
    expect(describeStorageUploadError({ message: "x", statusCode: "413" }, file)).toContain(
      "limite de envio",
    );
  });

  it("permissão/sessão (RLS, 401, 403)", () => {
    expect(
      describeStorageUploadError({ message: "new row violates row-level security policy" }, file),
    ).toContain("Sem permissão");
    expect(describeStorageUploadError({ message: "x", status: 403 }, file)).toContain(
      "Sem permissão",
    );
  });

  it("rede", () => {
    expect(describeStorageUploadError({ message: "TypeError: Failed to fetch" }, file)).toContain(
      "conexão caiu",
    );
  });

  it("qualquer outro erro mostra a mensagem real, nunca um 'falhou' genérico", () => {
    expect(describeStorageUploadError({ message: "Bucket not found" }, file)).toBe(
      "Erro do servidor: Bucket not found",
    );
    expect(describeStorageUploadError({}, file)).toBe("O servidor recusou o envio. Tente de novo.");
  });
});
