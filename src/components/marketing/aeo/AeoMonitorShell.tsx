import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageHeader } from "@/components/shared/PageHeader";
import {
  loadAeoPrompts,
  loadAeoRespostas,
  loadAeoRodadas,
  onAeoPromptsChange,
  onAeoRespostasChange,
  onAeoRodadasChange,
  type AeoIa,
  type AeoPrompt,
  type AeoResposta,
  type AeoRodada,
} from "@/lib/aeo-store";
import { computeRodadaProgresso } from "@/lib/aeo-engine";
import { fmtDate } from "./aeo-ui-utils";
import { NovaRodadaDialog } from "./monitor/NovaRodadaDialog";
import { RodadaProgressoCard } from "./monitor/RodadaProgressoCard";
import { PromptTable, type IaFiltro, type PromptFiltro } from "./monitor/PromptTable";
import { RespostaDrawer } from "./monitor/RespostaDrawer";
import { ResumoRodada } from "./resultados/ResumoRodada";
import { VisibilidadePorIa } from "./resultados/VisibilidadePorIa";
import { VisibilidadePorCategoria } from "./resultados/VisibilidadePorCategoria";
import { OportunidadesSection } from "./resultados/OportunidadesSection";
import { EvolucaoChart } from "./resultados/EvolucaoChart";
import { ConcorrentesSection } from "./resultados/ConcorrentesSection";
import { PromptsTab } from "./prompts/PromptsTab";

function SectionTitle({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
      {children}
    </h2>
  );
}

/** Catálogo de perguntas (configuração) — recolhido: não compete com a análise. */
function Gerenciar({ prompts }: { prompts: AeoPrompt[] }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <span>
            <span className="block text-[15px] font-semibold text-foreground">
              Gerenciar prompts
            </span>
            <span className="block text-sm text-text-secondary">
              O catálogo de perguntas usadas em cada rodada.
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-text-secondary transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-4">
        <PromptsTab prompts={prompts} />
      </CollapsibleContent>
    </Collapsible>
  );
}

/** AEO Monitor V2 — de cima para baixo: RESULTADO (resumo) → INTERPRETAÇÃO (visibilidade por
 * IA/categoria, oportunidades, evolução, concorrentes) → DETALHAMENTO (prompts). A rodada e a
 * comparação são o contexto único da página; a IA é uma dimensão de filtro, não navegação. */
