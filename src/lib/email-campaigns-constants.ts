/**
 * Constantes compartilhadas da área de e-mail (Campanhas/Templates) —
 * usadas tanto pela UI quanto pela rota do cron
 * (src/routes/api/cron/email-flows.ts). Mudar um valor aqui sem
 * espelhar nos CHECKs da migração (20260826210000_email_campaigns_v2.sql)
 * quebra a validação — os dois lados precisam ficar em sincronia.
 */

export const CAMPAIGN_OBJETIVOS = [
  "prospeccao",
  "convite",
  "followup",
  "comunicacao",
  "relacionamento",
  "outro",
] as const;
export type CampaignObjetivo = (typeof CAMPAIGN_OBJETIVOS)[number];

export const CAMPAIGN_OBJETIVO_LABEL: Record<CampaignObjetivo, string> = {
  prospeccao: "Prospecção",
  convite: "Convite",
  followup: "Follow-up",
  comunicacao: "Comunicação",
  relacionamento: "Relacionamento",
  outro: "Outro",
};

export const CAMPAIGN_STATUSES = [
  "rascunho",
  "pronta",
  "agendada",
  "ativa",
  "pausada",
  "concluida",
  "erro",
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABEL: Record<CampaignStatus, string> = {
  rascunho: "Rascunho",
  pronta: "Pronta para ativar",
  agendada: "Agendada",
  ativa: "Ativa",
  pausada: "Pausada",
  concluida: "Concluída",
  erro: "Com erro",
};

export const CAMPAIGN_STATUS_TONE: Record<CampaignStatus, string> = {
  rascunho: "bg-muted text-muted-foreground",
  pronta: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  agendada: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  ativa: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pausada: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  concluida: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  erro: "bg-destructive/10 text-destructive",
};

export const RECIPIENT_RULES = ["todos", "nao_abriu", "nao_respondeu"] as const;
export type RecipientRule = (typeof RECIPIENT_RULES)[number];
export const RECIPIENT_RULE_LABEL: Record<RecipientRule, string> = {
  todos: "Todos os destinatários ativos",
  nao_abriu: "Apenas quem ainda não abriu os e-mails anteriores",
  nao_respondeu: "Apenas quem ainda não respondeu",
};

export const SEND_MODES = ["imediato", "agendado", "apos_anterior"] as const;
export type SendMode = (typeof SEND_MODES)[number];
export const SEND_MODE_LABEL: Record<SendMode, string> = {
  imediato: "Assim que a campanha for ativada",
  agendado: "Em uma data e hora específicas",
  apos_anterior: "Logo depois da etapa anterior",
};

export const RECIPIENT_SOURCES = ["banco_influenciador", "lead", "cliente", "manual"] as const;
export type RecipientSource = (typeof RECIPIENT_SOURCES)[number];
export const RECIPIENT_SOURCE_LABEL: Record<RecipientSource, string> = {
  banco_influenciador: "Banco de Influenciadores",
  lead: "Leads (Comercial)",
  cliente: "Clientes",
  manual: "Adicionado manualmente",
};

export const RECIPIENT_STATUS_LABEL: Record<string, string> = {
  active: "Na sequência",
  completed: "Concluído",
  cancelled: "Cancelado",
  responded: "Respondeu",
  unsubscribed: "Descadastrado",
};

/** Tokens disponíveis no editor de e-mail/template — clicar insere
 * `{{token}}` no assunto/corpo. Genéricos porque o público agora é uma
 * lista de contato livre (não mais um tipo de entidade de CRM). */
export const EMAIL_TEMPLATE_TOKENS = [
  { token: "nome", label: "Nome do contato" },
  { token: "email", label: "E-mail do contato" },
] as const;
