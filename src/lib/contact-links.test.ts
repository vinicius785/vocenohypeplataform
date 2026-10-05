import { describe, expect, it } from "vitest";
import { mailtoUrl, whatsappUrl } from "./contact-links";

describe("whatsappUrl", () => {
  it("celular com DDD ganha 55", () => {
    expect(whatsappUrl("(11) 99999-9999")).toBe("https://wa.me/5511999999999");
    expect(whatsappUrl("(11) 3333-4444")).toBe("https://wa.me/551133334444");
  });
  it("já internacional fica como está; incompleto/vazio não gera link", () => {
    expect(whatsappUrl("+55 21 98114-5276")).toBe("https://wa.me/5521981145276");
    expect(whatsappUrl("99999")).toBeNull();
    expect(whatsappUrl("")).toBeNull();
    expect(whatsappUrl(undefined)).toBeNull();
  });
});
describe("mailtoUrl", () => {
  it("só e-mail válido", () => {
    expect(mailtoUrl(" a@b.com ")).toBe("mailto:a@b.com");
    expect(mailtoUrl("a@b")).toBeNull();
    expect(mailtoUrl("")).toBeNull();
  });
});
