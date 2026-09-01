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
import { inputCls, fmtDate } from "../aeo-ui-utils";
import { RodadaProgressoCard } from "./RodadaProgressoCard";
import { NovaRodadaDialog } from "./NovaRodadaDialog";
import { IaTabs } from "./IaTabs";
import { PromptTable } from "./PromptTable";
import { RespostaDrawer } from "./RespostaDrawer";

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
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setNovaRodadaOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> Nova rodada
          </Button>
        </div>
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma rodada criada ainda.
        </p>
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
          <label className="text-xs text-muted-foreground">Rodada</label>
          <select
            value={rodadaAtualId}
            onChange={(e) => setRodadaId(e.target.value)}
            className={inputCls}
          >
            {ordenadas.map((r) => (
              <option key={r.id} value={r.id}>
                {fmtDate(r.dataRodada)}
              </option>
            ))}
          </select>
        </div>
        <Button size="sm" onClick={() => setNovaRodadaOpen(true)}>
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
