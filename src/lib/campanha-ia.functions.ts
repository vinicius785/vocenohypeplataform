import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const inputSchema = z.object({ campanhaId: z.string() });

type ReprovacaoInput = { nome: string; motivo: string };

const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_AI_MODEL = "google/gemini-2.5-flash";

/** Pede pra IA um resumo curto (o que os clientes andam reprovando, em
 * comum) + uma sugestão prática pro time — a partir só dos motivos de
 * reprovação já escritos pelo cliente no portal, sem inventar dado nenhum
 * fora disso. */
async function askAI(
  reprovacoes: ReprovacaoInput[],
): Promise<{ resumo: string; sugestao: string }> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "IA não configurada neste ambiente (falta LOVABLE_API_KEY). Isso é esperado em desenvolvimento local — funciona automaticamente quando publicado no Lovable Cloud.",
    );
  }

  const lista = reprovacoes.map((r, i) => `${i + 1}. ${r.nome}: "${r.motivo}"`).join("\n");

  const prompt = `Você é assistente de uma agência de marketing de influenciadores. Abaixo estão os motivos de reprovação que clientes escreveram ao recusar influenciadores selecionados para uma campanha:

${lista}

Responda em português do Brasil, em JSON estrito (sem markdown, sem texto fora do JSON), no formato:
{"resumo": "...", "sugestao": "..."}

"resumo": 2-3 frases resumindo os padrões/motivos em comum entre as reprovações (não repita a lista, sintetize).
"sugestao": 1-2 frases com uma sugestão prática e acionável pro time de curadoria, baseada só no que foi dito.`;

  const res = await fetch(LOVABLE_AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: LOVABLE_AI_MODEL,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (res.status === 429)
    throw new Error("Limite de uso da IA atingido — tente novamente em instantes.");
  if (res.status === 402) throw new Error("Créditos de IA esgotados no workspace.");
  if (!res.ok) throw new Error(`Falha ao consultar IA (${res.status}).`);

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = json.choices?.[0]?.message?.content?.trim() ?? "";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  let parsed: { resumo?: string; sugestao?: string };
  try {
    parsed = JSON.parse(cleaned) as { resumo?: string; sugestao?: string };
  } catch {
    throw new Error("A IA respondeu num formato inesperado. Tente gerar de novo.");
  }
  if (!parsed.resumo || !parsed.sugestao) {
    throw new Error("A IA não retornou resumo e sugestão. Tente gerar de novo.");
  }
  return { resumo: parsed.resumo, sugestao: parsed.sugestao };
}

export const gerarResumoReprovacoes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { campanhaId: string }) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("campanha_influenciadores")
      .select("id, data")
      .eq("campanha_id", data.campanhaId);
    if (error) throw new Error(error.message);

    type InfluRow = {
      id: string;
      data: { nome?: string; clienteReprovacao?: { motivo?: string } } | null;
    };
    const reprovados = ((rows ?? []) as InfluRow[]).filter(
      (r) => r.data?.clienteReprovacao?.motivo,
    );
    if (reprovados.length === 0) {
      throw new Error("Nenhum influenciador reprovado nesta campanha ainda.");
    }

    const reprovacoes: ReprovacaoInput[] = reprovados.map((r) => ({
      nome: r.data?.nome ?? "Influenciador",
      motivo: r.data!.clienteReprovacao!.motivo!,
    }));

    const { resumo, sugestao } = await askAI(reprovacoes);

    return {
      resumo,
      sugestao,
      geradoEm: new Date().toISOString(),
      baseadoEm: reprovados.map((r) => r.id),
    };
  });
