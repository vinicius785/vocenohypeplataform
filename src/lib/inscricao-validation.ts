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
export type Step = {
  id: StepId;
  label: string;
  /** Concluída = obrigatórios válidos E, quando a etapa só tem campos opcionais, algo foi de fato
   * preenchido. Nunca depende de scroll, foco ou posição na página. */
  done: boolean;
  /** A etapa tem ao menos um campo obrigatório nesta página. */
  required: boolean;
  /** Chaves de campo da etapa, na ordem em que aparecem (`nome`, `redes`, `q:<id>`, `anexo`…). */
  fieldKeys: string[];
  /** Há erro de validação (campo obrigatório vazio/inválido) nesta etapa. */
  hasError: boolean;
};

/**
 * ÚNICA fonte de verdade do andamento da inscrição: etapas visíveis, se cada uma está concluída, o
 * que falta, o percentual e se o envio está liberado. A barra fixa, os selos "concluída" das
 * etapas, o botão e o "Faltam" leem SÓ daqui — e a validação por campo é a mesma
 * `validateInscricao` (nenhuma regra paralela).
 */
export type InscricaoProgress = {
  steps: Step[];
  errors: InscricaoErrors;
  doneCount: number;
  total: number;
  percent: number;
  missing: Step[];
  /** Algum campo obrigatório pendente/inválido → "Enviar" não é liberado. */
  hasRequiredPending: boolean;
  /** Todas as etapas concluídas (inclusive as opcionais preenchidas). */
  allDone: boolean;
  /** Primeiro campo obrigatório pendente, na ordem VISUAL das etapas (para "Revisar"). */
  firstRequiredKey: string | null;
};

const answered = (a: string | string[] | undefined) =>
  !(a === undefined || a === "" || (Array.isArray(a) && a.length === 0));

export function inscricaoProgress(v: InscricaoValues, rules: InscricaoRules): InscricaoProgress {
  const errors = validateInscricao(v, rules);
  const f = rules.fields;
  const qKeys = rules.customQuestions.map((q) => `q:${q.id}`);
  const anyAnswered = rules.customQuestions.some((q) => answered(v.respostas[q.id]));

  const make = (
    id: StepId,
    label: string,
    fieldKeys: string[],
    required: boolean,
    anyFilled: boolean,
  ): Step => {
    const hasError = fieldKeys.some((k) => errors[k]);
    return {
      id,
      label,
      fieldKeys,
      required,
      hasError,
      done: !hasError && (required || anyFilled),
    };
  };

  const steps: Step[] = [
    // Nome, telefone e e-mail são sempre obrigatórios.
    make("dados", "Seus dados", ["nome", "telefone", "email", "nicho"], true, true),
  ];
  if (f.redes.visible) {
    steps.push(make("redes", "Redes sociais", ["redes"], f.redes.required, v.redesComHandle > 0));
  }
  if (rules.customQuestions.length > 0 || f.mensagem.visible) {
    const proposalRequired =
      (f.mensagem.visible && f.mensagem.required) || rules.customQuestions.some((q) => q.required);
    steps.push(
      make(
        "proposta",
        "Sua proposta",
        [...(f.mensagem.visible ? ["mensagem"] : []), ...qKeys],
        proposalRequired,
        (f.mensagem.visible && !!v.mensagem.trim()) || anyAnswered,
      ),
    );
  }
  if (f.midiaKit.visible) {
    steps.push(make("materiais", "Materiais", ["anexo"], f.midiaKit.required, v.temAnexo));
  }

  // O nome da etapa "Seus dados" depende só de campos sempre presentes; a de dados nunca é "opcional".
  const missing = steps.filter((s) => !s.done);
  const doneCount = steps.length - missing.length;
  const firstRequiredKey = steps.flatMap((s) => s.fieldKeys).find((k) => errors[k]) ?? null;
  return {
    steps,
    errors,
    doneCount,
    total: steps.length,
    percent: steps.length ? Math.round((doneCount / steps.length) * 100) : 0,
    missing,
    hasRequiredPending: Object.keys(errors).length > 0,
    allDone: missing.length === 0,
    firstRequiredKey,
  };
}

/** Compat: lista de etapas (mesma regra de conclusão de `inscricaoProgress`). */
export function inscricaoSteps(v: InscricaoValues, rules: InscricaoRules): Step[] {
  return inscricaoProgress(v, rules).steps;
}

/** "A", "A e B", "A, B e C". */
export function joinPtBr(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Textos da barra fixa a partir do andamento — um só lugar, para o texto nunca divergir do estado.
 * Etapas só-opcionais pendentes aparecem com "(opcional)" e não bloqueiam o envio. */
export function progressCopy(p: InscricaoProgress): {
  headline: string;
  percentText: string;
  missingText: string | null;
  readyText: string | null;
} {
  const names = p.missing.map((s) => (s.required ? s.label : `${s.label} (opcional)`));
  return {
    headline: `${p.doneCount} de ${p.total} concluídas`,
    percentText: `${p.percent}%`,
    missingText:
      p.missing.length === 0
        ? null
        : `${p.missing.length === 1 ? "Falta" : "Faltam"}: ${joinPtBr(names)}`,
    readyText: p.allDone ? "Tudo pronto para enviar" : null,
  };
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
