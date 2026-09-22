import { normalizeEmail, normalizePhoneDigits, isDuplicateProfile } from "@/lib/social-profiles";

/**
 * Dedup do fluxo "Adicionar do banco" (`InfluencerBoard.tsx`'s
 * `BankPickerDialog`) — antes comparava só `nome` em minúsculas
 * (`alreadyAdded={influs.map((i) => i.nome.trim().toLowerCase())}`), o que
 * falha sempre que o nome de exibição varia entre duas inclusões da mesma
 * pessoa (ex.: "allan vaz" vs "Allan Neumann Vaz") — causa confirmada de
 * duplicatas reais em produção (`campanha_influenciadores`).
 *
 * Reusa as MESMAS normalizações já usadas por `submitInscricaoCampanha`
 * (`normalizeEmail`/`normalizePhoneDigits`/`isDuplicateProfile`, todas em
 * `social-profiles.ts`) — nunca uma segunda implementação paralela — pra
 * que "mesma pessoa" signifique a mesma coisa nos dois fluxos.
 *
 * Tipos estruturais mínimos (não importam de `InfluencerBoard.tsx` nem de
 * `banco-influs-store.ts`) pra manter este módulo puro e testável sem
 * puxar o board inteiro.
 */

type RedeLike = { id: string; plataforma: string; handle: string };

export type MatchableInflu = {
  nome: string;
  telefone?: string;
  email?: string;
  redes: RedeLike[];
};

/**
 * Decide se `candidate` (um `BankInflu` sendo considerado no picker) já
 * está presente em `currentInflus` (os influenciadores já adicionados à
 * campanha). Critério primário/autoritativo = identidade: mesmo e-mail
 * normalizado, OU mesmo telefone normalizado, OU mesma (plataforma,
 * handle) normalizada em qualquer rede. Nome continua como sinal adicional
 * (cadastros do banco sem contato/rede nenhum ainda precisam de algo pra
 * comparar) — nunca o único critério.
 *
 * Retorna o influenciador já-adicionado que bateu, ou `null` se nenhum.
 */
export function findExistingBankInfluMatch<T extends MatchableInflu>(
  candidate: MatchableInflu,
  currentInflus: readonly T[],
): T | null {
  const candidateEmail = candidate.email ? normalizeEmail(candidate.email) : null;
  const candidatePhone = candidate.telefone ? normalizePhoneDigits(candidate.telefone) : null;
  const candidateName = candidate.nome.trim().toLowerCase();

  for (const existing of currentInflus) {
    const existingEmail = existing.email ? normalizeEmail(existing.email) : null;
    if (candidateEmail && existingEmail && candidateEmail === existingEmail) return existing;

    const existingPhone = existing.telefone ? normalizePhoneDigits(existing.telefone) : null;
    if (candidatePhone && existingPhone && candidatePhone === existingPhone) return existing;

    const socialMatches = candidate.redes.some((cr) =>
      existing.redes.some(
        (er) =>
          er.plataforma === cr.plataforma && isDuplicateProfile([er], er.plataforma, cr.handle),
      ),
    );
    if (socialMatches) return existing;

    if (candidateName && existing.nome.trim().toLowerCase() === candidateName) return existing;
  }

  return null;
}
