import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  META_AREAS,
  TRACKING_FREQUENCIES,
  METRIC_TYPES,
  METRIC_DIRECTIONS,
  INDICADOR_MARCO_STATUSES,
  type Indicador,
  type MetaArea,
  type TrackingFrequency,
  type MetricType,
  type MetricDirection,
  type IndicadorMarcoStatus,
} from "@/lib/metas-store";
import { StepHeader } from "./StepHeader";

type Member = { name: string; photo?: string };

const FIELD_CLS =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";
const LABEL_CLS = "block text-xs font-medium text-muted-foreground";

const FREQUENCY_LABEL: Record<TrackingFrequency, string> = {
  continuo: "Contínuo",
  semanal: "Semanal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  personalizado: "Personalizado",
};

const METRIC_TYPE_LABEL: Record<MetricType, string> = {
  numero: "Número",
  percentual: "Percentual",
  moeda: "Moeda (R$)",
  min: "Limite mínimo (≥)",
  max: "Limite máximo (≤)",
  binario: "Sim / Não",
  marco: "Marco (etapas)",
  manual: "Manual (livre)",
};

const METRIC_DIRECTION_LABEL: Record<MetricDirection, string> = {
  aumentar: "Aumentar (mais é melhor)",
  reduzir: "Reduzir (menos é melhor)",
  manter_abaixo: "Manter abaixo de um limite",
  manter_acima: "Manter acima de um limite",
  concluir: "Concluir (feito ou não)",
};

const MARCO_STATUS_LABEL: Record<IndicadorMarcoStatus, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

/** `tipo: "min"`/`"max"` pré-selecionam a direção certa — o motor de
 * cálculo só olha pra `direcao`, isso é só conveniência de formulário. */
function defaultDirectionForTipo(tipo: MetricType): MetricDirection {
  if (tipo === "min") return "manter_acima";
  if (tipo === "max") return "manter_abaixo";
  return "aumentar";
}

const NUMERIC_TYPES: MetricType[] = ["numero", "percentual", "moeda", "min", "max", "manual"];

/** Corpo do formulário de Indicador, sem o `<Dialog>` em volta — assim dá
 * pra usar tanto como modal próprio (`IndicadorDialog`) quanto embutido
 * dentro do modal de Objetivo (troca o conteúdo do mesmo modal, nunca
 * abre um por cima do outro). Passo a passo: cada etapa mostra só os
 * campos daquele assunto, com uma frase explicando o que ela pede. */
