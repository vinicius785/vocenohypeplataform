/**
 * Contrato de influenciador (D4Sign) — Fases 2 e 2.1: mapeador e validadores PUROS.
 *
 * Sem rede, sem banco, sem D4Sign, sem UI. Referência: `docs/modules/contrato-influenciador-dicionario.md`
 * (fonte oficial: o DOCX "Contrato de Participação em Campanha"). Fluxo:
 *
 *   dados automáticos → `buildContratoDraft` (pré-preenche) → pessoa confere/completa →
 *   `evaluateContrato` (valida; devolve as pendências ou as variáveis finais do template).
 *
 * Regras que NÃO se negociam aqui: nada de cláusula jurídica inventada (o que o template não suporta
 * vira pendência de modelo `PMR-*` e bloqueia), dinheiro sempre em centavos inteiros, e "ausente" nunca
 * vira 0.
 */
import type { BankInflu } from "@/lib/banco-influs-store";
import type { Campaign } from "@/components/VincularCampanhaDialog";
import { normalizePagamento, type Entrega, type Influ } from "@/lib/influencer-model";
import {
  isValidPixKey,
  normalizeCep,
  normalizeDocumento,
  normalizeEmail,
  normalizeTelefoneBR,
  normalizeUf,
  type PixTipo,
} from "@/lib/documento-br";
import {
  formatCents,
  formatReaisCompact,
  parseMoneyCents,
  valorPorExtenso,
} from "@/lib/valor-extenso";

/* ------------------------------------------------------------------ */
/* Configuração do template                                             */
/* ------------------------------------------------------------------ */

/** v2 (Fase 2.1): multas, vigência e antecedência do briefing viram variáveis; `midia_paga_autorizada`
 * passa a `uso_midia_paga`; "sem exclusividade" é um valor válido; numeração das cláusulas corrigida. */
export const CONTRATO_TEMPLATE_VERSION = "2026-10-v2";

/** Decisão jurídica: sem exclusividade, o contrato DECLARA que não há exclusividade (nunca campo vazio
 * nem cláusula omitida). É o valor da variável `exclusividade_periodo` nesse caso. */
export const TEXTO_SEM_EXCLUSIVIDADE = "Não há exclusividade";

/** Valor padrão que o próprio template traz entre colchetes em "[30] dias úteis após o envio da NF". */
export const PRAZO_PAGAMENTO_PADRAO_DIAS = 30;

/** Valores INICIAIS dos parâmetros que o template trazia entre colchetes (`[100.000]`, `[365]`, `[7]`).
 * Só pré-preenchem o rascunho: o texto final usa sempre o que está no rascunho, nunca estes números. */
export const CONTRATO_DEFAULTS = {
  multaPublicacaoIrregular: "100.000",
  multaConfidencialidade: "100.000",
  vigenciaDiasAposEntregas: "365",
  briefingAntecedenciaDias: "7",
} as const;

/** Teto de sanidade de uma multa: R$ 99.999.999,99. */
const MULTA_MAX_CENTS = 9_999_999_999;

/* ------------------------------------------------------------------ */
/* Tipos                                                                */
/* ------------------------------------------------------------------ */

export type ContratoSource = {
  influ: Influ;
  /** Registro do Banco já casado com o `influ` (heurístico hoje); só fonte de endereço/e-mail/telefone. */
  banco?: BankInflu | null;
  campanha: Campaign;
  cliente: { empresa?: string; demoSessionId?: string };
  /** Permissão `influenciadores:bancario` (a checagem de verdade é no servidor, depois). */
  canReadBank: boolean;
};

export type ContratoEntregaRow = {
  entregaId: string;
  tipo: string;
  quantidade: string;
  formato: string;
  /** `YYYY-MM-DD` */
  data: string;
  /** `HH:MM` */
  horario: string;
  permanencia: string;
};

export type PagamentoForma = "" | "PIX" | "Transferência Bancária" | "Outro";

