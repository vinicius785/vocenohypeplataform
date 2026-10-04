/**
 * Pré-carga EM LOTE do cron de sequências de e-mail (`api/cron/email-flows`).
 *
 * Antes, o laço por destinatário fazia 4 consultas por pessoa (status da
 * campanha, descadastro, etapas da campanha e envios anteriores) — até 200
 * idas ao banco por execução (lote de 50). Aqui as mesmas 4 leituras viram 4
 * consultas no total, antes de qualquer envio; o laço só consulta mapas.
 *
 * Equivalência com o comportamento anterior:
 *  - status da campanha / descadastro / etapas: mesmos filtros, só com `in()`;
 *  - "envios anteriores" só servia para a regra `nao_abriu` ("algum envio
 *    deste destinatário foi aberto?"), então basta saber QUEM tem envio aberto;
 *  - o PostgREST corta respostas em 1000 linhas sem avisar: etapas e envios
 *    são lidos por páginas, para nunca decidir com dados truncados;
 *  - qualquer erro de leitura LANÇA (o cron responde 500 antes de qualquer
 *    escrita/envio e a fila fica intacta para a próxima execução) — antes, um
 *    erro de leitura virava "etapa removida" (cancelava o destinatário) ou
 *    "não descadastrado" (seguia para o envio).
 *
 * `.server.ts` e cliente injetado: não importa o `supabaseAdmin` aqui.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;
type StepRow = Database["public"]["Tables"]["email_campaign_steps"]["Row"];

/** Só o que a pré-carga precisa de cada destinatário vencido. */
export type DueRecipient = { id: string; campaign_id: string; email: string };

export type EmailRunContext = {
  /** `status` de cada campanha envolvida (ausente = campanha não existe). */
  campaignStatus: Map<string, string>;
  /** E-mails (exatos, como em `.eq`) que estão em `email_unsubscribes`. */
  unsubscribedEmails: Set<string>;
  /** Etapas de cada campanha, já em ordem crescente de `position`. */
  stepsByCampaign: Map<string, StepRow[]>;
  /** Destinatários que têm ao menos um envio com `opened_at`. */
  openedRecipientIds: Set<string>;
};

/** Limite padrão de linhas por resposta do PostgREST. */
const PAGE_SIZE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const chunk = data ?? [];
    rows.push(...chunk);
    if (chunk.length < PAGE_SIZE) return rows;
  }
}

export async function loadEmailRunContext(
  admin: Admin,
  due: DueRecipient[],
): Promise<EmailRunContext> {
  const ctx: EmailRunContext = {
    campaignStatus: new Map(),
    unsubscribedEmails: new Set(),
    stepsByCampaign: new Map(),
    openedRecipientIds: new Set(),
  };
  if (due.length === 0) return ctx;

  const campaignIds = [...new Set(due.map((r) => r.campaign_id))];
  const emails = [...new Set(due.map((r) => r.email))];
  const recipientIds = due.map((r) => r.id);

  const [campaigns, unsubs, steps, opened] = await Promise.all([
    // No máximo uma linha por campanha / e-mail: cabe numa resposta só.
    admin.from("email_campaigns").select("id, status").in("id", campaignIds),
    admin.from("email_unsubscribes").select("email").in("email", emails),
    readAllPages<StepRow>((from, to) =>
      admin
        .from("email_campaign_steps")
        .select("*")
        .in("campaign_id", campaignIds)
        .order("campaign_id", { ascending: true })
        .order("position", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
    ),
    readAllPages<{ recipient_id: string | null }>((from, to) =>
      admin
        .from("email_sends")
        .select("id, recipient_id")
        .in("recipient_id", recipientIds)
        .not("opened_at", "is", null)
        .order("id", { ascending: true })
        .range(from, to),
    ),
  ]);

  if (campaigns.error) throw new Error(campaigns.error.message);
  if (unsubs.error) throw new Error(unsubs.error.message);

  for (const c of campaigns.data ?? []) ctx.campaignStatus.set(c.id, c.status);
  for (const u of unsubs.data ?? []) ctx.unsubscribedEmails.add(u.email);
  for (const s of steps) {
    const list = ctx.stepsByCampaign.get(s.campaign_id);
    if (list) list.push(s);
    else ctx.stepsByCampaign.set(s.campaign_id, [s]);
  }
  for (const s of opened) if (s.recipient_id) ctx.openedRecipientIds.add(s.recipient_id);

  return ctx;
}