export function IndicadorForm({
  initial,
  objetivoId,
  members,
  cancelLabel = "Cancelar",
  onCancel,
  onSubmit,
  onDelete,
}: {
  initial?: Indicador;
  /** Pré-seta o objetivo pai quando criado de dentro do `ObjetivoDialog` —
   * nesse caso Responsabilidade e Período são herdados do objetivo, não
   * definidos aqui. */
  objetivoId?: string;
  members: Member[];
  cancelLabel?: string;
  onCancel: () => void;
  onSubmit: (ind: Indicador) => void;
  onDelete?: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [area, setArea] = useState<MetaArea>("Operação");
  const [dono, setDono] = useState("");
  const [colaboradores, setColaboradores] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [frequencia, setFrequencia] = useState<TrackingFrequency>("continuo");
  const [tipo, setTipo] = useState<MetricType>("numero");
  const [direcao, setDirecao] = useState<MetricDirection>("aumentar");
  const [dataSource, setDataSource] = useState<"manual" | "auto">("manual");
  const [unidade, setUnidade] = useState("");
  const [baseline, setBaseline] = useState("");
  const [minimo, setMinimo] = useState("");
  const [esperado, setEsperado] = useState("");
  const [excelencia, setExcelencia] = useState("");
  const [valorAtual, setValorAtual] = useState("");
  const [concluido, setConcluido] = useState(false);
  const [marcoStatus, setMarcoStatus] = useState<IndicadorMarcoStatus>("nao_iniciado");
  const [peso, setPeso] = useState("");
  const [step, setStep] = useState(0);

  const linkedToObjetivo = !!(objetivoId ?? initial?.objetivoId);

  useEffect(() => {
    setTitulo(initial?.titulo ?? "");
    setDescricao(initial?.descricao ?? "");
    setArea(initial?.area ?? "Operação");
    setDono(initial?.dono ?? "");
    setColaboradores(initial?.colaboradores ?? []);
    setDataInicio(initial?.dataInicio ?? "");
    setDataFim(initial?.dataFim ?? "");
    setFrequencia(initial?.frequencia ?? "continuo");
    setTipo(initial?.tipo ?? "numero");
    setDirecao(initial?.direcao ?? "aumentar");
    setDataSource(initial?.dataSource ?? "manual");
    setUnidade(initial?.unidade ?? "");
    setBaseline(initial?.niveis?.baseline != null ? String(initial.niveis.baseline) : "");
    setMinimo(initial?.niveis?.minimo != null ? String(initial.niveis.minimo) : "");
    setEsperado(initial?.niveis?.esperado != null ? String(initial.niveis.esperado) : "");
    setExcelencia(initial?.niveis?.excelencia != null ? String(initial.niveis.excelencia) : "");
    setValorAtual(initial?.valorAtual != null ? String(initial.valorAtual) : "");
    setConcluido(initial?.concluido ?? false);
    setMarcoStatus(initial?.marcoStatus ?? "nao_iniciado");
    setPeso(initial?.peso != null ? String(initial.peso) : "");
    setStep(0);
  }, [initial]);

  const toggleColaborador = (name: string) =>
    setColaboradores((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  const changeTipo = (next: MetricType) => {
    setTipo(next);
    if (next === "min" || next === "max") setDirecao(defaultDirectionForTipo(next));
  };

  const submit = () => {
    if (!titulo.trim()) return;
    const num = (s: string): number | undefined => (s.trim() ? Number(s) : undefined);
    const effectiveObjetivoId = objetivoId ?? initial?.objetivoId;
    onSubmit({
      kind: "indicador",
      id: initial?.id ?? crypto.randomUUID(),
      titulo: titulo.trim(),
      descricao: descricao.trim() || undefined,
      area,
      dono: effectiveObjetivoId ? undefined : dono || undefined,
      colaboradores: effectiveObjetivoId
        ? undefined
        : colaboradores.length
          ? colaboradores
          : undefined,
      dataInicio: effectiveObjetivoId ? undefined : dataInicio || undefined,
      dataFim: effectiveObjetivoId ? undefined : dataFim || undefined,
      frequencia: effectiveObjetivoId ? (initial?.frequencia ?? "continuo") : frequencia,
      vinculos: initial?.vinculos,
      cancelado: initial?.cancelado,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      objetivoId: effectiveObjetivoId,
      peso: effectiveObjetivoId ? num(peso) : undefined,
      tipo,
      direcao,
      dataSource,
      unidade: NUMERIC_TYPES.includes(tipo) ? unidade.trim() || undefined : undefined,
      niveis: {
        baseline: num(baseline),
        minimo: num(minimo),
        esperado: num(esperado),
        excelencia: num(excelencia),
      },
      valorAtual: NUMERIC_TYPES.includes(tipo) ? num(valorAtual) : undefined,
      concluido: tipo === "binario" ? concluido : undefined,
      marcoStatus: tipo === "marco" ? marcoStatus : undefined,
      atualizacoes: initial?.atualizacoes,
    });
  };

  const steps = [
    {
      title: "Informações",
      description: "O nome e a área identificam esse indicador nas listas, cards e filtros.",
    },
    {
      title: "Responsabilidade",
      description: linkedToObjetivo
        ? "Indicadores dentro de um objetivo não têm dono próprio — usam o dono e os colaboradores do objetivo."
        : "Dono é quem responde por esse número no dia a dia. Colaboradores são quem mais participa, sem ser o principal responsável.",
    },
    {
      title: "Como medir",
      description:
        "O tipo define o formato do valor. A direção diz se subir o número é bom ou ruim — é o que decide se o indicador fica saudável ou em risco.",
    },
    {
      title: "Desempenho",
      description:
        "A meta esperada é o valor que define o progresso do indicador. Baseline, meta mínima e de excelência são opcionais e refinam quando ele entra em risco ou vira destaque.",
    },
    {
      title: "Quando e origem",
      description: linkedToObjetivo
        ? "O período e a frequência de acompanhamento também são herdados do objetivo. Aqui você só define a origem do dado e, opcionalmente, o peso deste indicador no cálculo do objetivo."
        : "Data de início/fim e frequência dizem quando esse indicador é acompanhado. Origem é sempre manual por enquanto.",
    },
  ];
  const last = steps.length - 1;
  const canAdvance = step > 0 || titulo.trim().length > 0;

  return (
    <>
      <StepHeader
        step={step}
        total={steps.length}
        title={steps[step].title}
        description={steps[step].description}
      />

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4 pr-1">
        {step === 0 && (
          <>
            <div>
              <label className={LABEL_CLS}>Nome</label>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Margem média da carteira"
                className={FIELD_CLS}
                autoFocus
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Área</label>
              <select
                value={area}
                onChange={(e) => setArea(e.target.value as MetaArea)}
                className={FIELD_CLS}
              >
                {META_AREAS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Descrição (opcional)</label>
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={2}
                className="mt-1 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </>
        )}

        {step === 1 &&
          (linkedToObjetivo ? (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              Sem campos aqui — este indicador segue o dono e os colaboradores definidos no
              objetivo.
            </p>
          ) : (
            <>
              <div>
                <label className={LABEL_CLS}>Dono</label>
                <select
                  value={dono}
                  onChange={(e) => setDono(e.target.value)}
                  className={FIELD_CLS}
                >
                  <option value="">Sem dono definido</option>
                  {members.map((m) => (
                    <option key={m.name} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              {members.length > 0 && (
                <div>
                  <label className={LABEL_CLS}>Colaboradores (opcional)</label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {members
                      .filter((m) => m.name !== dono)
                      .map((m) => {
                        const active = colaboradores.includes(m.name);
                        return (
                          <button
                            key={m.name}
                            type="button"
                            onClick={() => toggleColaborador(m.name)}
                            className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                              active
                                ? "border-foreground bg-muted text-foreground"
                                : "border-border text-muted-foreground hover:bg-muted/40"
                            }`}
                          >
                            {m.name}
                          </button>
                        );
                      })}
                  </div>
                </div>
              )}
            </>
          ))}

        {step === 2 && (
          <>
            <div>
              <label className={LABEL_CLS}>Tipo de medição</label>
              <select
                value={tipo}
                onChange={(e) => changeTipo(e.target.value as MetricType)}
                className={FIELD_CLS}
              >
                {METRIC_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {METRIC_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </div>
            {NUMERIC_TYPES.includes(tipo) && (
              <div>
                <label className={LABEL_CLS}>Direção</label>
                <select
                  value={direcao}
                  onChange={(e) => setDirecao(e.target.value as MetricDirection)}
                  className={FIELD_CLS}
                >
                  {METRIC_DIRECTIONS.map((d) => (
                    <option key={d} value={d}>
                      {METRIC_DIRECTION_LABEL[d]}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {tipo === "binario" && (
              <label className="flex items-center gap-2 pt-1 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={concluido}
                  onChange={(e) => setConcluido(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Já está concluído
              </label>
            )}
            {tipo === "marco" && (
              <div>
                <label className={LABEL_CLS}>Etapa atual</label>
                <select
                  value={marcoStatus}
                  onChange={(e) => setMarcoStatus(e.target.value as IndicadorMarcoStatus)}
                  className={FIELD_CLS}
                >
                  {INDICADOR_MARCO_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {MARCO_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        )}

        {step === 3 &&
          (NUMERIC_TYPES.includes(tipo) ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Valor atual</label>
                  <input
                    type="number"
                    value={valorAtual}
                    onChange={(e) => setValorAtual(e.target.value)}
                    className={FIELD_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Unidade</label>
                  <input
                    value={unidade}
                    onChange={(e) => setUnidade(e.target.value)}
                    placeholder="clientes, R$, %..."
                    className={FIELD_CLS}
                  />
                </div>
              </div>
              <div>
                <label className={LABEL_CLS}>Meta esperada</label>
                <input
                  type="number"
                  value={esperado}
                  onChange={(e) => setEsperado(e.target.value)}
                  className={FIELD_CLS}
                />
              </div>
              <p className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Opcional — refina a régua de saúde
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={LABEL_CLS}>Baseline</label>
                  <input
                    type="number"
                    value={baseline}
                    onChange={(e) => setBaseline(e.target.value)}
                    placeholder="De onde partiu"
                    className={FIELD_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Meta mínima</label>
                  <input
                    type="number"
                    value={minimo}
                    onChange={(e) => setMinimo(e.target.value)}
                    placeholder="Vira risco abaixo"
                    className={FIELD_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Excelência</label>
                  <input
                    type="number"
                    value={excelencia}
                    onChange={(e) => setExcelencia(e.target.value)}
                    placeholder="Vira destaque acima"
                    className={FIELD_CLS}
                  />
                </div>
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              {tipo === "binario"
                ? "Indicadores Sim/Não não têm níveis de meta — o desempenho já foi definido na etapa anterior."
                : "Indicadores de Marco não têm níveis de meta — o desempenho segue a etapa da etapa anterior."}
            </p>
          ))}

        {step === 4 && (
          <>
            {!linkedToObjetivo && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={LABEL_CLS}>Data inicial</label>
                    <input
                      type="date"
                      value={dataInicio}
                      onChange={(e) => setDataInicio(e.target.value)}
                      className={FIELD_CLS}
                    />
                  </div>
                  <div>
                    <label className={LABEL_CLS}>Data final</label>
                    <input
                      type="date"
                      value={dataFim}
                      onChange={(e) => setDataFim(e.target.value)}
                      className={FIELD_CLS}
                    />
                  </div>
                </div>
                <div>
                  <label className={LABEL_CLS}>Frequência de acompanhamento</label>
                  <select
                    value={frequencia}
                    onChange={(e) => setFrequencia(e.target.value as TrackingFrequency)}
                    className={FIELD_CLS}
                  >
                    {TRACKING_FREQUENCIES.map((f) => (
                      <option key={f} value={f}>
                        {FREQUENCY_LABEL[f]}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div>
              <label className={LABEL_CLS}>Origem do dado</label>
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  onClick={() => setDataSource("manual")}
                  className="flex-1 rounded-md border border-foreground bg-muted px-3 py-1.5 text-xs font-medium"
                >
                  Manual
                </button>
                <button
                  type="button"
                  disabled
                  title="Reservado pro futuro — nenhuma fonte automática existe ainda"
                  className="flex-1 cursor-not-allowed rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground/60"
                >
                  Automática (em breve)
                </button>
              </div>
            </div>
            {linkedToObjetivo && (
              <div>
                <label className={LABEL_CLS}>Peso no objetivo (%, opcional)</label>
                <input
                  type="number"
                  value={peso}
                  onChange={(e) => setPeso(e.target.value)}
                  placeholder="Vazio = divide igual entre quem não tem peso"
                  className={FIELD_CLS}
                />
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-4">
        <div>
          {initial && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs font-medium text-destructive hover:underline"
            >
              Excluir indicador
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => (step === 0 ? onCancel() : setStep((s) => s - 1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            {step === 0 ? (
              <>
                <X className="h-4 w-4" /> {cancelLabel}
              </>
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" /> Voltar
              </>
            )}
          </button>
          {step < last ? (
            <button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={!canAdvance}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              Próximo <ChevronRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!titulo.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              Salvar
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function IndicadorDialog({
  open,
  initial,
  objetivoId,
  members,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial?: Indicador;
  objetivoId?: string;
  members: Member[];
  onClose: () => void;
  onSave: (ind: Indicador) => void;
  onDelete?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[88vh] max-w-lg flex-col">
        <DialogTitle>{initial ? "Editar indicador" : "Novo indicador"}</DialogTitle>
        <DialogDescription className="sr-only">
          Métrica individual — pode pertencer a um objetivo ou existir sozinha.
        </DialogDescription>
        {open && (
          <IndicadorForm
            initial={initial}
            objetivoId={objetivoId}
            members={members}
            onCancel={onClose}
            onSubmit={onSave}
            onDelete={onDelete}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