/** O que o diálogo edita (tudo como texto digitado). Campos somente leitura vêm da `ContratoSource`. */
export type ContratoDraft = {
  contratadoNome: string;
  contratadoDocumento: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  perfil: string;
  plataformas: string;
  email: string;
  telefone: string;
  anunciante: string;
  /** `YYYY-MM-DD` */
  periodoInicio: string;
  periodoFim: string;
  briefingReferencia: string;
  aprovacaoAntecedenciaDias: string;
  pagamentoForma: PagamentoForma;
  pagamentoDados: string;
  pagamentoPrazoDiasUteis: string;
  /** "nenhuma" é uma condição VÁLIDA do contrato (declara que não há exclusividade); "" = por confirmar. */
  exclusividadeModo: "" | "nenhuma" | "dias";
  exclusividadeDias: string;
  /** Multa por publicação irregular (cláusula 26), em R$ — texto digitado, ex.: "100.000". */
  multaPublicacaoIrregular: string;
  /** Multa por violação de confidencialidade (cláusula 34), em R$. */
  multaConfidencialidade: string;
  /** Vigência: dias após a realização de todas as entregas (cláusula 29). */
  vigenciaDiasAposEntregas: string;
  /** Antecedência mínima, em dias, com que a CONTRATANTE fornece o briefing (cláusula 20, item a). */
  briefingAntecedenciaDias: string;
  entregas: ContratoEntregaRow[];
  /** Peso (%) por grupo do Anexo I; chave = `anexoGroupKey`. */
  anexoPesos: Record<string, string>;
};

export type ContratoIssue = {
  /** `PMR-n` = pendência de modelo/regra (o contrato atual não suporta o caso). */
  code: string;
  field: string;
  message: string;
  /** Linha da tabela de entregas, quando a pendência é de uma entrega. */
  entregaId?: string;
};

export type ContratoVariables = {
  template_version: string;
  contratado_nome: string;
  contratado_documento: string;
  contratado_endereco: string;
  contratado_cep: string;
  contratado_perfil: string;
  contratado_plataformas: string;
  contratado_email: string;
  contratado_telefone: string;
  anunciante_marca: string;
  campanha_nome: string;
  campanha_periodo_inicio: string;
  campanha_periodo_fim: string;
  briefing_referencia: string;
  entregas: {
    tipo: string;
    quantidade: string;
    formato_plataforma: string;
    data_horario: string;
    permanencia: string;
  }[];
  aprovacao_antecedencia_dias: string;
  pagamento_valor_total: string;
  pagamento_valor_total_extenso: string;
  pagamento_forma: string;
  pagamento_dados: string;
  pagamento_parcela_valor: string;
  pagamento_prazo_dias_uteis: string;
  exclusividade_possui: "SIM" | "NÃO";
  /** "N dias a partir da data de assinatura" ou, sem exclusividade, `TEXTO_SEM_EXCLUSIVIDADE`. */
  exclusividade_periodo: string;
  uso_conteudo_meses: string;
  /** SIM/NÃO refletido na linha "Uso em mídia paga autorizado?". A cláusula de mídia paga permanece no
   * documento nos dois casos: não existe lógica que a remova. */
  uso_midia_paga: "SIM" | "NÃO";
  multa_publicacao_irregular: string;
  multa_publicacao_irregular_extenso: string;
  multa_confidencialidade: string;
  multa_confidencialidade_extenso: string;
  vigencia_dias_apos_entregas: string;
  briefing_antecedencia_dias: string;
  anexo_i: {
    tipo: string;
    plataforma: string;
    peso_percentual: string;
    valor_correspondente: string;
  }[];
  anexo_i_total_valor: string;
};

export type ContratoEvaluation = {
  ok: boolean;
  issues: ContratoIssue[];
  /** Só preenchido quando `ok`. */
  variables: ContratoVariables | null;
};

/* ------------------------------------------------------------------ */
/* Utilitários                                                          */
/* ------------------------------------------------------------------ */

const clean = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ");
const hasBracket = (s: string) => /[[\]]/.test(s);

function isIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

const brDate = (iso: string) => iso.split("-").reverse().join("/");

const HORARIO_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function toPositiveInt(raw: string, max: number): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return n >= 1 && n <= max ? n : null;
}

/** "40", "33,33", "12.5%" → centésimos de ponto percentual (4000, 3333, 1250); `null` se inválido. */
function parseBasisPoints(raw: string): number | null {
  const s = raw.replace("%", "").replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  const bps = Number(i) * 100 + Number(f.padEnd(2, "0"));
  return bps > 0 && bps <= 10000 ? bps : null;
}

const formatBps = (bps: number) =>
  `${(bps / 100).toFixed(2).replace(".", ",").replace(/,00$/, "")}%`;

const normKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/* ------------------------------------------------------------------ */
/* Sugestões derivadas do tipo da entrega (só os formatos que o template exemplifica) */
/* ------------------------------------------------------------------ */

const UNIT_SUFFIX_RE = /\s*\((\d+\/\d+)\)\s*$/;

export function suggestFormato(tipo: string): string {
  const t = normKey(tipo.replace(UNIT_SUFFIX_RE, ""));
  if (t === "reels") return "Instagram Reels";
  if (t === "stories" || t === "story") return "Instagram Stories";
  if (t === "post feed" || t === "feed" || t === "feed post") return "Instagram Feed";
  if (t === "tiktok") return "TikTok";
  if (t === "short") return "YouTube – Short";
  if (t === "video youtube") return "YouTube – Video";
  return "";
}

export function suggestPermanencia(tipo: string): string {
  const t = normKey(tipo.replace(UNIT_SUFFIX_RE, ""));
  if (t === "stories" || t === "story") return "24 horas";
  if (["reels", "tiktok", "short", "video youtube"].includes(t)) return "Permanente";
  return ""; // Feed ("Permanente" ou "72h") e demais: a pessoa escolhe.
}

/** Chave do grupo no Anexo I: tipo (sem o sufixo de unidade) + formato. */
export function anexoGroupKey(row: Pick<ContratoEntregaRow, "tipo" | "formato">): string {
  return `${normKey(row.tipo.replace(UNIT_SUFFIX_RE, ""))}|${normKey(row.formato)}`;
}

function anexoTipoLabel(tipo: string): string {
  const base = clean(tipo.replace(UNIT_SUFFIX_RE, ""));
  return /stor/i.test(base) ? "Stories (conjunto)" : base;
}

/* ------------------------------------------------------------------ */
/* Pré-preenchimento                                                    */
/* ------------------------------------------------------------------ */

const PIX_LABEL: Record<PixTipo, string> = {
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  telefone: "Telefone",
  aleatoria: "Chave aleatória",
};

function pixDisplay(tipo: PixTipo, chave: string): string {
  const v = chave.trim();
  if (tipo === "cpf" || tipo === "cnpj") {
    const d = normalizeDocumento(v);
    return d.valid ? d.formatted : v;
  }
  if (tipo === "telefone") {
    const t = normalizeTelefoneBR(v);
    return t.valid ? t.formatted : v;
  }
  if (tipo === "email") return v.toLowerCase();
  return v;
}

function sortedRedes(influ: Influ) {
  return influ.redes
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => clean(r.handle))
    .sort((a, b) => {
      const pa = a.r.isPrimary ? 0 : 1;
      const pb = b.r.isPrimary ? 0 : 1;
      return pa - pb || (a.r.order ?? 1e9) - (b.r.order ?? 1e9) || a.i - b.i;
    })
    .map(({ r }) => r);
}

const withAt = (h: string) => {
  const v = clean(h);
  return v.startsWith("@") ? v : `@${v}`;
};

function entregasContratadas(influ: Influ): Entrega[] {
  return influ.entregas
    .filter((e) => e.status === "combinado" || e.status === "publicado")
    .slice()
    .sort((a, b) => (a.dataPostagem ?? "9999").localeCompare(b.dataPostagem ?? "9999"));
}

