export const CONNECT_RESULTS = [
  "ok",
  "negado",
  "expirado",
  "invalido",
  "permissao",
  "erro",
] as const;
export type ConnectResult = (typeof CONNECT_RESULTS)[number];

/** Status vindo da URL: qualquer valor fora da lista vira "inválido" (nunca é exibido como veio). */
export const parseConnectResult = (v: unknown): ConnectResult =>
  typeof v === "string" && (CONNECT_RESULTS as readonly string[]).includes(v)
    ? (v as ConnectResult)
    : "invalido";
