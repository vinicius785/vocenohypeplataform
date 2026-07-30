import { Lock } from "lucide-react";

/** Placeholder "apagado" mostrado no lugar de uma seção/aba quando o usuário
 * atual não tem a permissão necessária — o conteúdo real nem chega a
 * renderizar (a checagem fica em quem usa este componente), então isso não
 * é só um blur visual por cima de dados sensíveis. */
export function LockedSection({ title }: { title: string }) {
  return (
    <div className="flex select-none flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 px-6 py-24 text-center opacity-60">
      <Lock className="h-8 w-8 text-muted-foreground" strokeWidth={1.5} />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Você não tem permissão para acessar esta seção. Fale com um administrador se precisar de
          acesso.
        </p>
      </div>
    </div>
  );
}
