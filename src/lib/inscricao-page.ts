import type { Campaign } from "@/components/VincularCampanhaDialog";

/**
 * Página de Inscrição — configuração pública de como o influenciador vê e
 * se candidata a uma campanha, em `/inscricao/:token`. Vive dentro de
 * `Campaign.inscricaoPage` (JSONB, sem migration). `dos`/`donts` ficam
 * direto na `Campaign` (não aqui) — são conteúdo da campanha, reaproveitável
 * fora da página pública (curadoria, briefing, portal); a página só decide
 * SE mostra (`showDos`/`showDonts`).
 */

export type InscricaoPageStatus = "RASCUNHO" | "PUBLICADA" | "ENCERRADA";

export const INSCRICAO_STATUS_LABEL: Record<InscricaoPageStatus, string> = {
  RASCUNHO: "Rascunho",
  PUBLICADA: "Publicada",
  ENCERRADA: "Encerrada",
};

/** nome/telefone/email são sempre obrigatórios e visíveis — são os únicos
 * usados pelo fluxo de inscrição existente, nunca ficam de fora daqui. */
export type InscricaoFieldKey = "nicho" | "redes" | "mensagem" | "midiaKit";

export const INSCRICAO_FIELD_LABEL: Record<InscricaoFieldKey, string> = {
  nicho: "Nicho",
  redes: "Redes sociais",
  mensagem: "Mensagem",
  midiaKit: "Mídia kit",
};

export type InscricaoFieldConfig = { visible: boolean; required: boolean };

export type CustomQuestionType =
  | "texto_curto"
  | "texto_longo"
  | "numero"
  | "sim_nao"
  | "selecao_unica"
  | "selecao_multipla"
  | "data";

export const CUSTOM_QUESTION_TYPE_LABEL: Record<CustomQuestionType, string> = {
  texto_curto: "Texto curto",
  texto_longo: "Texto longo",
  numero: "Número",
  sim_nao: "Sim/Não",
  selecao_unica: "Seleção única",
  selecao_multipla: "Múltipla seleção",
  data: "Data",
};

export type CustomQuestion = {
  id: string;
  label: string;
  type: CustomQuestionType;
  /** Só usado por selecao_unica/selecao_multipla. */
  options?: string[];
  required: boolean;
};

export type InscricaoSobre = {
  objetivo?: string;
  regioes?: string;
  periodo?: string;
  infoImportante?: string;
  requisitos?: string;
  tipoConteudo?: string;
  publicoDesejado?: string;
};

export type InscricaoPageConfig = {
  /** Ausente = tratado como "PUBLICADA" (compatibilidade — todo link
   * existente hoje sempre aceitou inscrição). */
  status?: InscricaoPageStatus;
  publicTitle?: string;
  publicSubtitle?: string;
  bannerUrl?: string;
  /** "Apresentação" — texto público, independente do briefing interno. */
  description?: string;
  sobre?: InscricaoSobre;
  showDos?: boolean;
  showDonts?: boolean;
  /** Alguns clientes só são revelados depois de fechado — controla se o
   * nome do cliente (`Cliente.empresa`) aparece na página pública. Default
   * true (comportamento atual). */
  showClientName?: boolean;
  /** Mesma lógica pro nome real da campanha: só entra em jogo quando
   * `publicTitle` está vazio (aí o título cai pro nome real, ver
   * `getEffectiveInscricaoPage`) — se o time já escreveu um título
   * público próprio, esse título sempre prevalece, independente disto. */
  showCampaignName?: boolean;
  fields?: Partial<Record<InscricaoFieldKey, InscricaoFieldConfig>>;
  customQuestions?: CustomQuestion[];
  thankYouMessage?: string;
  /** Só relevante pra campanhas recorrentes (`Campaign.pagClienteTipo
   * === "Recorrente"`) — o link de inscrição é reaproveitado mês após
   * mês, então cada submissão precisa dizer pra qual ciclo (`"YYYY-MM"`)
   * ela é, em vez de cair no mês corrente só pelo timing de quando
   * alguém preencheu o formulário. Ver `submitInscricaoCampanha`. */
  mesReferencia?: string;
};

