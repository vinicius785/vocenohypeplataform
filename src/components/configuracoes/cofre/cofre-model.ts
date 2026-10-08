/**
 * Modelo de APRESENTAÇÃO do Cofre de senhas. Não toca em criptografia nem em persistência: `Senha`
 * é o mesmo registro de sempre (`config:senhas`), com `senha` já cifrada quando `encrypted`.
 */
export type Senha = {
  id: string;
  nome: string;
  categoria: string;
  usuario: string;
  senha: string;
  encrypted?: boolean;
  url?: string;
  notas?: string;
};

/** Categorias já existentes no formulário — preservadas, nenhuma nova. */
export const CATEGORIAS = [
  "Rede social",
  "Ferramenta",
  "E-mail",
  "Hospedagem",
  "Domínio",
  "Analytics",
  "Anúncios",
  "Design",
  "Outros",
] as const;

/** Valor interno quando a senha não pôde ser descriptografada (nunca deve ser copiado/mostrado como segredo). */
export const DECRYPT_FAILED = "⚠️ não foi possível descriptografar";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Busca instantânea por nome, categoria e usuário/e-mail (ignora acento e caixa) + filtro de categoria. */
export function filterSenhas(items: readonly Senha[], query: string, categoria: string): Senha[] {
  const q = norm(query.trim());
  return items.filter((s) => {
    if (categoria && s.categoria !== categoria) return false;
    if (!q) return true;
    return norm(s.nome).includes(q) || norm(s.categoria).includes(q) || norm(s.usuario).includes(q);
  });
}

/** Até 2 letras para o selo do serviço ("Meta Ads" → "MA", "Instagram" → "IN"). */
export function serviceInitials(nome: string): string {
  const words = nome.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** "https://www.instagram.com/x" → "instagram.com". Inválido → o texto original sem protocolo. */
export function displayHost(url: string | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//i, "");
  }
}

/** Só http(s) é aberto — nunca `javascript:` ou outros esquemas digitados num campo livre. */
export function safeExternalUrl(url: string | undefined): string | null {
  if (!url?.trim()) return null;
  const withProto = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  try {
    const u = new URL(withProto);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}
