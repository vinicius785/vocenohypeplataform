export function formatSeguidores(value?: string): string {
  if (!value) return "";
  const n = Number(value.replace(/\D/g, ""));
  if (!n) return "";
  return n.toLocaleString("pt-BR");
}
