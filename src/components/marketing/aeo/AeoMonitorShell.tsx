import { useEffect, useState } from "react";
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

type Tab = "monitor" | "resultados" | "prompts";

export function AeoMonitorShell() {
  const [tab, setTab] = useState<Tab>("monitor");
  const [rodadas, setRodadas] = useState<AeoRodada[]>(() => loadAeoRodadas());
  const [prompts, setPrompts] = useState<AeoPrompt[]>(() => loadAeoPrompts());
  const [respostas, setRespostas] = useState<AeoResposta[]>(() => loadAeoRespostas());

  useEffect(() => onAeoRodadasChange(() => setRodadas(loadAeoRodadas())), []);
  useEffect(() => onAeoPromptsChange(() => setPrompts(loadAeoPrompts())), []);
  useEffect(() => onAeoRespostasChange(() => setRespostas(loadAeoRespostas())), []);

  const tabs: { key: Tab; label: string }[] = [
    { key: "monitor", label: "Monitor" },
    { key: "resultados", label: "Resultados" },
    { key: "prompts", label: "Prompts" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "monitor" && (
        <MonitorTab rodadas={rodadas} prompts={prompts} respostas={respostas} />
      )}
      {tab === "resultados" && (
        <ResultadosTab rodadas={rodadas} prompts={prompts} respostas={respostas} />
      )}
      {tab === "prompts" && <PromptsTab prompts={prompts} />}
    </div>
  );
}