export function AeoMonitorShell() {
  const [rodadas, setRodadas] = useState<AeoRodada[]>(() => loadAeoRodadas());
  const [prompts, setPrompts] = useState<AeoPrompt[]>(() => loadAeoPrompts());
  const [respostas, setRespostas] = useState<AeoResposta[]>(() => loadAeoRespostas());

  useEffect(() => onAeoRodadasChange(() => setRodadas(loadAeoRodadas())), []);
  useEffect(() => onAeoPromptsChange(() => setPrompts(loadAeoPrompts())), []);
  useEffect(() => onAeoRespostasChange(() => setRespostas(loadAeoRespostas())), []);

  const ordenadas = useMemo(
    () => [...rodadas].sort((a, b) => b.dataRodada.localeCompare(a.dataRodada)),
    [rodadas],
  );
  const [rodadaId, setRodadaId] = useState("");
  const rodadaAtualId = ordenadas.some((r) => r.id === rodadaId)
    ? rodadaId
    : (ordenadas[0]?.id ?? "");
  const idx = ordenadas.findIndex((r) => r.id === rodadaAtualId);
  // `undefined` = automática (a rodada anterior); "" = "Nenhuma" escolhida de propósito.
  const [comparacao, setComparacao] = useState<string | undefined>(undefined);
  const comparacaoAtualId =
    comparacao !== undefined && ordenadas.some((r) => r.id === comparacao && r.id !== rodadaAtualId)
      ? comparacao
      : comparacao === ""
        ? ""
        : (ordenadas[idx + 1]?.id ?? "");

  const [novaRodadaOpen, setNovaRodadaOpen] = useState(false);
  const [ia, setIa] = useState<IaFiltro>("todos");
  const [filtro, setFiltro] = useState<PromptFiltro>("todos");
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [drawerIa, setDrawerIa] = useState<AeoIa>("ChatGPT");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const ativos = useMemo(() => prompts.filter((p) => p.ativo), [prompts]);
  const rodada = ordenadas.find((r) => r.id === rodadaAtualId);
  const rodadaComputada = rodada ? computeRodadaProgresso(rodada, prompts, respostas) : null;
  const selectedPrompt = ativos.find((p) => p.id === selectedPromptId) ?? null;
  const temRespostas = respostas.some((r) => r.rodadaId === rodadaAtualId);

  const verPrompts = (f: PromptFiltro) => {
    setIa("todos");
    setFiltro(f);
    document.getElementById("aeo-prompts")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const header = (
    <PageHeader
      title="AEO Monitor"
      description="Monitoramento da presença da marca nas respostas de IA."
      actionsSlot={
        <Button variant="primary" size="comfortable" onClick={() => setNovaRodadaOpen(true)}>
          <Plus className="h-4 w-4" /> Nova rodada
        </Button>
      }
    />
  );
  const dialog = (
    <NovaRodadaDialog
      open={novaRodadaOpen}
      onOpenChange={setNovaRodadaOpen}
      onCreated={(r) => setRodadaId(r.id)}
    />
  );

  if (ordenadas.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          compact
          title="Nenhuma rodada criada ainda."
          description="Crie uma rodada para começar a registrar as respostas das IAs."
          primaryAction={{ label: "Nova rodada", onClick: () => setNovaRodadaOpen(true) }}
        />
        {dialog}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {header}

      {/* Contexto: ‹ Rodada › + status + comparação. Um controle só, não uma toolbar. */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div role="group" aria-label="Rodada" className="inline-flex items-center">
            <button
              type="button"
              aria-label="Rodada anterior"
              disabled={idx >= ordenadas.length - 1}
              onClick={() => setRodadaId(ordenadas[idx + 1].id)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span
              aria-live="polite"
              className="min-w-[10rem] text-center text-sm font-medium text-foreground"
            >
              Rodada {rodada ? fmtDate(rodada.dataRodada) : "—"}
            </span>
            <button
              type="button"
              aria-label="Próxima rodada"
              disabled={idx <= 0}
              onClick={() => setRodadaId(ordenadas[idx - 1].id)}
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {rodadaComputada?.status === "concluida" && (
            <span className="text-sm text-text-secondary">Concluída · 100%</span>
          )}
          {ordenadas.length > 1 && (
            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="text-sm text-text-secondary">Comparar com</span>
              <NativeSelect
                value={comparacaoAtualId}
                onChange={(e) => setComparacao(e.target.value)}
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
          )}
        </div>
        {rodadaComputada && rodadaComputada.status !== "concluida" && (
          <RodadaProgressoCard rodada={rodadaComputada} />
        )}
      </div>

      {temRespostas ? (
        <>
          <section aria-labelledby="aeo-resumo" className="space-y-3">
            <SectionTitle id="aeo-resumo">Resumo</SectionTitle>
            <ResumoRodada
              respostas={respostas}
              rodadaId={rodadaAtualId}
              rodadaComparacaoId={comparacaoAtualId || undefined}
              onVerSemPresenca={() => verPrompts("nao_citada")}
            />
          </section>

          <section aria-labelledby="aeo-visibilidade" className="space-y-1">
            <SectionTitle id="aeo-visibilidade">Visibilidade</SectionTitle>
            <div className="grid grid-cols-1 gap-x-16 gap-y-8 pt-3 md:grid-cols-2">
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
          </section>

          <section aria-labelledby="aeo-oportunidades" className="space-y-1">
            <SectionTitle id="aeo-oportunidades">Oportunidades</SectionTitle>
            <OportunidadesSection
              rodadaId={rodadaAtualId}
              prompts={prompts}
              respostas={respostas}
              onVerPrompts={() => verPrompts("nao_citada")}
            />
          </section>

          <section aria-label="Evolução e concorrentes">
            <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <EvolucaoChart rodadas={ordenadas} respostas={respostas} />
              <ConcorrentesSection
                respostas={respostas}
                prompts={prompts}
                rodadaId={rodadaAtualId}
              />
            </div>
          </section>
        </>
      ) : (
        <EmptyState
          compact
          title="Nenhuma resposta registrada nesta rodada."
          description="Registre as respostas das IAs na tabela de prompts abaixo para ver os resultados."
        />
      )}

      <section id="aeo-prompts" aria-labelledby="aeo-prompts-t" className="scroll-mt-6 space-y-4">
        <div>
          <SectionTitle id="aeo-prompts-t">Prompts</SectionTitle>
          <p className="mt-1 text-sm text-text-secondary">
            Perguntas usadas nesta rodada. Clique em uma linha para ver e registrar a resposta.
          </p>
        </div>
        <PromptTable
          rodadaId={rodadaAtualId}
          ia={ia}
          onIaChange={setIa}
          filtro={filtro}
          onFiltroChange={setFiltro}
          ativos={ativos}
          respostas={respostas}
          onOpenPrompt={(p, i) => {
            setSelectedPromptId(p.id);
            setDrawerIa(i);
            setDrawerOpen(true);
          }}
        />
      </section>

      <Gerenciar prompts={prompts} />

      <RespostaDrawer
        rodadaId={rodadaAtualId}
        ia={drawerIa}
        prompt={selectedPrompt}
        ativos={ativos}
        respostas={respostas}
        open={drawerOpen && !!selectedPrompt}
        onOpenChange={setDrawerOpen}
        onNavigatePrompt={(p) => setSelectedPromptId(p.id)}
        onIaChange={setDrawerIa}
      />
      {dialog}
    </div>
  );
}
