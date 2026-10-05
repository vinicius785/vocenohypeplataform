import { useMemo, useState } from "react";
import type { AeoPrompt, AeoResposta, AeoRodada } from "@/lib/aeo-store";
import { fmtDate } from "../aeo-ui-utils";
import { EmptyState } from "@/components/shared/EmptyState";
import { KpiCards } from "./KpiCards";
import { VisibilidadePorIa } from "./VisibilidadePorIa";
import { VisibilidadePorCategoria } from "./VisibilidadePorCategoria";
import { EvolucaoChart } from "./EvolucaoChart";
import { OportunidadesSection } from "./OportunidadesSection";
import { ConcorrentesSection } from "./ConcorrentesSection";
import { PromptsSemPresencaCard } from "./PromptsSemPresencaCard";
import { NativeSelect } from "@/components/ui/native-select";

export function ResultadosTab({
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
  const idx = ordenadas.findIndex((r) => r.id === rodadaAtualId);
  const [comparacaoId, setComparacaoId] = useState<string>("");
  const comparacaoAtualId = comparacaoId || (idx >= 0 ? ordenadas[idx + 1]?.id : undefined) || "";

  if (ordenadas.length === 0) {
    return (
      <EmptyState compact title="Nenhuma rodada registrada ainda — crie uma em Monitoramento." />
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
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
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">Comparar com</span>
          <NativeSelect
            value={comparacaoAtualId}
            onChange={(e) => setComparacaoId(e.target.value)}
            aria-label="Comparar com a rodada"
            size="sm"
          >
            <option value="">Nenhuma</option>
            {ordenadas
              .filter((r) => r.id !== rodadaAtualId)
              .map((r) => (
                <option key={r.id} value={r.id}>
                  {fmtDate(r.dataRodada)}
                </option>
              ))}
          </NativeSelect>
        </div>
      </div>

      <KpiCards
        respostas={respostas}
        rodadaId={rodadaAtualId}
        rodadaComparacaoId={comparacaoAtualId || undefined}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <VisibilidadePorIa
          respostas={respostas}
          rodadaId={rodadaAtualId}
          rodadaComparacaoId={comparacaoAtualId || undefined}
        />
        <VisibilidadePorCategoria
          respostas={respostas}
          prompts={prompts}
          rodadaId={rodadaAtualId}
        />
      </div>

      <EvolucaoChart rodadas={ordenadas} respostas={respostas} />

      <OportunidadesSection rodadaId={rodadaAtualId} prompts={prompts} respostas={respostas} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ConcorrentesSection respostas={respostas} prompts={prompts} rodadaId={rodadaAtualId} />
        <PromptsSemPresencaCard respostas={respostas} prompts={prompts} rodadaId={rodadaAtualId} />
      </div>
    </div>
  );
}
