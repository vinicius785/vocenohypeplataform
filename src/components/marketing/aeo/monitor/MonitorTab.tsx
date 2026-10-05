import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  AEO_IAS,
  type AeoIa,
  type AeoPrompt,
  type AeoResposta,
  type AeoRodada,
} from "@/lib/aeo-store";
import { computeRodadaProgresso } from "@/lib/aeo-engine";
import { Button } from "@/components/ui/button";
import { fmtDate } from "../aeo-ui-utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { RodadaProgressoCard } from "./RodadaProgressoCard";
import { NovaRodadaDialog } from "./NovaRodadaDialog";
import { IaTabs } from "./IaTabs";
import { PromptTable } from "./PromptTable";
import { RespostaDrawer } from "./RespostaDrawer";
import { NativeSelect } from "@/components/ui/native-select";

export function MonitorTab({
  rodadas,
  prompts,
  respostas,
}: {
  rodadas: AeoRodada[];
  prompts: AeoPrompt[];
  respostas: AeoResposta[];
}) {
  const ordenadas = useMemo(
    () => [...rodadas].sort((a, b) => b.dataRodada.localeCompare(a.dataRodada)),
    [rodadas],
  );
  const [rodadaId, setRodadaId] = useState(ordenadas[0]?.id ?? "");
  const rodadaAtualId = rodadaId || ordenadas[0]?.id || "";
  const [ia, setIa] = useState<AeoIa>(AEO_IAS[0]);
  const [novaRodadaOpen, setNovaRodadaOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const ativos = useMemo(() => prompts.filter((p) => p.ativo), [prompts]);
  const rodada = ordenadas.find((r) => r.id === rodadaAtualId);
  const rodadaComputada = rodada ? computeRodadaProgresso(rodada, prompts, respostas) : null;
  const selectedPrompt = ativos.find((p) => p.id === selectedPromptId) ?? null;

  if (ordenadas.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          compact
          title="Nenhuma rodada criada ainda."
          primaryAction={{ label: "Nova rodada", onClick: () => setNovaRodadaOpen(true) }}
        />
        <NovaRodadaDialog
          open={novaRodadaOpen}
          onOpenChange={setNovaRodadaOpen}
          onCreated={(r) => setRodadaId(r.id)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Rodada</span>
          <NativeSelect
            value={rodadaAtualId}
            onChange={(e) => setRodadaId(e.target.value)}
            aria-label="Rodada"
            size="sm"
          >
            {ordenadas.map((r) => (
              <option key={r.id} value={r.id}>
                {fmtDate(r.dataRodada)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button size="sm" variant="primary" onClick={() => setNovaRodadaOpen(true)}>
          <Plus className="h-3.5 w-3.5" /> Nova rodada
        </Button>
      </div>

      {rodadaComputada && <RodadaProgressoCard rodada={rodadaComputada} />}

      <IaTabs
        rodadaId={rodadaAtualId}
        ia={ia}
        onChange={setIa}
        prompts={prompts}
        respostas={respostas}
      />

      <PromptTable
        rodadaId={rodadaAtualId}
        ia={ia}
        ativos={ativos}
        respostas={respostas}
        onOpenPrompt={(p) => {
          setSelectedPromptId(p.id);
          setDrawerOpen(true);
        }}
      />

      <RespostaDrawer
        rodadaId={rodadaAtualId}
        ia={ia}
        prompt={selectedPrompt}
        ativos={ativos}
        respostas={respostas}
        open={drawerOpen && !!selectedPrompt}
        onOpenChange={setDrawerOpen}
        onNavigatePrompt={(p) => setSelectedPromptId(p.id)}
      />

      <NovaRodadaDialog
        open={novaRodadaOpen}
        onOpenChange={setNovaRodadaOpen}
        onCreated={(r) => setRodadaId(r.id)}
      />
    </div>
  );
}
