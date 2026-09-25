/**
 * Cabeçalho de página do Portal V2 — extraído byte-a-byte do que
 * `CampanhasV2.tsx` já usava (fonte da verdade). Usa `<p>`, nunca
 * `<h1>`/`<h2>`: `styles.css` tem uma regra global e proposital (fora de
 * `@layer`, sempre vence utilitário do Tailwind) deixando TODO h1-h4 da
 * plataforma com peso 300 — é assim que "Campanhas" consegue ficar em
 * negrito de verdade sem brigar com essa regra. Título/subtítulo de
 * qualquer página do Portal V2 devem usar este componente, nunca uma
 * tag de heading direta com classes parecidas.
 */
export function PortalPageHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <p className="text-[28px] font-bold leading-tight tracking-tight text-foreground md:text-[32px]">
        {title}
      </p>
      <p className="mt-1.5 text-sm text-text-secondary">{description}</p>
    </div>
  );
}
