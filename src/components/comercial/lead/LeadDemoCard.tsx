import { MoreVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DEMO_ACTION_LABEL, describeDemo, type DemoCardAction } from "@/lib/demo/demo-lead-view";
import type { DemoSessionView } from "@/lib/demo/demo-types";

/**
 * Seção "Demonstração" da ficha do lead — só apresentação (os dados e as ações vêm de
 * `LeadDemoSection`). Sem demo: um convite curto e o botão de criar. Com demo: o estado, o
 * resumo, "Abrir campanha" e o menu •••.
 *
 * "Copiar link" entra junto com a rota `/demo/$token` (Etapa 4): copiar agora entregaria um
 * link que ainda não abre.
 */
export function LeadDemoCardView({
  session,
  now,
  pending,
  onCreate,
  onAction,
}: {
  session: DemoSessionView | null;
  now: Date;
  /** Ação em andamento (desabilita os botões). */
  pending: DemoCardAction | "criar" | null;
  onCreate: () => void;
  onAction: (action: DemoCardAction) => void;
}) {
  const busy = pending !== null;
  const view = session ? describeDemo(session, now) : null;

  return (
    <section aria-label="Demonstração" className="space-y-3 border-t border-border/60 pt-5">
      <p role="heading" aria-level={3} className="text-[15px] font-semibold text-foreground">
        Demonstração
      </p>

      {!session || !view ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-text-secondary">
            Crie uma campanha de demonstração, com dados fictícios, para mostrar o fluxo ao cliente
            ao vivo.
          </p>
          <Button
            variant="secondary"
            size="sm"
            isLoading={pending === "criar"}
            disabled={busy}
            onClick={onCreate}
          >
            Criar demonstração
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <Badge variant={view.tone}>{view.statusLabel}</Badge>
            <p className="text-sm text-text-secondary">{view.summary}</p>
          </div>
          <div className="flex items-center gap-2">
            {view.canCreateNew ? (
              <Button
                variant="secondary"
                size="sm"
                isLoading={pending === "criar"}
                disabled={busy}
                onClick={onCreate}
              >
                Criar nova demonstração
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => onAction("abrir")}>
              {DEMO_ACTION_LABEL.abrir}
            </Button>
            {view.menu.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    aria-label="Mais ações da demonstração"
                    disabled={busy}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {view.menu.map((action, i) => (
                    <div key={action}>
                      {(action === "revogar" || action === "encerrar") &&
                        i > 0 &&
                        view.menu[i - 1] !== "revogar" && <DropdownMenuSeparator />}
                      <DropdownMenuItem
                        onSelect={() => onAction(action)}
                        className={
                          action === "encerrar" || action === "revogar"
                            ? "text-destructive focus:text-destructive"
                            : undefined
                        }
                      >
                        {DEMO_ACTION_LABEL[action]}
                      </DropdownMenuItem>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
