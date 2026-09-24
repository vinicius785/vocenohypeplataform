import type { ReactNode } from "react";

/**
 * Shell exclusivo da tela de login (`routes/index.tsx`) — refeito pra
 * seguir o mockup de referência do usuário (poster de marca): painel
 * claro à esquerda com a frase de marca, painel escuro à direita com um
 * cartão branco central (o formulário) e o logo oficial embaixo dele.
 * Cores fixas (não seguem o tema claro/escuro do resto do app de
 * propósito — é uma peça de identidade visual, como um poster, não uma
 * tela que deveria virar preta se o usuário estiver no tema claro do
 * sistema).
 *
 * Frase e logo são os ARQUIVOS ORIGINAIS enviados pelo usuário
 * (`public/brand/frase-transformamos.png` e `public/brand/logo-arco.png`)
 * — nunca uma recriação em SVG/fonte, que já tinha ficado divergente do
 * original numa rodada anterior.
 */
export function LoginScreenShell({
  eyebrow,
  children,
}: {
  /** Rótulo pequeno mostrado acima do cartão, no painel escuro — varia
   * por etapa (login/recuperação/verificação); omitir esconde a linha. */
  eyebrow?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-[#0a0a0a] lg:flex-row">
      {/* Painel claro — frase de marca, alinhada à esquerda. */}
      <div className="relative z-10 flex shrink-0 flex-col justify-center bg-[#f1efec] px-8 py-12 sm:px-12 lg:w-1/2 lg:rounded-r-[56px] lg:px-20 lg:py-16 xl:w-[52%]">
        <img
          src="/brand/frase-transformamos.png"
          alt="Transformamos sua marca em assunto."
          className="w-[220px] sm:w-[260px] lg:w-[300px]"
        />
      </div>

      {/* Painel escuro — rótulo, cartão branco central, logo embaixo. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-7 px-6 py-12 sm:gap-8 lg:py-16">
        {eyebrow && <p className="text-sm font-medium tracking-tight text-white/55">{eyebrow}</p>}

        <div className="w-full max-w-[420px] rounded-[28px] bg-white px-7 py-9 shadow-[0_32px_80px_-24px_rgba(0,0,0,0.6)] sm:px-9 sm:py-10">
          {children}
        </div>

        <img src="/brand/logo-arco.png" alt="Você no Hype" className="h-5 w-auto opacity-90" />
      </div>
    </div>
  );
}
