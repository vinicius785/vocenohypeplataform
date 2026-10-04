/**
 * Validação do formulário PÚBLICO de inscrição, no cliente e por campo. Mesmas regras de antes
 * (nome/telefone/e-mail sempre obrigatórios; nicho/redes/mensagem/mídia kit e perguntas conforme
 * a configuração da página) — só que agora cada falha vira uma mensagem específica no campo, em
 * vez de o envio ser descartado em silêncio. O servidor continua validando tudo por conta própria.
 */
export type FieldRule = { visible: boolean; required: boolean };

export type InscricaoRules = {
  fields: { nicho: FieldRule; redes: FieldRule; mensagem: FieldRule; midiaKit: FieldRule };
  customQuestions: { id: string; label: string; required?: boolean }[];
};

export type InscricaoValues = {
  nome: string;
  telefone: string;
  email: string;
  nicho: string;
  redesComHandle: number;
  mensagem: string;
  temAnexo: boolean;
  respostas: Record<string, string | string[] | undefined>;
};

export type InscricaoErrors = Partial<Record<string, string>>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateInscricao(v: InscricaoValues, rules: InscricaoRules): InscricaoErrors {
  const e: InscricaoErrors = {};
  if (!v.nome.trim()) e.nome = "Informe seu nome completo.";
  const digits = v.telefone.replace(/\D/g, "");
  if (!v.telefone.trim()) e.telefone = "Informe seu telefone com DDD. Ex.: (21) 99999-9999.";
  else if (digits.length < 8) e.telefone = "Confira o telefone: informe o número com DDD.";
  if (!v.email.trim()) e.email = "Informe seu e-mail.";
  else if (!EMAIL_RE.test(v.email.trim()))
    e.email = "Esse e-mail não parece válido. Ex.: nome@email.com.";
  const f = rules.fields;
  if (f.nicho.visible && f.nicho.required && !v.nicho)
    e.nicho = "Escolha o nicho em que você atua.";
  if (f.redes.visible && f.redes.required && v.redesComHandle === 0)
    e.redes = "Adicione pelo menos uma rede social com seu usuário ou link.";
  if (f.mensagem.visible && f.mensagem.required && !v.mensagem.trim())
    e.mensagem = "Escreva uma mensagem para a equipe.";
  if (f.midiaKit.visible && f.midiaKit.required && !v.temAnexo)
    e.anexo = "Anexe o seu mídia kit (PDF ou imagem).";
  for (const q of rules.customQuestions) {
    const a = v.respostas[q.id];
    const empty = a === undefined || a === "" || (Array.isArray(a) && a.length === 0);
    if (q.required && empty) e[`q:${q.id}`] = `Responda: ${q.label}`;
  }
  return e;
}

export type StepId = "dados" | "redes" | "proposta" | "materiais";
export type Step = { id: StepId; label: string; done: boolean };

/** Etapas visíveis da página + se cada uma já está completa (nada obrigatório faltando). */
export function inscricaoSteps(v: InscricaoValues, rules: InscricaoRules): Step[] {
  const errors = validateInscricao(v, rules);
  const has = (...keys: string[]) => keys.some((k) => errors[k]);
  const steps: Step[] = [
    { id: "dados", label: "Seus dados", done: !has("nome", "telefone", "email", "nicho") },
  ];
  if (rules.fields.redes.visible)
    steps.push({ id: "redes", label: "Redes sociais", done: !has("redes") });
  const hasProposta = rules.customQuestions.length > 0 || rules.fields.mensagem.visible;
  if (hasProposta) {
    const qKeys = rules.customQuestions.map((q) => `q:${q.id}`);
    steps.push({ id: "proposta", label: "Proposta", done: !has("mensagem", ...qKeys) });
  }
  if (rules.fields.midiaKit.visible)
    steps.push({ id: "materiais", label: "Materiais", done: !has("anexo") });
  return steps;
}

export const ANEXO_ACEITOS = {
  mimes: ["application/pdf", "image/jpeg", "image/png", "image/webp"],
  label: "PDF, JPG, PNG ou WebP",
  maxBytes: 5.5 * 1024 * 1024,
  maxLabel: "5 MB",
} as const;

/** `null` = arquivo aceito; senão a mensagem específica. O servidor só aceita estes formatos. */
export function validateAnexoFile(file: { type: string; size: number }): string | null {
  if (!(ANEXO_ACEITOS.mimes as readonly string[]).includes(file.type))
    return `Formato não aceito. Envie ${ANEXO_ACEITOS.label}.`;
  if (file.size > ANEXO_ACEITOS.maxBytes)
    return `Este arquivo tem ${(file.size / (1024 * 1024)).toFixed(1)} MB — o limite é ${ANEXO_ACEITOS.maxLabel}. Envie uma versão menor.`;
  return null;
}
