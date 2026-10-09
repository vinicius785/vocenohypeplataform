/**
 * Escrita de reuniões pela sincronização com concorrência otimista.
 *
 * Problema: o ciclo lia as reuniões no início e gravava `data` inteiro a partir dessa cópia — minutos
 * depois, sobrescrevendo edições feitas por usuários nesse intervalo. Aqui cada escrita (1) relê a
 * linha, (2) aplica a mudança sobre a versão FRESCA e (3) grava só se `updated_at` ainda for o lido.
 *
 * Funciona com o banco atual: `reunioes` tem o trigger `BEFORE UPDATE … NEW.updated_at = now()`, que
 * muda `updated_at` em QUALQUER escrita (do app ou do servidor). Limite conhecido: isso protege as
 * edições do usuário contra a sincronização; a gravação do navegador continua "última escrita
 * vence" (INT-01) e não é tratada aqui.
 */

export type MeetingRow = { data: Record<string, unknown>; updated_at: string };

export type MeetingStore = {
  read(id: string): Promise<MeetingRow | null>;
  /** Grava `data` só se `updated_at` ainda for `expectedUpdatedAt`. */
  writeIfUnchanged(
    id: string,
    data: Record<string, unknown>,
    expectedUpdatedAt: string,
  ): Promise<"written" | "conflict" | "error">;
};

export type MeetingWriteResult = "written" | "unchanged" | "gone" | "conflict" | "error";

export const MEETING_WRITE_MAX_ATTEMPTS = 3;

/**
 * `mutate` recebe a versão fresca de `data` e devolve a nova (ou `null` para "nada a mudar").
 * Após `MEETING_WRITE_MAX_ATTEMPTS` conflitos seguidos devolve `conflict` SEM gravar: a próxima
 * rodada tenta de novo; nunca sobrescreve em silêncio.
 */
export async function updateMeetingData(
  store: MeetingStore,
  id: string,
  mutate: (fresh: Record<string, unknown>) => Record<string, unknown> | null,
  maxAttempts: number = MEETING_WRITE_MAX_ATTEMPTS,
): Promise<MeetingWriteResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let row: MeetingRow | null;
    try {
      row = await store.read(id);
    } catch {
      return "error";
    }
    if (!row) return "gone";

    const next = mutate(row.data);
    if (next === null || JSON.stringify(next) === JSON.stringify(row.data)) return "unchanged";

    let outcome: "written" | "conflict" | "error";
    try {
      outcome = await store.writeIfUnchanged(id, next, row.updated_at);
    } catch {
      return "error";
    }
    if (outcome !== "conflict") return outcome;
    // conflito: alguém gravou entre a leitura e a escrita → relê e reaplica
  }
  return "conflict";
}
