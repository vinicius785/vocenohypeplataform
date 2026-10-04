import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DemoChip, DEMO_CHIP_LABEL } from "@/components/demo/DemoChip";
import { DemoActivityList } from "@/components/demo/DemoActivityList";
import { useCampaignDemo } from "@/components/demo/use-campaign-demo";
import { useDemoActions } from "@/components/demo/use-demo-actions";
import { DEMO_ACTION_LABEL, describeDemo, type DemoCardAction } from "@/lib/demo/demo-lead-view";
import { buildDemoTimeline } from "@/lib/demo/demo-timeline";
import type { Influ } from "@/lib/influencer-model";

const SECONDARY_ORDER: DemoCardAction[] = [
  "renovar",
  "novo_link",
  "reiniciar",
  "revogar",
  "encerrar",
];

/**
 * Controle da demonstração no cabeçalho da campanha: o selo "Ambiente de demonstração" vira um
 * botão que abre o estado (ativa, link expirado…), o link, a atividade recente e as ações
 * (reiniciar, renovar, revogar, encerrar). Se a sessão não puder ser lida, fica só o selo.
 */
export function CampaignDemoControl({
  campanhaId,
  influs,
}: {
  campanhaId: string;
  influs: Influ[];
}) {
  const { data, refetch } = useCampaignDemo(campanhaId);
  const session = data?.session ?? null;
  const actions = useDemoActions(session, () => refetch());
  const [open, setOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);

  if (!session) return <DemoChip />;

  const view = describeDemo(session, new Date());
  const busy = actions.pending !== null;
  const timeline = buildDemoTimeline(influs, data?.events ?? []);
  const secondary = SECONDARY_ORDER.filter((a) => view.menu.includes(a));

  const act = (a: DemoCardAction) => {
    setOpen(false);
    void actions.run(a);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="Gerenciar demonstração"
            title="Dados fictícios, isolados do restante da plataforma."
            className={`${badgeVariants({ variant: "info" })} cursor-pointer gap-1 hover:opacity-80`}
          >
            {DEMO_CHIP_LABEL}
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 space-y-3 p-3">
          <div className="space-y-1">
            <Badge variant={view.tone}>{view.statusLabel}</Badge>
            <p className="text-xs text-text-secondary">{view.summary}</p>
          </div>

          <div className="grid gap-1">
            {view.canShareLink && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  disabled={busy}
                  onClick={() => act("copiar_link")}
                >
                  {DEMO_ACTION_LABEL.copiar_link}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  disabled={busy}
                  onClick={() => act("abrir_cliente")}
                >
                  {DEMO_ACTION_LABEL.abrir_cliente}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => {
                setOpen(false);
                // Depois de o popover fechar: abrir o painel no mesmo instante o fecha junto
                // (o clique "fora" do popover chega ao painel recém-aberto).
                window.setTimeout(() => setActivityOpen(true), 0);
              }}
            >
              Ver atividade
            </Button>
          </div>

          {secondary.length > 0 && (
            <div className="grid gap-1 border-t border-border/60 pt-2">
              {secondary.map((a) => (
                <Button
                  key={a}
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => act(a)}
                  className={`justify-start ${a === "encerrar" || a === "revogar" ? "text-destructive hover:text-destructive" : ""}`}
                >
                  {DEMO_ACTION_LABEL[a]}
                </Button>
              ))}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <Sheet open={activityOpen} onOpenChange={setActivityOpen}>
        <SheetContent className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-[440px]">
          <SheetHeader>
            <SheetTitle>Atividade da demonstração</SheetTitle>
            <SheetDescription>
              O que o cliente e o time fizeram, do mais recente ao mais antigo.
            </SheetDescription>
          </SheetHeader>
          <DemoActivityList entries={timeline} />
        </SheetContent>
      </Sheet>

      {actions.confirmDialog}
    </>
  );
}
