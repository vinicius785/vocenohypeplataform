import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  // Campos do formulário público (nomes em EN, rótulos em PT)
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(60).optional().or(z.literal("")),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  role: z.string().trim().max(120).optional().or(z.literal("")),
  industry: z.string().trim().max(120).optional().or(z.literal("")),
  monthly_budget: z.union([z.string(), z.number()]).optional(),
  urgency: z.string().trim().max(120).optional().or(z.literal("")),
  agency_experience: z.string().trim().max(500).optional().or(z.literal("")),

  // Compat opcional
  source: z.string().trim().max(120).optional(),
  source_form: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(5000).optional(),
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function parseSingleMoney(input: string): number {
  const s = input.trim().toLowerCase();
  if (!s) return 0;
  let multiplier = 1;
  let core = s;
  const mMatch = s.match(/^(.*?)(k|mil|mm|mi|milhão|milhoes|milhões|m)\s*$/);
  if (mMatch) {
    core = mMatch[1];
    const suf = mMatch[2];
    if (suf === "k" || suf === "mil") multiplier = 1_000;
    else multiplier = 1_000_000;
  }
  const cleaned = core
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const n = Number(cleaned);
  return isFinite(n) ? n * multiplier : 0;
}

function parseMoney(input: unknown): number {
  if (typeof input === "number" && isFinite(input)) return input;
  if (typeof input !== "string") return 0;
  const s = input.trim();
  if (!s) return 0;
  // Faixas do formulário: "R$10K – R$20K", "R$50K - R$100K", "ACIMA DE R$100K", etc.
  // Extrai todos os valores monetários da string e usa o maior (limite superior da faixa).
  const parts = s.split(/\s*(?:–|—|-|a|até|ate|to|\/|\|)\s*/i).filter(Boolean);
  if (parts.length > 1) {
    const values = parts.map(parseSingleMoney).filter((v) => v > 0);
    if (values.length > 0) return Math.max(...values);
  }
  return parseSingleMoney(s);
}

export const Route = createFileRoute("/api/public/leads")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: config } = await supabaseAdmin
          .from("webhook_settings")
          .select("secret")
          .eq("key", "leads")
          .maybeSingle();
        if (!config) return jsonResponse(500, { error: "Webhook not configured" });
        const provided = request.headers.get("x-webhook-secret") ?? "";
        if (provided !== config.secret) return jsonResponse(401, { error: "Unauthorized" });

        let raw: unknown;
        try {
          raw = await request.json();
        } catch {
          return jsonResponse(400, { error: "Invalid JSON body" });
        }

        const parsed = bodySchema.safeParse(raw);
        if (!parsed.success) {
          return jsonResponse(400, { error: "Invalid payload", details: parsed.error.flatten() });
        }
        const d = parsed.data;

        const budgetNum = parseMoney(d.monthly_budget);

        const { data: inserted, error } = await supabaseAdmin
          .from("leads")
          .insert({
            name: d.name,
            company: d.company || null,
            contact: d.role || null,
            email: d.email || null,
            phone: d.phone || null,
            value: budgetNum,
            stage: "lead",
            source: d.source || "site",
            source_form: d.source_form || "site",
            responsible: null,
            notes: d.notes || null,
            tags: [] as never,
            extra: {
              role: d.role || null,
              vertical: d.industry || null,
              budget: budgetNum || null,
              urgency: d.urgency || null,
              experience: d.agency_experience || null,
              history: [
                {
                  id: crypto.randomUUID(),
                  type: "created",
                  text: `Lead recebido via webhook (${d.source_form || d.source || "site"})`,
                  createdAt: Date.now(),
                },
              ],
            } as never,
          } as never)
          .select("id")
          .single();

        if (error) {
          console.error("[leads webhook] insert failed", error);
          return jsonResponse(500, { error: "Could not save lead" });
        }

        return jsonResponse(201, { ok: true, id: inserted.id });
      },
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Secret",
          },
        }),
    },
  },
});
