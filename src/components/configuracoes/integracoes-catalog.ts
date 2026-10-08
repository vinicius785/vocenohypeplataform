/**
 * Catálogo de Integrações — só o que EXISTE hoje (nenhuma integração fictícia). Separa o CATÁLOGO
 * (descobrir: nome, categoria, estado) da CONFIGURAÇÃO (abre ao selecionar). Puro: sem UI.
 */

export type IntegrationId = "google-agenda" | "webhook-leads" | "webhooks-saida";
export type IntegrationCategory = "Calendário" | "Automação";

export type IntegrationDef = {
  id: IntegrationId;
  name: string;
  category: IntegrationCategory;
  /** Uma linha — o card não explica, só identifica. */
  summary: string;
  /** Texto do detalhe (a explicação completa). */
  description: string;
  /** Termos extras que a busca reconhece (ferramentas citadas na descrição). */
  keywords: string[];
  adminOnly: boolean;
};

export const INTEGRATIONS: IntegrationDef[] = [
  {
    id: "google-agenda",
    name: "Google Agenda",
    category: "Calendário",
    summary: "Sincronize suas reuniões nos dois sentidos.",
    description:
      "Reuniões que você cria na plataforma aparecem no seu Google Agenda, e eventos criados direto no Google aparecem aqui — nos dois sentidos, em poucos minutos. Cada pessoa conecta a própria conta.",
    keywords: ["google", "agenda", "calendario", "reunioes", "eventos", "oauth"],
    adminOnly: false,
  },
  {
    id: "webhook-leads",
    name: "Webhook de leads",
    category: "Automação",
    summary: "Receba leads de formulários e ferramentas externas.",
    description:
      'Cole o endpoint em formulários externos (Typeform, Make, Zapier, site institucional) para criar leads automaticamente na aba Comercial, na coluna "Lead".',
    keywords: ["webhook", "entrada", "typeform", "make", "zapier", "formulario", "leads", "api"],
    adminOnly: true,
  },
  {
    id: "webhooks-saida",
    name: "Webhooks de saída",
    category: "Automação",
    summary: "Avise ferramentas externas quando algo acontece.",
    description:
      "Envie um POST para uma URL externa (Zapier, Make, n8n...) sempre que um evento acontecer aqui dentro, como um novo lead ou um lead ganho.",
    keywords: ["webhook", "saida", "zapier", "make", "n8n", "slack", "eventos", "post"],
    adminOnly: true,
  },
];

export function integrationCategories(list: readonly IntegrationDef[]): IntegrationCategory[] {
  return [...new Set(list.map((i) => i.category))];
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Busca por nome, categoria, descrição e palavras-chave (sem acento/caixa) + filtro de categoria. */
export function filterIntegrations(
  list: readonly IntegrationDef[],
  query: string,
  category: IntegrationCategory | "todas",
): IntegrationDef[] {
  const q = norm(query.trim());
  return list.filter((i) => {
    if (category !== "todas" && i.category !== category) return false;
    if (!q) return true;
    const hay = norm([i.name, i.category, i.summary, i.description, ...i.keywords].join(" "));
    return hay.includes(q);
  });
}

export type CardState = { label: string; tone: "ok" | "warn" | "off" | "muted" };

/** Estado mostrado no card (curto). `undefined` = ainda carregando (não mostra nada). */
export function integrationCardState(
  id: IntegrationId,
  ctx: {
    isAdmin: boolean | null;
    google: "loading" | "connected" | "attention" | "disconnected";
    outgoingActive: number | null;
  },
): CardState | undefined {
  const def = INTEGRATIONS.find((i) => i.id === id)!;
  if (def.adminOnly && ctx.isAdmin === false)
    return { label: "Somente administradores", tone: "muted" };
  if (id === "google-agenda") {
    if (ctx.google === "loading") return undefined;
    if (ctx.google === "connected") return { label: "Conectado", tone: "ok" };
    if (ctx.google === "attention") return { label: "Atenção necessária", tone: "warn" };
    return { label: "Não conectado", tone: "off" };
  }
  if (id === "webhooks-saida") {
    if (ctx.isAdmin === null || ctx.outgoingActive === null) return undefined;
    return ctx.outgoingActive > 0
      ? {
          label: `${ctx.outgoingActive} ${ctx.outgoingActive === 1 ? "ativo" : "ativos"}`,
          tone: "ok",
        }
      : { label: "Nenhum webhook", tone: "off" };
  }
  if (ctx.isAdmin === null) return undefined;
  return { label: "Disponível", tone: "off" };
}
