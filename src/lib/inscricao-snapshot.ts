/** "Inscrição original" em linguagem humana, a partir do `inscricaoSnapshot` (cópia imutável do que
 * o influenciador enviou). Puro e testável: a tela só desenha o resultado. O JSON bruto fica numa
 * camada técnica secundária, nunca como apresentação principal. */
export type SnapshotView = {
  contato: { label: string; value: string }[];
  redes: { plataforma: string; handle: string; seguidores?: string }[];
  mensagem?: string;
  respostas: { questionId: string; label: string; value: string | string[]; fieldType?: string }[];
};

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

export function describeInscricaoSnapshot(snapshot: Record<string, unknown>): SnapshotView {
  const contato: SnapshotView["contato"] = [];
  for (const [label, key] of [
    ["Nome", "nome"],
    ["Telefone", "telefone"],
    ["E-mail", "email"],
    ["Nicho", "nicho"],
  ] as const) {
    const value = str(snapshot[key]);
    if (value) contato.push({ label, value });
  }
  const redes = (Array.isArray(snapshot.redes) ? snapshot.redes : [])
    .map((r) => r as Record<string, unknown>)
    .filter((r) => str(r.plataforma) && str(r.handle))
    .map((r) => ({
      plataforma: str(r.plataforma)!,
      handle: str(r.handle)!,
      seguidores: str(r.seguidores),
    }));
  const respostas = (Array.isArray(snapshot.respostas) ? snapshot.respostas : [])
    .map((r) => r as Record<string, unknown>)
    .filter((r) => str(r.label) && r.value !== undefined && r.value !== "")
    .filter((r) => !(Array.isArray(r.value) && r.value.length === 0))
    .map((r) => ({
      questionId: String(r.questionId ?? r.label),
      label: str(r.label)!,
      value: r.value as string | string[],
      fieldType: str(r.fieldType),
    }));
  return { contato, redes, mensagem: str(snapshot.mensagem), respostas };
}
