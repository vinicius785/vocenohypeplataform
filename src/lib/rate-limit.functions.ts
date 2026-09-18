/**
 * Public (unauthenticated) server-function wrappers around
 * `rate-limit.server.ts`'s `checkRateLimit`, for the two flows that run
 * before any session exists (login, password recovery) and therefore can't
 * use `requireSupabaseAuth`. Both are intentionally minimal — email in,
 * boolean out, never revealing exact counts/reset times (see CLAUDE.md
 * piece C) — so they can't be used to time an attack more precisely than
 * "try again later".
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { checkRateLimit, emailBucket } from "@/lib/rate-limit.server";

const EmailInput = z.object({ email: z.string().trim().max(255) });

/** ~10 attempts / 15 min per email — generous anti-brute-force floor, not a
 * strict product limit. Call BEFORE attempting `signInWithPassword`; if
 * this returns `false`, don't call Supabase auth at all. */
export const checkLoginRateLimit = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => EmailInput.parse(raw))
  .handler(async ({ data }) => {
    const allowed = await checkRateLimit(emailBucket("login", data.email), 10, 15 * 60);
    return { allowed };
  });

/** ~3 attempts / hour per email. */
export const checkRecoveryRateLimit = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => EmailInput.parse(raw))
  .handler(async ({ data }) => {
    const allowed = await checkRateLimit(emailBucket("recovery", data.email), 3, 60 * 60);
    return { allowed };
  });
