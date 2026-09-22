/**
 * Fonte única de plataformas + normalização de perfis de rede social —
 * compartilhada pelo formulário público de inscrição
 * (`src/routes/inscricao.$token.tsx`), pelo editor de campos da página
 * de inscrição e pela tela de análise de influenciadores
 * (`InfluencerBoard.tsx`'s `RedesEditor`). Antes cada lugar tinha sua
 * própria lista de plataformas (`REDES_OPTS`) e nenhuma normalização —
 * handle e URL eram só texto livre.
 *
 * O tipo `Rede` (`{ id, plataforma, handle, seguidores?, profileUrl?,
 * isPrimary?, order? }`, definido em `InfluencerBoard.tsx`) já é um
 * ARRAY por influenciador — nunca existiu uma trava técnica contra 2
 * entradas da mesma plataforma, só a UI que só deixava ativar cada
 * plataforma uma vez. `profileUrl`/`isPrimary`/`order` são aditivos:
 * um registro antigo sem eles continua válido (ver `ensurePrimary`).
 */

export type SocialPlatformKey = "Instagram" | "TikTok" | "YouTube" | "X" | "LinkedIn" | "Facebook";

export type SocialPlatformDef = {
  key: SocialPlatformKey;
  label: string;
  /** true = campo de usuário com prefixo visual "@" (Instagram/TikTok/X);
   * false = campo de URL (YouTube/LinkedIn/Facebook, onde o formato do
   * "nome de usuário" varia demais pra validar como handle). */
  usesHandle: boolean;
  placeholder: string;
};

export const PLATAFORMAS: SocialPlatformDef[] = [
  { key: "Instagram", label: "Instagram", usesHandle: true, placeholder: "seuusuario" },
  { key: "TikTok", label: "TikTok", usesHandle: true, placeholder: "seuusuario" },
  { key: "X", label: "X", usesHandle: true, placeholder: "seuusuario" },
  { key: "YouTube", label: "YouTube", usesHandle: false, placeholder: "Cole o link do canal" },
  { key: "LinkedIn", label: "LinkedIn", usesHandle: false, placeholder: "Cole o link do perfil" },
  {
    key: "Facebook",
    label: "Facebook",
    usesHandle: false,
    placeholder: "Cole o link da página ou perfil",
  },
];

/** Mantido pra compatibilidade com os lugares que só precisam da lista de
 * nomes (o array de `string` que `REDES_OPTS` já era). */
export const REDES_OPTS: string[] = PLATAFORMAS.map((p) => p.key);

export function platformDef(plataforma: string): SocialPlatformDef | undefined {
  return PLATAFORMAS.find((p) => p.key === plataforma);
}

