/**
 * Classes de formulário compartilhadas por TODA tela dentro do
 * `LoginScreenShell` (login, MFA, recuperação, criar senha) — extraídas
 * daqui pra fora pra nunca mais divergir entre telas (era exatamente o
 * caso antes: `criar-senha.tsx` tinha seu próprio `inputBase` que seguia
 * o tema claro/escuro do usuário, enquanto o card do shell é sempre
 * claro). Cores fixas de propósito — mesma peça de identidade visual do
 * card branco, nunca invertendo pro escuro.
 */
export const authInputBase =
  "h-13 w-full rounded-xl border border-[#e2e0dc] bg-[#faf9f7] text-[15px] text-[#111111] outline-none " +
  "transition-colors placeholder:text-[#9a978f] hover:border-[#c9c6c0] " +
  "focus:border-[var(--brand)] focus:ring-4 focus:ring-[var(--brand)]/20 " +
  "aria-[invalid=true]:border-red-400 aria-[invalid=true]:focus:ring-red-400/20";

export const authPrimaryButtonBase =
  "inline-flex h-13 w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] " +
  "text-[15px] font-semibold text-[var(--brand-foreground)] shadow-[0_8px_24px_-8px_var(--brand)] " +
  "transition-all duration-200 hover:bg-[var(--brand-hover)] hover:shadow-[0_10px_28px_-8px_var(--brand)] " +
  "active:scale-[0.99] active:brightness-95 focus-visible:outline-none focus-visible:ring-4 " +
  "focus-visible:ring-[var(--brand)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-white " +
  "disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none disabled:active:scale-100";

export const authLabelBase = "mb-2 block text-[13px] font-medium text-[#4b4942]";
export const authSecondaryLinkBase =
  "text-[13px] font-medium text-[var(--brand)] hover:underline underline-offset-2";
export const authIconMuted = "text-[#9a978f]";
