/**
 * Lógica do botão Conectar/Reconectar, sem React: transforma o resultado (ou a falha) de
 * `startGoogleOAuth` num destino ou numa mensagem clara. Antes, qualquer erro era engolido e o
 * botão apenas voltava ao normal.
 */

export type StartGoogleOAuthResult =
  | { ok: true; url: string }
  | { ok: false; error: "forbidden" | "not_configured" | "unavailable" };

export type ConnectOutcome = { kind: "redirect"; url: string } | { kind: "error"; message: string };

export const CONNECT_ERROR_MESSAGES = {
  forbidden: "Somente membros da equipe podem conectar o Google Agenda.",
  not_configured:
    "A integração com o Google não está configurada neste ambiente. Avise um administrador.",
  unavailable: "Não foi possível iniciar a conexão agora. Tente novamente em instantes.",
  network: "Não foi possível falar com o servidor. Verifique sua internet e tente novamente.",
  invalid_destination: "Recebemos um destino de conexão inválido. Tente novamente.",
} as const;

/** Só segue para http(s): nunca `javascript:`/`data:`. */
function isSafeDestination(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export async function runGoogleConnect(
  start: () => Promise<StartGoogleOAuthResult>,
): Promise<ConnectOutcome> {
  let result: StartGoogleOAuthResult;
  try {
    result = await start();
  } catch {
    return { kind: "error", message: CONNECT_ERROR_MESSAGES.network };
  }
  if (!result.ok) {
    return { kind: "error", message: CONNECT_ERROR_MESSAGES[result.error] };
  }
  if (!isSafeDestination(result.url)) {
    return { kind: "error", message: CONNECT_ERROR_MESSAGES.invalid_destination };
  }
  return { kind: "redirect", url: result.url };
}

/** Motivos que o callback devolve em `?reason=` (lista fechada: o que não estiver aqui vira genérico). */
const CALLBACK_REASON_MESSAGES: Record<string, string> = {
  denied: "A autorização foi cancelada ou não foi concluída no Google. Tente conectar de novo.",
  state: "A tentativa de conexão expirou ou já foi usada. Inicie a conexão novamente.",
  config: "A integração com o Google não está configurada corretamente. Avise um administrador.",
  exchange:
    "O Google recusou a conclusão da conexão. Tente de novo; se persistir, avise um administrador.",
  no_refresh: "O Google não liberou o acesso contínuo. Tente de novo e aceite todas as permissões.",
  save: "A conta foi autorizada, mas não conseguimos salvar a conexão. Tente de novo.",
};

export function messageForCallbackReason(reason: string | null | undefined): string {
  // `hasOwn`: o `reason` vem da URL — chaves como "constructor" não podem virar mensagem.
  if (reason && Object.prototype.hasOwnProperty.call(CALLBACK_REASON_MESSAGES, reason)) {
    return CALLBACK_REASON_MESSAGES[reason];
  }
  return "Não foi possível conectar sua conta Google. Tente novamente.";
}

/** Código interno do callback → `reason` curto e seguro para a URL. */
export function reasonForErrorCode(code: string): keyof typeof CALLBACK_REASON_MESSAGES {
  switch (code) {
    case "google_denied_or_missing_params":
      return "denied";
    case "state_invalid_or_reused":
    case "state_expired":
    case "state_not_bound_to_browser":
      return "state";
    case "app_url_invalid":
    case "env_missing":
      return "config";
    case "token_exchange_failed":
      return "exchange";
    case "no_refresh_token":
      return "no_refresh";
    default:
      return "save";
  }
}
