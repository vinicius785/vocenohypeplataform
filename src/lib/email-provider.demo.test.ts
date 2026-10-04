import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  send: vi.fn().mockResolvedValue({ data: { id: "msg-1" }, error: null }),
  configReads: 0,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: h.send };
  },
}));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: () => {
      h.configReads += 1;
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  provider: "resend",
                  api_key: "re_test",
                  from_email: "no-reply@vnh.test",
                  from_name: "VNH",
                  reply_to: null,
                },
                error: null,
              }),
          }),
        }),
      };
    },
  },
}));

import { sendEmail } from "./email-provider.server";
import { DEMO_EMAIL_BLOCKED_MESSAGE } from "./demo/demo-guards";

beforeEach(() => {
  h.send.mockClear();
  h.configReads = 0;
});

describe("sendEmail × Demo (gargalo único de e-mail)", () => {
  it("destinatário de demonstração (.invalid) é recusado ANTES de ler config ou chamar o provedor", async () => {
    for (const to of ["contato@demo.invalid", "X@Y.INVALID", "z@invalid"]) {
      const r = await sendEmail({ to, subject: "s", html: "<p>x</p>" });
      expect(r).toEqual({ ok: false, error: DEMO_EMAIL_BLOCKED_MESSAGE });
    }
    expect(h.send).not.toHaveBeenCalled();
    expect(h.configReads).toBe(0);
  });

  it("destinatário real continua enviando normalmente", async () => {
    const r = await sendEmail({ to: "ana@praiabonita.com.br", subject: "s", html: "<p>x</p>" });
    expect(r).toEqual({ ok: true, providerMessageId: "msg-1" });
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0][0]).toMatchObject({ to: "ana@praiabonita.com.br", subject: "s" });
  });
});
