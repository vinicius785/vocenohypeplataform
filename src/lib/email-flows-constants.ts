/**
 * Constantes compartilhadas do motor de automação de e-mail — usadas
 * tanto pela UI (picker de audiência/gatilho, editor de template) quanto
 * pelos triggers de banco (migração 20260826200000_email_flows.sql, que
 * usa os MESMOS valores de `trigger_type`/config em SQL) e pela rota do
 * cron. Mudar um `type`/`token` aqui sem espelhar na migração quebra o
 * casamento gatilho↔fluxo — os dois lados precisam ficar em sincronia.
 */

export const EMAIL_AUDIENCES = ["lead", "cliente", "influenciador"] as const;
export type EmailAudience = (typeof EMAIL_AUDIENCES)[number];

export const EMAIL_AUDIENCE_LABEL: Record<EmailAudience, string> = {
  lead: "Leads (Comercial)",
  cliente: "Clientes",
  influenciador: "Influenciadores",
};

/** Tokens disponíveis por audiência — atalho no editor de template
 * (clicar insere `{{token}}` no assunto/corpo). */
export const EMAIL_TEMPLATE_TOKENS: Record<EmailAudience, { token: string; label: string }[]> = {
  lead: [
    { token: "nome", label: "Nome do lead" },
    { token: "empresa", label: "Empresa" },
    { token: "responsavel", label: "Responsável interno" },
  ],
  cliente: [
    { token: "nome", label: "Nome/empresa do cliente" },
    { token: "responsavel", label: "Responsável interno" },
  ],
  influenciador: [{ token: "nome", label: "Nome do influenciador" }],
};

export type EmailTriggerConfigKind = "stage" | "tag" | "status" | null;

export type EmailTriggerTypeDef = {
  type: string;
  label: string;
  /** Se não-nulo, o gatilho precisa de um valor extra em `trigger_config`
   * (ex. qual etapa, qual tag, qual status) — a UI mostra o seletor
   * certo pra essa chave. */
  needsConfig: EmailTriggerConfigKind;
  kind: "evento" | "agendado";
  hint: string;
};

/** Gatilhos disponíveis por audiência — precisa bater exatamente com os
 * `trigger_type` tratados pelas funções de trigger em SQL
 * (email_flows_leads_trigger/clientes_trigger/influenciadores_trigger). */
export const EMAIL_TRIGGER_TYPES: Record<EmailAudience, EmailTriggerTypeDef[]> = {
  lead: [
    {
      type: "lead_created",
      label: "Lead é criado",
      needsConfig: null,
      kind: "evento",
      hint: "Dispara assim que um lead novo entra (manual ou pelo formulário público).",
    },
    {
      type: "stage_entered",
      label: "Lead entra na etapa",
      needsConfig: "stage",
      kind: "evento",
      hint: "Dispara quando o lead muda pra essa etapa. Cancela sozinho se ele mudar de etapa de novo.",
    },
    {
      type: "tag_added",
      label: "Tag é adicionada",
      needsConfig: "tag",
      kind: "evento",
      hint: "Dispara quando essa tag entra na lista de tags do lead.",
    },
  ],
  cliente: [
    {
      type: "cliente_created",
      label: "Cliente é criado",
      needsConfig: null,
      kind: "evento",
      hint: "Dispara assim que um cliente novo é cadastrado.",
    },
  ],
  influenciador: [
    {
      type: "influenciador_status",
      label: "Influenciador muda de status",
      needsConfig: "status",
      kind: "evento",
      hint: "Dispara quando o status do influenciador (na campanha) vira esse. Cancela sozinho se mudar de novo.",
    },
  ],
};

export const OPPORTUNITY_STAGE_OPTIONS = [
  { value: "LEAD_RECEBIDO", label: "Lead recebido" },
  { value: "CONTATO_FEITO", label: "Contato feito" },
  { value: "REUNIAO_AGENDADA", label: "Reunião agendada" },
  { value: "REUNIAO_REALIZADA", label: "Reunião realizada" },
  { value: "PROPOSTA_PREPARO", label: "Proposta em preparo" },
  { value: "PROPOSTA_ENVIADA", label: "Proposta enviada" },
  { value: "NEGOCIACAO", label: "Negociação" },
  { value: "GANHO", label: "Ganho" },
  { value: "PERDIDO", label: "Perdido" },
] as const;

export const INFLU_STATUS_OPTIONS = [
  { value: "INSCRITO", label: "Inscrito" },
  { value: "EM_CURADORIA", label: "Em curadoria" },
  { value: "ENVIADO_AO_CLIENTE", label: "Enviado ao cliente" },
  { value: "APROVADO", label: "Aprovado" },
  { value: "RECUSADO", label: "Recusado" },
] as const;

export type EmailFlowStep = { templateId: string; waitDays: number };
