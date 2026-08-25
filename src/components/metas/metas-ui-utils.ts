/** Pequenos helpers puros compartilhados entre os componentes de Metas —
 * evita duplicar entre `MetasSection`, `MetaCard`, os diálogos etc. */

export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-teal-500",
];

export function colorFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString("pt-BR");
}

/** Formata um valor numérico de acordo com o tipo de medição do
 * indicador — única função que decide "63" vira "63%" ou "R$ 63" ou
 * "63 clientes", reaproveitada em todo lugar que mostra um valor de
 * indicador (evita cada card formatando na mão, diferente um do outro). */
export function formatIndicadorValor(
  tipo: "numero" | "percentual" | "moeda" | "min" | "max" | "binario" | "marco" | "manual",
  value: number | undefined,
  unidade?: string,
): string {
  if (value == null) return "—";
  if (tipo === "percentual") return `${value.toLocaleString("pt-BR")}%`;
  if (tipo === "moeda") return `R$ ${value.toLocaleString("pt-BR")}`;
  const suffix = unidade ? ` ${unidade}` : "";
  return `${value.toLocaleString("pt-BR")}${suffix}`;
}
