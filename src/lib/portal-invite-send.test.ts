import { beforeEach, describe, expect, it, vi } from "vitest";

const sendEmail = vi.fn();
vi.mock("@/lib/email-provider.server", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

import { sendPortalAccessInviteEmail } from "@/lib/organization-invites.functions";

function fakeAdmin(linkResult: { link?: string | null; error?: string }) {
  const generateLink = vi.fn().mockResolvedValue({
    data: linkResult.link ? { properties: { action_link: linkResult.link } } : null,
    error: linkResult.error ? { message: linkResult.error } : null,
  });
  const from = (table: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: table === "organizations" ? { name: "Acme" } : { full_name: "Vini" },
        }),
      }),
    }),
  });
  return { admin: { from, auth: { admin: { generateLink } } } as never, generateLink };
}

const opts = {
  actorUserId: "u1",
  organizationId: "o1",
  email: "pessoa@acme.com",
  role: "client_standard" as const,
  existingAccount: false,
};

describe("sendPortalAccessInviteEmail", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    process.env.APP_URL = "https://app.exemplo.com";
  });

  it("conta nova: gera link de criar senha e envia o e-mail sem senha", async () => {
    sendEmail.mockResolvedValue({ ok: true, providerMessageId: "1" });
    const { admin, generateLink } = fakeAdmin({ link: "https://sb.co/verify?token=abc" });
    const r = await sendPortalAccessInviteEmail(admin, opts);
    expect(r).toEqual({ emailSent: true, emailError: null });
    expect(generateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "recovery",
        options: { redirectTo: "https://app.exemplo.com/criar-senha" },
      }),
    );
    const sent = sendEmail.mock.calls[0][0] as { to: string; subject: string; html: string };
    expect(sent.to).toBe("pessoa@acme.com");
    expect(sent.subject).toContain("Acme");
    expect(sent.html).toContain("https://sb.co/verify?token=abc");
  });

  it("conta existente: link do login, sem gerar token", async () => {
    sendEmail.mockResolvedValue({ ok: true, providerMessageId: null });
    const { admin, generateLink } = fakeAdmin({ link: null });
    const r = await sendPortalAccessInviteEmail(admin, { ...opts, existingAccount: true });
    expect(r.emailSent).toBe(true);
    expect(generateLink).not.toHaveBeenCalled();
    expect((sendEmail.mock.calls[0][0] as { html: string }).html).toContain(
      'href="https://app.exemplo.com/"',
    );
  });

  it("provedor sem configuração: não lança, devolve o motivo", async () => {
    sendEmail.mockResolvedValue({ ok: false, error: "Provedor de e-mail não configurado." });
    const { admin } = fakeAdmin({ link: "https://sb.co/x" });
    expect(await sendPortalAccessInviteEmail(admin, opts)).toEqual({
      emailSent: false,
      emailError: "Provedor de e-mail não configurado.",
    });
  });

  it("falha ao gerar o link: não envia e não lança", async () => {
    const { admin } = fakeAdmin({ error: "boom" });
    const r = await sendPortalAccessInviteEmail(admin, opts);
    expect(r.emailSent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
