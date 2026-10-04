/**
 * Interpreta o texto livre de "Regiões" da campanha (`sobre.regioes`) em estados (UF) e
 * localidades, para desenhar o mapa — SEM fingir precisão: só destaca um estado quando o texto o
 * identifica (nome do estado, sigla após o município — "Duque de Caxias - RJ" — ou macrorregião);
 * municípios/bairros sem estado ficam só na lista. Nada é inventado.
 */
export const UF_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

const MACROS: Record<string, { label: string; ufs: string[] }> = {
  norte: { label: "Norte", ufs: ["AC", "AM", "AP", "PA", "RO", "RR", "TO"] },
  nordeste: { label: "Nordeste", ufs: ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"] },
  "centro-oeste": { label: "Centro-Oeste", ufs: ["DF", "GO", "MT", "MS"] },
  sudeste: { label: "Sudeste", ufs: ["ES", "MG", "RJ", "SP"] },
  sul: { label: "Sul", ufs: ["PR", "RS", "SC"] },
};
const NATIONAL = new Set(["brasil", "nacional", "todo o brasil", "todo brasil", "pais inteiro"]);

export const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const STATE_BY_NAME = new Map(Object.entries(UF_NAMES).map(([uf, name]) => [norm(name), uf]));

export type Localidade = { nome: string; uf?: string };
export type ParsedRegioes = {
  /** UFs a destacar no mapa, em ordem estável. */
  states: string[];
  /** Título curto da localização ("Rio de Janeiro", "Sudeste", "Brasil inteiro"...). */
  headline: string[];
  localidades: Localidade[];
  /** Tokens que o texto trouxe, reconhecidos ou não (para decidir se o texto é só localização). */
  tokens: { raw: string; kind: "estado" | "macro" | "nacional" | "localidade" }[];
};

const UF_SUFFIX = /^(.*?)\s*(?:[-–—/]|\()\s*([A-Za-z]{2})\)?\s*$/;

function classify(token: string): {
  kind: "estado" | "macro" | "nacional" | "localidade";
  uf?: string;
  ufs?: string[];
  label?: string;
  nome: string;
} {
  const t = token.trim();
  const n = norm(t.replace(/^estado\s+d[eo]\s+/i, ""));
  if (NATIONAL.has(n)) return { kind: "nacional", nome: t, label: "Brasil inteiro" };
  const macro = MACROS[n] ?? MACROS[n.replace(" ", "-")];
  if (macro) return { kind: "macro", nome: t, ufs: macro.ufs, label: macro.label };
  const st = STATE_BY_NAME.get(n);
  if (st) return { kind: "estado", nome: UF_NAMES[st], uf: st };
  const m = UF_SUFFIX.exec(t);
  if (m && UF_NAMES[m[2].toUpperCase()] && m[1].trim())
    return { kind: "localidade", nome: m[1].trim(), uf: m[2].toUpperCase() };
  return { kind: "localidade", nome: t };
}

function splitTokens(text: string): string[] {
  const coarse = text
    .split(/[,;\n|•]+/)
    .map((s) => s.replace(/[.\s]+$/, "").trim())
    .filter(Boolean);
  // " e " só separa quando TODAS as partes são estados/macros ("Rio de Janeiro e São Paulo").
  return coarse.flatMap((piece) => {
    const parts = piece
      .split(/\s+e\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length > 1 && parts.every((p) => classify(p).kind !== "localidade")) return parts;
    return [piece];
  });
}

export function parseRegioes(text?: string | null): ParsedRegioes {
  const out: ParsedRegioes = { states: [], headline: [], localidades: [], tokens: [] };
  if (!text?.trim()) return out;
  const states = new Set<string>();
  const seenLoc = new Set<string>();
  for (const raw of splitTokens(text)) {
    const c = classify(raw);
    out.tokens.push({ raw, kind: c.kind });
    if (c.kind === "nacional") {
      Object.keys(UF_NAMES).forEach((u) => states.add(u));
      out.headline.push(c.label!);
    } else if (c.kind === "macro") {
      c.ufs!.forEach((u) => states.add(u));
      out.headline.push(c.label!);
    } else if (c.kind === "estado") {
      states.add(c.uf!);
      out.headline.push(c.nome);
    } else {
      const key = norm(c.nome);
      if (!seenLoc.has(key)) {
        seenLoc.add(key);
        out.localidades.push({ nome: c.nome, uf: c.uf });
      }
      if (c.uf) states.add(c.uf);
    }
  }
  out.states = Object.keys(UF_NAMES).filter((u) => states.has(u));
  // Sem título explícito, mas com localidades de UM estado ("Duque de Caxias - RJ"): usa o estado.
  if (out.headline.length === 0 && out.states.length > 0 && out.states.length <= 3) {
    out.headline = out.states.map((u) => UF_NAMES[u]);
  }
  return out;
}

/** O texto de "Público desejado" é, na verdade, só localização? (ex.: "Rio de Janeiro".) Então não
 * é público-alvo: não deve aparecer como tal. Verdadeiro quando TODOS os trechos são
 * estados/macros/Brasil, ou já estão listados nas regiões. */
export function isLocationText(text: string | undefined, regioes: ParsedRegioes): boolean {
  if (!text?.trim()) return false;
  const known = new Set(regioes.localidades.map((l) => norm(l.nome)));
  const tokens = splitTokens(text);
  if (tokens.length === 0) return false;
  return tokens.every((raw) => {
    const c = classify(raw);
    return c.kind !== "localidade" || known.has(norm(c.nome));
  });
}

export type LocalizacaoCampanha = ParsedRegioes & {
  /** Público-alvo real (texto), se houver e não for localização disfarçada. */
  publico?: string;
};

/** Junta `regioes` e `publicoDesejado`: quando o segundo é só localização, ele soma ao mapa e
 * deixa de aparecer como público. */
export function resolveLocalizacao(sobre: {
  regioes?: string;
  publicoDesejado?: string;
}): LocalizacaoCampanha {
  const base = parseRegioes(sobre.regioes);
  const pub = sobre.publicoDesejado?.trim();
  if (!pub) return base;
  if (!isLocationText(pub, base)) return { ...base, publico: pub };
  const extra = parseRegioes(pub);
  const states = Object.keys(UF_NAMES).filter(
    (u) => base.states.includes(u) || extra.states.includes(u),
  );
  const headline = [...base.headline];
  for (const h of extra.headline) if (!headline.includes(h)) headline.push(h);
  const seen = new Set(base.localidades.map((l) => norm(l.nome)));
  const localidades = [
    ...base.localidades,
    ...extra.localidades.filter((l) => !seen.has(norm(l.nome))),
  ];
  return { ...base, states, headline, localidades, tokens: [...base.tokens, ...extra.tokens] };
}

/** "Linha por linha" → itens de lista (quebras de linha, `;` ou marcadores); 1 item = parágrafo. */
export function toItems(text?: string): string[] {
  if (!text) return [];
  return text
    .split(/\n+|;\s*/)
    .map((s) => s.replace(/^\s*[-–•*]\s*/, "").trim())
    .filter(Boolean);
}