export const ANONYMOUS_CAMPAIGN_TITLE = "Oportunidade de parceria";

export type EffectiveInscricaoPage = {
  status: InscricaoPageStatus;
  publicTitle: string;
  publicSubtitle: string;
  bannerUrl?: string;
  description: string;
  sobre: InscricaoSobre;
  dos: string[];
  donts: string[];
  showDos: boolean;
  showDonts: boolean;
  showClientName: boolean;
  fields: Record<InscricaoFieldKey, InscricaoFieldConfig>;
  customQuestions: CustomQuestion[];
  thankYouMessage: string;
  mesReferencia: string;
};

function currentMesReferencia(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export const DEFAULT_THANK_YOU_MESSAGE =
  "Inscrição recebida. Nossa equipe analisará seu perfil e, caso haja interesse, entraremos em contato.";

const DEFAULT_FIELDS: Record<InscricaoFieldKey, InscricaoFieldConfig> = {
  nicho: { visible: true, required: false },
  redes: { visible: true, required: false },
  mensagem: { visible: true, required: false },
  midiaKit: { visible: true, required: false },
};

/**
 * Única fonte de verdade sobre o que a Página de Inscrição mostra —
 * aplica os defaults de compatibilidade pra campanhas sem `inscricaoPage`
 * configurado (ou parcialmente configurado). Usada tanto pelo editor
 * interno quanto pela rota pública, nunca duplicada.
 */
export function getEffectiveInscricaoPage(campaign: Campaign): EffectiveInscricaoPage {
  const cfg = campaign.inscricaoPage;
  const fallbackTitle = cfg?.showCampaignName === false ? ANONYMOUS_CAMPAIGN_TITLE : campaign.nome;
  return {
    status: cfg?.status ?? "PUBLICADA",
    publicTitle: cfg?.publicTitle?.trim() || fallbackTitle,
    publicSubtitle: cfg?.publicSubtitle ?? "",
    bannerUrl: cfg?.bannerUrl,
    description: cfg?.description?.trim() || campaign.briefing || "",
    sobre: cfg?.sobre ?? {},
    dos: campaign.dos ?? [],
    donts: campaign.donts ?? [],
    showDos: cfg?.showDos ?? true,
    showDonts: cfg?.showDonts ?? true,
    showClientName: cfg?.showClientName ?? true,
    fields: {
      nicho: { ...DEFAULT_FIELDS.nicho, ...cfg?.fields?.nicho },
      redes: { ...DEFAULT_FIELDS.redes, ...cfg?.fields?.redes },
      mensagem: { ...DEFAULT_FIELDS.mensagem, ...cfg?.fields?.mensagem },
      midiaKit: { ...DEFAULT_FIELDS.midiaKit, ...cfg?.fields?.midiaKit },
    },
    customQuestions: cfg?.customQuestions ?? [],
    thankYouMessage: cfg?.thankYouMessage?.trim() || DEFAULT_THANK_YOU_MESSAGE,
    mesReferencia: cfg?.mesReferencia || currentMesReferencia(),
  };
}

export function newCustomQuestion(): CustomQuestion {
  return { id: crypto.randomUUID(), label: "", type: "texto_curto", required: false };
}

/** Opções de mês (`"YYYY-MM"` + rótulo em pt-BR) pra campanhas
 * recorrentes — de `recorrenteInicio` (ou 12 meses atrás, se não
 * setado) até 6 meses à frente. Única fonte dessa lista: usada tanto
 * pelo filtro de mês do kanban (`CampanhasSection.tsx`) quanto pelo
 * seletor de "Mês de referência" da Página de Inscrição, pra nunca
 * divergir entre os dois. */
export function buildMesReferenciaOptions(
  recorrenteInicio?: string,
): { value: string; label: string }[] {
  const now = new Date();
  const opts: { value: string; label: string }[] = [];
  const start = recorrenteInicio
    ? new Date(recorrenteInicio + "T00:00:00")
    : new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 6, 1);
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cur <= end) {
    const value = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}`;
    const label = cur.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
    opts.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
    cur.setMonth(cur.getMonth() + 1);
  }
  return opts;
}
