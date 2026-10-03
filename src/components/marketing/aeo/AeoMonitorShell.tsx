import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  loadAeoPrompts,
  loadAeoRespostas,
  loadAeoRodadas,
  onAeoPromptsChange,
  onAeoRespostasChange,
  onAeoRodadasChange,
  type AeoPrompt,
  type AeoResposta,
  type AeoRodada,
} from "@/lib/aeo-store";
import { MonitorTab } from "./monitor/MonitorTab";
import { ResultadosTab } from "./resultados/ResultadosTab";
import { PromptsTab } from "./prompts/PromptsTab";

/** Subseção do AEO Monitor — não é navegação (nada de abas): são partes da
 * MESMA seção do Projeto, empilhadas e recolhíveis. Monitoramento e
 * Resultados abrem expandidos; Prompts (configuração) fica recolhido. */
function Part({
  title,
  hint,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t border-border/60 pt-4">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span>
            <span className="block text-[15px] font-semibold text-foreground">{title}</span>
            {hint && <span className="block text-sm text-text-secondary">{hint}</span>}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">{children}</CollapsibleContent>
    </Collapsible>
  );
}

export function AeoMonitorShell() {
  const [rodadas, setRodadas] = useState<AeoRodada[]>(() => loadAeoRodadas());
  const [prompts, setPrompts] = useState<AeoPrompt[]>(() => loadAeoPrompts());
  const [respostas, setRespostas] = useState<AeoResposta[]>(() => loadAeoRespostas());

  useEffect(() => onAeoRodadasChange(() => setRodadas(loadAeoRodadas())), []);
  useEffect(() => onAeoPromptsChange(() => setPrompts(loadAeoPrompts())), []);
  useEffect(() => onAeoRespostasChange(() => setRespostas(loadAeoRespostas())), []);

  return (
    <div className="space-y-5">
      <Part title="Monitoramento" hint="Rodada atual e respostas por IA.">
        <MonitorTab rodadas={rodadas} prompts={prompts} respostas={respostas} />
      </Part>
      <Part title="Resultados" hint="Visibilidade da marca ao longo das rodadas.">
        <ResultadosTab rodadas={rodadas} prompts={prompts} respostas={respostas} />
      </Part>
      <Part title="Prompts" hint="Perguntas usadas em cada rodada." defaultOpen={false}>
        <PromptsTab prompts={prompts} />
      </Part>
    </div>
  );
}
