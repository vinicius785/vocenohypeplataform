/**
 * Dados da Política de Privacidade pública que NÃO podem ser deduzidos do código.
 * `null` = ainda não fornecido: a página mostra um marcador visível "[A PREENCHER: …]"
 * (nunca um valor inventado) e `PRIVACY_POLICY_PENDING` lista o que falta. Preencher AQUI
 * antes da publicação definitiva e atualizar `PRIVACY_POLICY_UPDATED_AT` quando o texto mudar.
 */
export const PRIVACY_POLICY_URL_PATH = "/politica-de-privacidade";
export const PRIVACY_POLICY_UPDATED_AT = "2026-10-09";
export const TERMS_PATH = "/termos-de-servico";
export const DELETION_PATH = "/exclusao-de-dados";
export const TERMS_UPDATED_AT = "2026-10-09";
/** Foro da cláusula de lei aplicável dos Termos: decisão jurídica da empresa, não deduzida do código. */
export const TERMS_FORO: string | null = "da Comarca de São Paulo, Estado de São Paulo";

export const PRIVACY_CONTROLLER: {
  razaoSocial: string | null;
  nomeComercial: string;
  cnpj: string | null;
  endereco: string | null;
  telefone: string | null;
  /** E-mail (ou formulário) de privacidade monitorado: nunca preencher sem confirmar que existe. */
  canalPrivacidade: string | null;
  /** Nome/cargo do encarregado (LGPD art. 41), se a empresa indicar um; opcional. */
  encarregado: string | null;
} = {
  // Fonte: ficha cadastral do CNPJ (consulta de 09/10/2026), situação Ativa.
  razaoSocial: "VOCE NO HYPE MARKETING E ENTRETENIMENTO LTDA",
  nomeComercial: "Você no Hype",
  cnpj: "43.442.408/0001-26",
  endereco: "R. Joaquim Floriano, 243, conjunto 71, Itaim Bibi, São Paulo/SP, CEP 04534-010",
  telefone: "(11) 3834-5221",
  canalPrivacidade: "contato@vocenohype.com.br",
  encarregado: null,
};

export const PRIVACY_POLICY_PENDING: string[] = (
  [
    ["Razão social", PRIVACY_CONTROLLER.razaoSocial],
    ["CNPJ", PRIVACY_CONTROLLER.cnpj],
    ["Canal de contato para privacidade", PRIVACY_CONTROLLER.canalPrivacidade],
  ] as const
)
  .filter(([, v]) => !v)
  .map(([k]) => k);
