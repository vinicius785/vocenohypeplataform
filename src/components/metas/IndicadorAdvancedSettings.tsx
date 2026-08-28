import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import {
  META_AREAS,
  TRACKING_FREQUENCIES,
  METRIC_TYPES,
  METRIC_DIRECTIONS,
  INDICADOR_MARCO_STATUSES,
  type Indicador,
  type Objetivo,
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
const SECTION_TITLE_CLS = "text-[11px] font-semibold uppercase tracking-wider text-foreground/70";

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

const NUMERIC_TYPES: MetricType[] = ["numero", "percentual", "moeda", "min", "max", "manual"];

/** Campo de nível (valor atual/esperado/baseline/mínimo/excelência) —
 * indicador tipo "moeda" ganha formatação pt-BR em tempo real (separador
 * de milhar + decimal); os demais tipos continuam com o número puro (não
 * dá pra saber a magnitude/formato certo de "número"/"manual" genéricos
 * sem inventar uma regra). */
function NivelField({
  tipo,
  value,
  onChange,
  className,
  placeholder,
}: {
  tipo: MetricType;
  value: string;
  onChange: (s: string) => void;
  className?: string;
  placeholder?: string;
}) {
  if (tipo === "moeda") {
    return (
      <FormattedNumberInput
        mode="currency"
        value={value.trim() ? Number(value) : undefined}
        onValueChange={(n) => onChange(n != null ? String(n) : "")}
        className={className}
        placeholder={placeholder}
      />
    );
  }
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
      placeholder={placeholder}
    />
  );
}

/** Painel "Configurações avançadas" da página do indicador — os campos
 * técnicos que a criação rápida (`IndicadorQuickCreateDialog`) não expõe:
 * tipo/direção completos (inclui marco/manual), níveis de meta,
 * responsabilidade/período/frequência (sempre do próprio indicador —
 * "universal" não herda mais de um objetivo único) e origem. Peso NÃO
 * mora aqui: como o mesmo indicador pode estar em vários objetivos com
 * pesos diferentes, isso só se ajusta em "Ajustar pesos" de cada
 * objetivo. Tudo numa lista só, sem etapas — quem abriu isso já optou
 * por configurar, não precisa de progressive disclosure aqui dentro. */
