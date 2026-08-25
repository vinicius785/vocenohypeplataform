import { useEffect, useState } from "react";
import { X } from "lucide-react";
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
  aumentar: "Aumentar",
  reduzir: "Reduzir",
  manter_abaixo: "Manter abaixo",
  manter_acima: "Manter acima",
  concluir: "Concluir",
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
  /** Pré-seta o objetivo pai quando criado de dentro do `ObjetivoDialog` —
   * nesse caso o campo fica fixo (não editável), pra não permitir mover o
   * indicador de objetivo sem querer por aqui. */
  objetivoId?: string;
  members: Member[];
  onClose: () => void;
  onSave: (ind: Indicador) => void;
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

  useEffect(() => {
    if (!open) return;
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
  }, [open, initial]);

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
    onSave({
      kind: "indicador",
      id: initial?.id ?? crypto.randomUUID(),
      titulo: titulo.trim(),
      descricao: descricao.trim() || undefined,
      area,
      dono: dono || undefined,
      colaboradores: colaboradores.length ? colaboradores : undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      frequencia,
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[88vh] max-w-lg flex-col">
        <DialogTitle>{initial ? "Editar indicador" : "Novo indicador"}</DialogTitle>
        <DialogDescription className="sr-only">
          Métrica individual — pode pertencer a um objetivo ou existir sozinha.
        </DialogDescription>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
          {/* Informações */}
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Informações
            </p>
            <div>
              <label className={LABEL_CLS}>Nome</label>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Margem média da carteira"
                className={FIELD_CLS}
              />
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
          </div>

          {/* Responsabilidade */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Responsabilidade
            </p>
            <div>
              <label className={LABEL_CLS}>Dono</label>
              <select value={dono} onChange={(e) => setDono(e.target.value)} className={FIELD_CLS}>
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
                <label className={LABEL_CLS}>Colaboradores</label>
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
          </div>

          {/* Período */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Período
            </p>
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
            {(objetivoId ?? initial?.objetivoId) ? (
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
            ) : null}
          </div>

          {/* Como medir */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Como medir
            </p>
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
          </div>

          {/* Origem */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Origem
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDataSource("manual")}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium ${
                  dataSource === "manual"
                    ? "border-foreground bg-muted"
                    : "border-border hover:bg-muted/40"
                }`}
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

          {/* Desempenho — só os campos relevantes pro tipo escolhido */}
          {NUMERIC_TYPES.includes(tipo) && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Desempenho
              </p>
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
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Baseline (opcional)</label>
                  <input
                    type="number"
                    value={baseline}
                    onChange={(e) => setBaseline(e.target.value)}
                    className={FIELD_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Meta mínima (opcional)</label>
                  <input
                    type="number"
                    value={minimo}
                    onChange={(e) => setMinimo(e.target.value)}
                    className={FIELD_CLS}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={LABEL_CLS}>Meta esperada</label>
                  <input
                    type="number"
                    value={esperado}
                    onChange={(e) => setEsperado(e.target.value)}
                    className={FIELD_CLS}
                  />
                </div>
                <div>
                  <label className={LABEL_CLS}>Meta de excelência (opcional)</label>
                  <input
                    type="number"
                    value={excelencia}
                    onChange={(e) => setExcelencia(e.target.value)}
                    className={FIELD_CLS}
                  />
                </div>
              </div>
            </div>
          )}
          {tipo === "binario" && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Desempenho
              </p>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  checked={concluido}
                  onChange={(e) => setConcluido(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                Já concluído
              </label>
            </div>
          )}
          {tipo === "marco" && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Desempenho
              </p>
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
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
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
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <X className="h-4 w-4" /> Cancelar
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={!titulo.trim()}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
            >
              Salvar
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
