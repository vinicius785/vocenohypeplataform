/** Moldura da página pública de inscrição: cabeçalho e rodapé institucionais, sem nada do
 * workspace (sem sidebar/navegação interna). Só usa informações que existem no produto —
 * não há páginas de privacidade/termos/contato publicadas, então nenhum link é inventado. */
function Logo({ logo, nome, size }: { logo?: string; nome: string; size: "sm" | "md" }) {
  const box = size === "sm" ? "h-7 w-7 text-[11px]" : "h-8 w-8 text-xs";
  return (
    <div
      className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-foreground font-semibold text-background`}
    >
      {logo ? (
        <img src={logo} alt="" className="h-full w-full object-cover" />
      ) : (
        <span>{nome.charAt(0).toUpperCase()}</span>
      )}
    </div>
  );
}

export function PublicHeader({
  logo,
  nome,
  contexto,
}: {
  logo?: string;
  nome: string;
  contexto?: string;
}) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center gap-2.5 px-5">
        <Logo logo={logo} nome={nome} size="sm" />
        <span className="text-sm font-semibold text-foreground">{nome}</span>
        {contexto && (
          <>
            <span aria-hidden="true" className="text-text-secondary">
              /
            </span>
            <span className="min-w-0 truncate text-sm text-text-secondary">{contexto}</span>
          </>
        )}
      </div>
    </header>
  );
}

export function PublicFooter({
  logo,
  nome,
  className = "",
}: {
  logo?: string;
  nome: string;
  className?: string;
}) {
  return (
    <footer className={`border-t border-border bg-background ${className}`}>
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Logo logo={logo} nome={nome} size="md" />
          <div>
            <p className="text-sm font-semibold text-foreground">{nome}</p>
            <p className="text-xs text-text-secondary">
              Plataforma para gestão de campanhas com influenciadores.
            </p>
          </div>
        </div>
        <p className="text-xs text-text-secondary">
          © {new Date().getFullYear()} {nome}
        </p>
      </div>
    </footer>
  );
}
