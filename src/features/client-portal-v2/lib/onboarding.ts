import { formatPhoneBR } from "@/lib/influencer-model";

/** Regras puras do onboarding de primeiro acesso (sem UI, sem banco). */

/** Quando mostrar: só se a coluna existe e ainda está vazia. Qualquer dúvida (coluna ausente, erro de
 * rede) → NÃO mostra, para nunca bloquear o portal por falha do próprio onboarding. */
export type OnboardingState = "needed" | "done" | "unknown";
export function onboardingStateFrom(
  value: string | null | undefined,
  failed: boolean,
): OnboardingState {
  if (failed) return "unknown";
  return value ? "done" : "needed";
}

export function phoneDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** Telefone BR: DDD válido (11–99) + 8 ou 9 dígitos; celular de 11 dígitos começa com 9. */
export function isValidPhoneBR(raw: string): boolean {
  const d = phoneDigits(raw);
  if (d.length !== 10 && d.length !== 11) return false;
  const ddd = Number(d.slice(0, 2));
  if (ddd < 11 || ddd > 99) return false;
  if (d.length === 11 && d[2] !== "9") return false;
  return true;
}

export type OnboardingErrors = { name?: string; phone?: string };

export function validateOnboarding(input: { name: string; phone: string }): OnboardingErrors {
  const errors: OnboardingErrors = {};
  if (input.name.trim().length < 2) errors.name = "Informe seu nome.";
  if (!input.phone.trim()) errors.phone = "Informe seu telefone.";
  else if (!isValidPhoneBR(input.phone)) errors.phone = "Informe um telefone válido com DDD.";
  return errors;
}

/** Telefone já salvo (qualquer formato antigo) → formato de exibição/edição. */
export function phoneForInput(saved: string | null | undefined): string {
  return saved ? formatPhoneBR(saved) : "";
}
export { formatPhoneBR };
