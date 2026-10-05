/** Links de contato a partir dos dados já cadastrados (puro). */
export function whatsappUrl(phone?: string | null): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  // DDD + número (10/11 dígitos) ganha o 55 do Brasil; fora disso exige formato internacional.
  const full = digits.length === 10 || digits.length === 11 ? `55${digits}` : digits;
  return full.length >= 12 && full.length <= 15 ? `https://wa.me/${full}` : null;
}

export function mailtoUrl(email?: string | null): string | null {
  const e = (email ?? "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? `mailto:${e}` : null;
}
