import { Construction } from "lucide-react";

/**
 * Placeholder honesto — nunca finge que a seção existe. Usado só pelas
 * áreas da V2 ainda não construídas nesta fatia (ver relatório final da
 * sessão para o que falta de verdade).
 */
export function ComingSoonSection({ title }: { title: string }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <h1 className="text-xl font-semibold text-foreground">{title}</h1>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-6 py-16 text-center">
        <Construction className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Esta área da V2 ainda está em construção nesta etapa.
        </p>
      </div>
    </div>
  );
}