export function buildContratoDraft(src: ContratoSource): ContratoDraft {
  const { influ, banco, campanha, cliente, canReadBank } = src;
  const bank = canReadBank ? influ.bank : undefined;
  const redes = sortedRedes(influ);
  const end = banco?.endereco ?? {};
  const di = campanha.direitosImagem;

  const doc = bank?.cpfCnpj ? normalizeDocumento(bank.cpfCnpj) : null;

  let forma: PagamentoForma = "";
  let dados = "";
  if (bank?.pixChave?.trim() && bank.pixTipo) {
    forma = "PIX";
    dados = `${PIX_LABEL[bank.pixTipo]}: ${pixDisplay(bank.pixTipo, bank.pixChave)}`;
  } else if (bank && (bank.banco || bank.agencia || bank.conta)) {
    forma = "Transferência Bancária";
    dados = [
      bank.banco && `Banco ${clean(bank.banco)}`,
      bank.agencia && `Ag. ${clean(bank.agencia)}`,
      bank.conta && `Conta ${clean(bank.conta)}${bank.tipoConta ? ` (${bank.tipoConta})` : ""}`,
      bank.titular && `Titular ${clean(bank.titular)}`,
      doc && `CPF/CNPJ ${doc.formatted}`,
    ]
      .filter(Boolean)
      .join(", ");
  }

  return {
    contratadoNome: clean(bank?.titular),
    contratadoDocumento: doc ? doc.formatted : clean(bank?.cpfCnpj),
    rua: clean(end.rua),
    numero: clean(end.numero),
    complemento: clean(end.complemento),
    bairro: clean(end.bairro),
    cidade: clean(end.cidade),
    uf: clean(end.estado).toUpperCase(),
    cep: clean(end.cep),
    perfil: redes.map((r) => withAt(r.handle)).join(", "),
    plataformas: [...new Set(redes.map((r) => clean(r.plataforma)).filter(Boolean))].join(" / "),
    email: clean(influ.email) || clean(banco?.email),
    telefone: clean(influ.telefone) || clean(banco?.telefone),
    anunciante: clean(cliente.empresa),
    periodoInicio: campanha.dataInicio ?? "",
    periodoFim: campanha.prazo ?? "",
    // Sugestão editável: o nome da campanha NÃO é o código/título real do briefing.
    briefingReferencia: clean(campanha.nome),
    aprovacaoAntecedenciaDias: "",
    pagamentoForma: forma,
    pagamentoDados: dados,
    pagamentoPrazoDiasUteis: String(PRAZO_PAGAMENTO_PADRAO_DIAS),
    exclusividadeModo: di ? (di.exclusividade ? "dias" : "nenhuma") : "",
    exclusividadeDias:
      di?.exclusividade && di.exclusividadeDias ? String(di.exclusividadeDias) : "",
    multaPublicacaoIrregular: CONTRATO_DEFAULTS.multaPublicacaoIrregular,
    multaConfidencialidade: CONTRATO_DEFAULTS.multaConfidencialidade,
    vigenciaDiasAposEntregas: CONTRATO_DEFAULTS.vigenciaDiasAposEntregas,
    briefingAntecedenciaDias: CONTRATO_DEFAULTS.briefingAntecedenciaDias,
    entregas: entregasContratadas(influ).map((e) => {
      const unit = e.grupoId && e.titulo ? UNIT_SUFFIX_RE.exec(e.titulo)?.[1] : undefined;
      const tipo = clean(e.tipo) + (unit ? ` (${unit})` : "");
      return {
        entregaId: e.id,
        tipo,
        quantidade: String(e.quantidade),
        formato: suggestFormato(e.tipo),
        data: e.dataPostagem ?? "",
        horario: "",
        permanencia: suggestPermanencia(e.tipo),
      };
    }),
    anexoPesos: {},
  };
}

/* ------------------------------------------------------------------ */
/* Validação + geração das variáveis                                    */
/* ------------------------------------------------------------------ */

