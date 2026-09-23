/**
 * Config canônica do OAuth do Google Calendar. Existe pra resolver o
 * `redirect_uri_mismatch` (erro 400 do Google) causado por calcular o
 * redirect_uri a partir do origin/host da requisição: a plataforma tem
 * múltiplos domínios de produção apontando pro mesmo deploy Vercel, então
 * dependendo de qual domínio o usuário estava quando clicou em
 * "Conectar"/"Reconectar", o valor enviado ao Google mudava — e só UM deles
 * pode estar cadastrado como "Authorized redirect URI" no Google Cloud.
 *
 * A partir daqui o redirect_uri é sempre `${APP_URL}/api/google/oauth-callback`,
 * nunca derivado de origin/host/referer/X-Forwarded-*. `APP_URL` precisa ser
 * EXATAMENTE o domínio cadastrado no Google Cloud Console.
 */

const OAUTH_CALLBACK_PATH = "/api/google/oauth-callback";

function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

/** Lê, valida e normaliza `APP_URL`. Lança erro claro (nunca falha
 * silenciosamente) se a variável estiver ausente, não for uma URL absoluta,
 * ou não usar HTTPS fora de localhost. Sempre sem barra final. */
export function getAppUrl(): string {
  const raw = process.env.APP_URL?.trim();
  if (!raw) {
    throw new Error(
      "APP_URL não configurada — obrigatória para o OAuth do Google Calendar " +
        '(ex: "https://plataforma.vocenohype.com.br" em produção, ' +
        '"http://localhost:8080" em desenvolvimento).',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`APP_URL inválida: "${raw}" não é uma URL absoluta.`);
  }

  if (!isLocalHostname(parsed.hostname) && parsed.protocol !== "https:") {
    throw new Error(
      `APP_URL deve usar HTTPS fora de localhost — recebido "${raw}". ` +
        "Só http:// é permitido para localhost/127.0.0.1 (ambiente de desenvolvimento).",
    );
  }

  return raw.replace(/\/+$/, "");
}

/** Único ponto que monta o redirect_uri do OAuth do Google. Precisa ser
 * usado sem exceção tanto ao montar a URL de autorização quanto ao trocar o
 * `code` por tokens no callback — o Google rejeita a troca (400) se os dois
 * valores não forem byte-a-byte idênticos. */
export function getGoogleOAuthRedirectUri(): string {
  return `${getAppUrl()}${OAUTH_CALLBACK_PATH}`;
}

/** Ambiente pra log estruturado — nunca usado pra decidir HTTPS (isso é
 * decidido só pelo hostname de `APP_URL`, ver `getAppUrl`). */
export function googleOAuthEnvTag(): string {
  return process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "development";
}

/** Se a requisição chegou por um domínio diferente do canônico (`APP_URL`)
 * — ex: um domínio alternativo do Vercel, ou `www.` — devolve a URL pra onde
 * o navegador deve ser mandado ANTES de sequer iniciar o fluxo OAuth,
 * preservando caminho e query string da página atual. `null` quando a
 * requisição já está no domínio certo (nada a fazer). Isso evita ter que
 * cadastrar mais de um redirect_uri autorizado no Google Cloud por conta de
 * domínios alternativos — e nunca deve ser usado pra sair para uma URL
 * fornecida por quem chama, só pra recompor o próprio caminho atual. */
export function canonicalRedirectUrl(requestUrl: string): string | null {
  const appOrigin = new URL(getAppUrl()).origin;
  const current = new URL(requestUrl);
  if (current.origin === appOrigin) return null;
  return `${appOrigin}${current.pathname}${current.search}`;
}

/** `state` do OAuth só vale por 10 minutos — depois disso o callback força
 * reconectar em vez de aceitar um `code` velho. */
export const OAUTH_STATE_TTL_MS = 10 * 60_000;

export function isOAuthStateExpired(createdAt: string, now: number = Date.now()): boolean {
  return now - new Date(createdAt).getTime() > OAUTH_STATE_TTL_MS;
}
