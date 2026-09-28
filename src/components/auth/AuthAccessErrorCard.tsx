/** Erro/timeout ao preparar o ambiente — nunca um loading infinito nem um
 * loop de redirecionamento. `kind: "timeout"` cobre a preparação
 * demorando demais OU falhando de verdade (mesma copy, mesmo detalhe
 * técnico nunca exposto ao usuário); `kind: "no-access"` cobre uma conta
 * autenticada sem nenhum vínculo/ambiente resolvível. */
export function AuthAccessErrorCard({
  kind,
  onRetry,
  onSignOut,
}: {
  kind: "timeout" | "no-access";
  onRetry: () => void;
  onSignOut: () => void;
}) {
  const copy =
    kind === "timeout"
      ? {
          title: "Não foi possível preparar seu ambiente",
          description: "Tivemos um problema ao carregar os dados da sua conta.",
        }
      : {
          title: "Seu acesso ainda não está configurado",
          description: "Sua conta foi autenticada, mas ainda não encontramos um acesso disponível.",
        };

  return (
    <div className="py-2 text-center">
      <p className="text-lg font-semibold tracking-tight text-[#111111]">{copy.title}</p>
      <p className="mt-1.5 text-sm text-[#6b6862]">{copy.description}</p>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        {kind === "timeout" && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--brand)] px-5 text-sm font-medium text-[var(--brand-foreground)] transition-colors hover:bg-[var(--brand-hover)]"
          >
            Tentar novamente
          </button>
        )}
        <button
          type="button"
          onClick={onSignOut}
          className="inline-flex h-11 items-center justify-center rounded-full border border-[#e2e0dc] px-5 text-sm font-medium text-[#111111] transition-colors hover:bg-[#f1efec]"
        >
          Sair
        </button>
      </div>
    </div>
  );
}