export function evaluateContrato(draft: ContratoDraft, src: ContratoSource): ContratoEvaluation {
  const issues: ContratoIssue[] = [];
  const add = (code: string, field: string, message: string, entregaId?: string) =>
    issues.push({ code, field, message, entregaId });

  const { influ, campanha, cliente } = src;

  /* --- elegibilidade --- */
  if (cliente.demoSessionId) {
    add("demo", "cliente", "Cliente de demonstração: contratos não podem ser gerados.");
  }
  if (influ.status !== "APROVADO") {
    add("influ.status", "status", "O influenciador precisa estar APROVADO nesta campanha.");
  }
  if (!src.canReadBank) {
    add(
      "permissao.bancario",
      "pagamento",
      "Sem permissão para dados bancários (influenciadores:bancario): necessária para gerar o contrato.",
    );
  }

  /* --- contratado(a) --- */
  const nome = clean(draft.contratadoNome);
  const doc = normalizeDocumento(draft.contratadoDocumento);
  if (!nome) add("V01", "contratadoNome", "Informe o nome completo / razão social.");
  else if (hasBracket(nome))
    add("V01", "contratadoNome", "O nome contém colchetes: remova o texto de modelo.");
  else if (doc.kind === "cnpj" ? nome.length < 3 : nome.split(" ").length < 2) {
    add("V01", "contratadoNome", "Informe o nome completo (nome e sobrenome) ou a razão social.");
  }

  if (!doc.digits) add("V02", "contratadoDocumento", "Informe o CPF ou CNPJ.");
  else if (!doc.valid) add("V02", "contratadoDocumento", "CPF/CNPJ inválido (confira os dígitos).");

  const rua = clean(draft.rua);
  const numero = clean(draft.numero);
  const bairro = clean(draft.bairro);
  const cidade = clean(draft.cidade);
  const uf = normalizeUf(draft.uf);
  const faltaEndereco = [
    !rua && "rua",
    !numero && "número",
    !bairro && "bairro",
    !cidade && "cidade",
    !uf && "UF (2 letras)",
  ].filter(Boolean);
  if (faltaEndereco.length > 0) {
    add("V03", "endereco", `Endereço incompleto. Falta: ${faltaEndereco.join(", ")}.`);
  }
  const cep = normalizeCep(draft.cep);
  if (!cep) add("V04", "cep", "CEP inválido (8 dígitos).");

  const perfil = clean(draft.perfil);
  if (!perfil) add("V05", "perfil", "Informe o perfil (@) do influenciador.");
  const plataformas = clean(draft.plataformas);
  if (!plataformas) add("V06", "plataformas", "Informe a(s) plataforma(s).");

  const email = normalizeEmail(draft.email);
  if (!email.valid) add("V07", "email", email.value ? "E-mail inválido." : "Informe o e-mail.");
  const tel = normalizeTelefoneBR(draft.telefone);
  if (!tel.valid) {
    add(
      "V08",
      "telefone",
      tel.digits ? "Telefone inválido (DDD + número)." : "Informe o telefone.",
    );
  }

  /* --- objeto --- */
  const anunciante = clean(draft.anunciante);
  if (anunciante.length < 2) add("V09", "anunciante", "Informe o anunciante / marca.");
  const campanhaNome = clean(campanha.nome);
  if (!campanhaNome) add("V10", "campanhaNome", "A campanha não tem nome.");

  const inicioOk = isIsoDate(draft.periodoInicio);
  const fimOk = isIsoDate(draft.periodoFim);
  if (!inicioOk) add("V11", "periodoInicio", "Informe a data de início do período de execução.");
  if (!fimOk) add("V12", "periodoFim", "Informe a data de fim do período de execução.");
  if (inicioOk && fimOk && draft.periodoFim < draft.periodoInicio) {
    add("V12", "periodoFim", "A data de fim é anterior à data de início.");
  }

  const briefing = clean(draft.briefingReferencia);
  if (briefing.length < 3 || briefing.length > 120) {
    add("V13", "briefingReferencia", "Informe a referência do briefing (3 a 120 caracteres).");
  }

  /* --- entregas (T1) --- */
  for (const e of influ.entregas.filter((x) => x.status === "orcado")) {
    add(
      "PMR-8",
      "entregas",
      `A entrega "${clean(e.tipo) || "sem tipo"}" está apenas orçada: marque-a como combinada ou remova-a antes de gerar o contrato.`,
      e.id,
    );
  }
  const rows = draft.entregas;
  if (rows.length === 0)
    add("V14", "entregas", "O contrato precisa de pelo menos uma entrega combinada.");
  const entregasOut: ContratoVariables["entregas"] = [];
  for (const row of rows) {
    const label = clean(row.tipo) || "entrega";
    const falta: string[] = [];
    if (!clean(row.tipo)) falta.push("tipo");
    if (!toPositiveInt(row.quantidade, 1000)) falta.push("quantidade");
    if (!clean(row.formato)) falta.push("formato/plataforma");
    if (!isIsoDate(row.data)) falta.push("data");
    if (!HORARIO_RE.test(row.horario.trim())) falta.push("horário (HH:MM)");
    if (!clean(row.permanencia)) falta.push("permanência");
    if (falta.length > 0) {
      add("V14", "entregas", `${label} — falta: ${falta.join(", ")}.`, row.entregaId);
      continue;
    }
    entregasOut.push({
      tipo: clean(row.tipo),
      quantidade: String(Number(row.quantidade)),
      formato_plataforma: clean(row.formato),
      data_horario: `${brDate(row.data)} – ${row.horario.trim()}`,
      permanencia: clean(row.permanencia),
    });
  }

  const antecedencia = toPositiveInt(draft.aprovacaoAntecedenciaDias, 60);
  if (!antecedencia) {
    add("V15", "aprovacaoAntecedenciaDias", "Informe a antecedência da aprovação (1 a 60 dias).");
  }

  /* --- pagamento --- */
  let totalCents: number | null = null;
  const pag = normalizePagamento(influ.pagamento);
  if (!pag || pag.tipos.length === 0) {
    add("V16", "pagamento", "A remuneração do influenciador ainda não foi definida.");
  } else if (!(pag.tipos.length === 1 && pag.tipos[0] === "Valor")) {
    add(
      "PMR-1",
      "pagamento",
      `Remuneração (${pag.tipos.join(" + ")}) não tem representação no contrato atual, que só prevê valor total em dinheiro. Defina a regra e o texto antes de gerar.`,
    );
  } else {
    const cents = parseMoneyCents(pag.config.Valor?.valor);
    if (cents == null || cents <= 0) {
      add("V16", "pagamento", "O valor da remuneração está vazio ou inválido.");
    } else {
      totalCents = cents;
    }
  }

  const forma = draft.pagamentoForma;
  if (!forma) add("V18", "pagamentoForma", "Escolha a forma de pagamento.");
  const dados = clean(draft.pagamentoDados);
  if (!dados) {
    add("V19", "pagamentoDados", "Informe a chave PIX ou os dados bancários.");
  } else if (forma === "PIX") {
    const m = /^(CPF|CNPJ|E-mail|Telefone|Chave aleatória):\s*(.+)$/.exec(dados);
    const tipo = m && (Object.keys(PIX_LABEL) as PixTipo[]).find((k) => PIX_LABEL[k] === m[1]);
    if (m && tipo && !isValidPixKey(tipo, m[2])) {
      add("V19", "pagamentoDados", `Chave PIX inválida para o tipo ${m[1]}.`);
    }
  } else if (forma === "Transferência Bancária" && (dados.length < 10 || !/\d/.test(dados))) {
    add("V19", "pagamentoDados", "Dados bancários incompletos (banco, agência e conta).");
  }

  const prazoPag = toPositiveInt(draft.pagamentoPrazoDiasUteis, 120);
  if (!prazoPag)
    add("V21", "pagamentoPrazoDiasUteis", "Prazo de pagamento inválido (1 a 120 dias úteis).");

  /* --- exclusividade --- */
  let exclusividadeTexto = "";
  let exclusividadePossui: "SIM" | "NÃO" = "NÃO";
  if (draft.exclusividadeModo === "dias") {
    const dias = toPositiveInt(draft.exclusividadeDias, 3650);
    if (!dias) add("V22", "exclusividadeDias", "Informe os dias de exclusividade (1 a 3650).");
    else {
      exclusividadeTexto = `${dias} dias a partir da data de assinatura`;
      exclusividadePossui = "SIM";
    }
  } else if (draft.exclusividadeModo === "nenhuma") {
    // Condição válida: o contrato declara explicitamente que não há exclusividade.
    exclusividadeTexto = TEXTO_SEM_EXCLUSIVIDADE;
  } else {
    add("V22", "exclusividade", "Confirme a exclusividade (sem exclusividade ou número de dias).");
  }

  /* --- parâmetros que antes eram constantes entre colchetes ([100.000], [365], [7]) --- */
  const multaPublicacao = parseMoneyCents(draft.multaPublicacaoIrregular);
  if (multaPublicacao == null || multaPublicacao <= 0 || multaPublicacao > MULTA_MAX_CENTS) {
    add(
      "V25",
      "multaPublicacaoIrregular",
      "Informe o valor da multa por publicação irregular (R$, maior que zero).",
    );
  }
  const multaConfidencial = parseMoneyCents(draft.multaConfidencialidade);
  if (multaConfidencial == null || multaConfidencial <= 0 || multaConfidencial > MULTA_MAX_CENTS) {
    add(
      "V26",
      "multaConfidencialidade",
      "Informe o valor da multa por violação de confidencialidade (R$, maior que zero).",
    );
  }
  const vigenciaDias = toPositiveInt(draft.vigenciaDiasAposEntregas, 3650);
  if (!vigenciaDias) {
    add("V27", "vigenciaDiasAposEntregas", "Informe a vigência após as entregas (1 a 3650 dias).");
  }
  const briefingAntecedencia = toPositiveInt(draft.briefingAntecedenciaDias, 60);
  if (!briefingAntecedencia) {
    add(
      "V28",
      "briefingAntecedenciaDias",
      "Informe a antecedência do briefing da CONTRATANTE (1 a 60 dias).",
    );
  }

  /* --- direitos de imagem (somente leitura: vêm da campanha) --- */
  let meses = 0;
  // Mídia paga NÃO não remove a cláusula: só muda o SIM/NÃO da linha correspondente.
  let usoMidiaPaga: "SIM" | "NÃO" = "NÃO";
  const di = campanha.direitosImagem;
  if (!di || !di.permitido) {
    add(
      "PMR-4",
      "direitosImagem",
      "A campanha não autoriza uso de imagem, e a cláusula 17 do contrato é uma cessão. Ajuste os direitos de imagem da campanha ou o modelo.",
    );
  } else {
    usoMidiaPaga = di.usos.some((u) => /^pago/i.test(u)) ? "SIM" : "NÃO";
    if (di.duracaoDias == null) {
      add(
        "PMR-5",
        "direitosImagem",
        "O prazo de uso da campanha é indeterminado, mas o contrato exige um número de meses.",
      );
    } else if (
      !Number.isInteger(di.duracaoDias) ||
      di.duracaoDias <= 0 ||
      di.duracaoDias % 30 !== 0
    ) {
      add(
        "V23",
        "direitosImagem",
        `O prazo de uso (${di.duracaoDias} dias) não corresponde a meses inteiros: ajuste na campanha.`,
      );
    } else {
      meses = di.duracaoDias / 30;
    }
  }

  /* --- Anexo I (T2) --- */
  const anexoOut: ContratoVariables["anexo_i"] = [];
  let anexoTotal = "";
  const groups = new Map<string, { tipo: string; plataforma: string }>();
  for (const row of rows) {
    if (!clean(row.tipo)) continue;
    const key = anexoGroupKey(row);
    if (!groups.has(key))
      groups.set(key, { tipo: anexoTipoLabel(row.tipo), plataforma: clean(row.formato) });
  }
  if (groups.size > 0 && totalCents != null) {
    const parsed: { key: string; bps: number | null }[] = [...groups.keys()].map((key) => ({
      key,
      bps: parseBasisPoints(draft.anexoPesos[key] ?? ""),
    }));
    const invalid = parsed.filter((p) => p.bps == null);
    if (invalid.length > 0) {
      const nomes = invalid.map((p) => groups.get(p.key)!.tipo).join(", ");
      add("PMR-10", "anexoPesos", `Anexo I — informe o peso (%) de: ${nomes}.`);
    } else {
      const soma = parsed.reduce((s, p) => s + p.bps!, 0);
      if (soma !== 10000) {
        add(
          "PMR-10",
          "anexoPesos",
          `Anexo I — os pesos somam ${formatBps(soma)}; precisam somar 100%.`,
        );
      } else {
        let acumulado = 0;
        parsed.forEach((p, idx) => {
          const g = groups.get(p.key)!;
          const ultimo = idx === parsed.length - 1;
          const valor = ultimo ? totalCents - acumulado : Math.round((totalCents * p.bps!) / 10000);
          acumulado += valor;
          anexoOut.push({
            tipo: g.tipo,
            plataforma: g.plataforma,
            peso_percentual: formatBps(p.bps!),
            valor_correspondente: formatCents(valor),
          });
        });
        anexoTotal = formatCents(totalCents);
      }
    }
  } else if (groups.size > 0 && totalCents == null) {
    // Sem valor total válido não há como calcular o Anexo I; a pendência de pagamento já foi registrada.
  }

  if (issues.length > 0) return { ok: false, issues, variables: null };

  // Daqui em diante tudo foi validado: os `!` abaixo são seguros.
  const variables: ContratoVariables = {
    template_version: CONTRATO_TEMPLATE_VERSION,
    contratado_nome: nome,
    contratado_documento: doc.formatted,
    contratado_endereco: `${rua}, nº ${numero}${clean(draft.complemento) ? `, ${clean(draft.complemento)}` : ""}, ${bairro}, ${cidade} – ${uf}`,
    contratado_cep: cep!,
    contratado_perfil: perfil,
    contratado_plataformas: plataformas,
    contratado_email: email.value,
    contratado_telefone: tel.formatted,
    anunciante_marca: anunciante,
    campanha_nome: campanhaNome,
    campanha_periodo_inicio: brDate(draft.periodoInicio),
    campanha_periodo_fim: brDate(draft.periodoFim),
    briefing_referencia: briefing,
    entregas: entregasOut,
    aprovacao_antecedencia_dias: String(antecedencia!),
    pagamento_valor_total: formatCents(totalCents!),
    pagamento_valor_total_extenso: valorPorExtenso(totalCents!),
    pagamento_forma: forma,
    pagamento_dados: dados,
    pagamento_parcela_valor: formatCents(totalCents!),
    pagamento_prazo_dias_uteis: String(prazoPag!),
    exclusividade_possui: exclusividadePossui,
    exclusividade_periodo: exclusividadeTexto,
    uso_conteudo_meses: String(meses),
    uso_midia_paga: usoMidiaPaga,
    multa_publicacao_irregular: formatReaisCompact(multaPublicacao!),
    multa_publicacao_irregular_extenso: valorPorExtenso(multaPublicacao!),
    multa_confidencialidade: formatReaisCompact(multaConfidencial!),
    multa_confidencialidade_extenso: valorPorExtenso(multaConfidencial!),
    vigencia_dias_apos_entregas: String(vigenciaDias!),
    briefing_antecedencia_dias: String(briefingAntecedencia!),
    anexo_i: anexoOut,
    anexo_i_total_valor: anexoTotal,
  };
  return { ok: true, issues: [], variables };
}
