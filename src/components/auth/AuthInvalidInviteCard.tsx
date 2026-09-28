/** Convite/link de recuperação inválido ou expirado — mesmo card branco
 * do resto do fluxo, nunca um formulário inutilizável (campos que vão
 * falhar ao enviar). Sem "Solicitar novo convite": não existe hoje um
 * fluxo real e seguro de autoatendimento pra isso (convites são
 * enviados pela equipe interna) — mostrar esse botão seria prometer uma
 * ação que o backend não sustenta. */
export function AuthInvalidInviteCard({ onBackToLogin }: { onBackToLogin: () => void }) {
  return (
    <div className="py-2 text-center">
      <p className="text-lg font-semibold tracking-tight text-[#111111]">
        Este convite não é mais válido
      </p>
      <p className="mt-1.5 text-sm text-[#6b6862]">
        O link pode ter expirado ou já ter sido utilizado.
      </p>
      <button
        type="button"
        onClick={onBackToLogin}
        className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-[#e2e0dc] px-4 py-2 text-xs font-medium text-[#111111] transition-colors hover:bg-[#f1efec]"
      >
        Voltar para o login
      </button>
    </div>
  );
}