const HANDLE_URL_PATTERNS: Partial<Record<SocialPlatformKey, RegExp>> = {
  Instagram: /instagram\.com\/([^/?#]+)/i,
  TikTok: /tiktok\.com\/@?([^/?#]+)/i,
  X: /(?:x|twitter)\.com\/([^/?#]+)/i,
};

/** Normaliza o que a pessoa digitou (`@usuario`, `usuario` ou uma URL
 * completa) em `{ handle, profileUrl }`. Pra plataformas baseadas em
 * usuário (Instagram/TikTok/X): sempre tenta extrair um handle, mesmo
 * de uma URL colada; gera `profileUrl` a partir do handle quando não
 * veio uma URL. Pra YouTube/LinkedIn/Facebook: o valor é tratado como
 * URL (não força formato de `@usuario`, o link já basta). */
export function normalizeSocialInput(
  plataforma: string,
  raw: string,
): { handle: string; profileUrl?: string } {
  const trimmed = raw.trim();
  const def = platformDef(plataforma);
  if (!trimmed) return { handle: "" };

  if (def?.usesHandle) {
    const urlPattern = HANDLE_URL_PATTERNS[def.key];
    if (/^https?:\/\//i.test(trimmed) && urlPattern) {
      const match = urlPattern.exec(trimmed);
      const handle = (match?.[1] ?? trimmed).replace(/^@+/, "").replace(/\/+$/, "");
      return { handle, profileUrl: trimmed };
    }
    const handle = trimmed.replace(/^@+/, "");
    return { handle, profileUrl: undefined };
  }

  // YouTube/LinkedIn/Facebook: URL completa é o dado principal; se a
  // pessoa digitou só um nome (sem URL), guarda como "handle" mesmo
  // assim, pra não perder o que foi digitado.
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      handle: trimmed.replace(/^https?:\/\//i, "").replace(/\/+$/, ""),
      profileUrl: trimmed,
    };
  }
  return { handle: trimmed };
}

/** URL final pra abrir num clique — prioriza `profileUrl` já normalizado;
 * pra plataformas de handle sem `profileUrl` salvo (registros antigos),
 * monta a URL a partir do handle. */
export function resolveProfileUrl(rede: {
  plataforma: string;
  handle: string;
  profileUrl?: string;
}): string | null {
  if (rede.profileUrl) return rede.profileUrl;
  if (!rede.handle) return null;
  switch (rede.plataforma) {
    case "Instagram":
      return `https://instagram.com/${rede.handle}`;
    case "TikTok":
      return `https://tiktok.com/@${rede.handle}`;
    case "X":
      return `https://x.com/${rede.handle}`;
    default:
      return null;
  }
}

/** Sanitiza um handle pra EXIBIÇÃO — nunca deixa um valor tipo
 * `@https://www.instagram.com/allanvaz__/` chegar na tela. Cobre registros
 * salvos antes de `normalizeSocialInput` existir (ou de qualquer origem
 * que não passou por ela): se o valor já parece uma URL, refaz a mesma
 * extração de handle; senão, só limpa `@`/espaços. Idempotente — aplicar
 * num handle já limpo não muda nada. */
export function sanitizeHandleForDisplay(plataforma: string, handle: string): string {
  const trimmed = handle.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed) || trimmed.includes(".com/")) {
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const { handle: extracted } = normalizeSocialInput(plataforma, withProtocol);
    if (extracted) return extracted;
  }
  return trimmed.replace(/^@+/, "");
}

/** Normalização de e-mail/telefone pra comparação de identidade — usada
 * pelo dedup do formulário público de inscrição
 * (`submitInscricaoCampanha`) e pelo dedup do fluxo "Adicionar do banco"
 * (`InfluencerBoard.tsx`'s `findExistingBankInfluMatch`). Mantida aqui
 * (não reimplementada em cada lugar) pra os dois fluxos sempre
 * concordarem sobre o que conta como "mesma pessoa". */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
export function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D+/g, "");
}

type RedeLike = { id: string; plataforma: string; handle: string; isPrimary?: boolean };

/** Compara de forma normalizada (case-insensitive, sem "@") pra bloquear
 * duas entradas idênticas na mesma plataforma — nunca bloqueia
 * plataformas diferentes nem handles diferentes da mesma plataforma. */
export function isDuplicateProfile<T extends RedeLike>(
  redes: T[],
  plataforma: string,
  handle: string,
  excludingId?: string,
): boolean {
  const norm = handle.trim().replace(/^@+/, "").toLowerCase();
  if (!norm) return false;
  return redes.some(
    (r) =>
      r.id !== excludingId &&
      r.plataforma === plataforma &&
      r.handle.trim().replace(/^@+/, "").toLowerCase() === norm,
  );
}

/** Agrupa preservando a ordem de primeira aparição de cada plataforma —
 * usado pelo formulário público, pelo editor e pela ficha de análise
 * pra sempre mostrar "todas as contas por rede", nunca só a primeira. */
export function groupByPlatform<T extends { plataforma: string }>(redes: T[]): [string, T[]][] {
  const order: string[] = [];
  const map = new Map<string, T[]>();
  for (const r of redes) {
    if (!map.has(r.plataforma)) {
      map.set(r.plataforma, []);
      order.push(r.plataforma);
    }
    map.get(r.plataforma)!.push(r);
  }
  return order.map((p) => [p, map.get(p)!]);
}

/** Resolve `isPrimary` só pra EXIBIÇÃO/exportação (nunca para gravar) —
 * quando nenhuma entrada de um grupo está marcada como principal, a
 * primeira passa a contar como principal na leitura. Registros antigos
 * (sem `isPrimary` em nenhuma entrada) continuam funcionando sem
 * precisar ser reescritos. */
export function ensurePrimary<T extends RedeLike>(redes: T[]): T[] {
  const groups = groupByPlatform(redes);
  const resolvedIds = new Set<string>();
  for (const [, items] of groups) {
    const marked = items.find((r) => r.isPrimary);
    resolvedIds.add((marked ?? items[0]).id);
  }
  return redes.map((r) => ({ ...r, isPrimary: resolvedIds.has(r.id) }));
}