export function IndicadorAdvancedSettings({
  indicador,
  objetivosVinculados,
  members,
  onSave,
  onUnlinkObjetivo,
}: {
  indicador: Indicador;
  /** Objetivos que este indicador alimenta hoje — só pra exibir a lista e
   * permitir desvincular daqui também (o mesmo "x" já existe no card
   * dentro de cada objetivo, isso é só um segundo acesso). */
  objetivosVinculados: Objetivo[];
  members: Member[];
  onSave: (ind: Indicador) => void;
  onUnlinkObjetivo: (objetivoId: string) => void;
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

  useEffect(() => {
    setTitulo(indicador.titulo);
    setDescricao(indicador.descricao ?? "");
    setArea(indicador.area);
    setDono(indicador.dono ?? "");
    setColaboradores(indicador.colaboradores ?? []);
    setDataInicio(indicador.dataInicio ?? "");
    setDataFim(indicador.dataFim ?? "");
    setFrequencia(indicador.frequencia);
    setTipo(indicador.tipo);
    setDirecao(indicador.direcao);
    setDataSource(indicador.dataSource);
    setUnidade(indicador.unidade ?? "");
    setBaseline(indicador.niveis.baseline != null ? String(indicador.niveis.baseline) : "");
    setMinimo(indicador.niveis.minimo != null ? String(indicador.niveis.minimo) : "");
    setEsperado(indicador.niveis.esperado != null ? String(indicador.niveis.esperado) : "");
    setExcelencia(indicador.niveis.excelencia != null ? String(indicador.niveis.excelencia) : "");
    setValorAtual(indicador.valorAtual != null ? String(indicador.valorAtual) : "");
    setConcluido(indicador.concluido ?? false);
    setMarcoStatus(indicador.marcoStatus ?? "nao_iniciado");
  }, [indicador]);

  const toggleColaborador = (name: string) =>
    setColaboradores((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  const submit = () => {
    if (!titulo.trim()) return;
    const num = (s: string): number | undefined => (s.trim() ? Number(s) : undefined);
    onSave({
      ...indicador,
      titulo: titulo.trim(),
      descricao: descricao.trim() || undefined,
      area,
      dono: dono || undefined,
      colaboradores: colaboradores.length ? colaboradores : undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      frequencia,
      updatedAt: new Date().toISOString(),
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
      valorAtual: NUMERIC_TYPES.includes(tipo) ? num(valorAtual) : indicador.valorAtual,
      concluido: tipo === "binario" ? concluido : undefined,
      marcoStatus: tipo === "marco" ? marcoStatus : undefined,
    });
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className={SECTION_TITLE_CLS}>Informações</p>
        <div>
          <label className={LABEL_CLS}>Nome</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className={FIELD_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Descrição</label>
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

      <div className="space-y-3 border-t border-border pt-4">
        <p className={SECTION_TITLE_CLS}>Como medir</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>Tipo</label>
            <select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as MetricType)}
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
        {tipo === "binario" && (
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={concluido}
              onChange={(e) => setConcluido(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            Concluído
          </label>
        )}
        {tipo === "marco" && (
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
        )}
      </div>

      {NUMERIC_TYPES.includes(tipo) && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className={SECTION_TITLE_CLS}>Desempenho</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Valor atual</label>
              <NivelField
                tipo={tipo}
                value={valorAtual}
                onChange={setValorAtual}
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
              <label className={LABEL_CLS}>Meta esperada</label>
              <NivelField
                tipo={tipo}
                value={esperado}
                onChange={setEsperado}
                className={FIELD_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Baseline</label>
              <NivelField
                tipo={tipo}
                value={baseline}
                onChange={setBaseline}
                placeholder="De onde partiu"
                className={FIELD_CLS}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Meta mínima</label>
              <NivelField
                tipo={tipo}
                value={minimo}
                onChange={setMinimo}
                placeholder="Vira risco abaixo"
                className={FIELD_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Meta de excelência</label>
              <NivelField
                tipo={tipo}
                value={excelencia}
                onChange={setExcelencia}
                placeholder="Vira destaque acima"
                className={FIELD_CLS}
              />
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3 border-t border-border pt-4">
        <p className={SECTION_TITLE_CLS}>Responsabilidade e período</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLS}>Dono</label>
            <select value={dono} onChange={(e) => setDono(e.target.value)} className={FIELD_CLS}>
              <option value="">Sem dono</option>
              {members.map((m) => (
                <option key={m.name} value={m.name}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLS}>Frequência</label>
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
        </div>
        {members.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
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
        )}
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
      </div>

      <div className="space-y-3 border-t border-border pt-4">
        <p className={SECTION_TITLE_CLS}>Origem do dado</p>
        <div className="flex gap-2">
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

      <div className="space-y-3 border-t border-border pt-4">
        <p className={SECTION_TITLE_CLS}>Vinculado a</p>
        {objetivosVinculados.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum objetivo — este indicador é independente.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {objetivosVinculados.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-2.5 py-1.5"
              >
                <span className="truncate text-xs text-foreground">{o.titulo}</span>
                <button
                  type="button"
                  onClick={() => onUnlinkObjetivo(o.id)}
                  title="Desvincular deste objetivo"
                  aria-label="Desvincular deste objetivo"
                  className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[11px] text-muted-foreground">
          Peso em cada objetivo se ajusta em "Ajustar pesos", dentro da página do objetivo.
        </p>
      </div>

      <div className="flex justify-end border-t border-border pt-4">
        <button
          type="button"
          onClick={submit}
          disabled={!titulo.trim()}
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          Salvar configurações
        </button>
      </div>
    </div>
  );
}
