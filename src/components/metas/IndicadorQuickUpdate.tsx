import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { DateField } from "@/components/ui/date-field";
import {
  INDICADOR_MARCO_STATUSES,
  type Indicador,
  type IndicadorMarcoStatus,
  type Objetivo,
} from "@/lib/metas-store";

const MARCO_STATUS_LABEL: Record<IndicadorMarcoStatus, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};

export type IndicadorQuickPatch = {
  valorAtual?: number;
  concluido?: boolean;
  marcoStatus?: IndicadorMarcoStatus;
  calcTotal?: number;
  calcContagem?: number;
};

/** Percentual calculado a partir de uma razão — arredonda pra 1 casa e
 * tira o ".0" quando é um número redondo (20 em vez de 20.0). */
function ratioToPercent(contagem: number, total: number): number {
  if (!total) return 0;
  return Math.round((contagem / total) * 1000) / 10;
}

/** Tela de "editar indicador" no dia a dia: só o número (ou status), sem
 * reabrir nome/tipo/direção/dono — isso já ficou definido na criação e
 * raramente muda. Pra corrigir esses detalhes estruturais, use "Editar
 * detalhes" (o formulário completo), não esta tela.
 *
 * Indicador percentual pode ser atualizado de duas formas: digitando o %
 * direto, ou calculando automaticamente a partir de uma razão ("2 de 10
 * projetos no prazo" → 20%) — o app faz a conta, ninguém precisa converter
 * na mão. O modo calculado fica salvo no indicador (`calcTotal`/
 * `calcContagem`) e volta pré-preenchido na próxima atualização. */
/** `YYYY-MM-DD` de hoje, no fuso local — mesmo valor que um `<input
 * type="date">` já produz, usado como default do campo "Data da
 * atualização". */
function todayLocalISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function IndicadorQuickUpdate({
  indicador,
  objetivosVinculados,
  onClose,
  onSave,
}: {
  indicador: Indicador | null;
  /** Objetivos que este indicador alimenta hoje — só pra avisar, quando
   * há mais de um, que a atualização é compartilhada (o indicador é
   * universal). Omitido/vazio = nenhum aviso (não vale a pena avisar
   * sobre um único objetivo óbvio, ou nenhum). */
  objetivosVinculados?: Pick<Objetivo, "id" | "titulo">[];
  onClose: () => void;
  /** `dataISO` (YYYY-MM-DD) é quando a atualização de fato aconteceu —
   * pode ser retroativa; vira o `createdAt` da entrada no histórico. */
  onSave: (indicador: Indicador, patch: IndicadorQuickPatch, nota: string, dataISO: string) => void;
}) {
  const [valor, setValor] = useState("");
  const [concluido, setConcluido] = useState(false);
  const [marcoStatus, setMarcoStatus] = useState<IndicadorMarcoStatus>("nao_iniciado");
  const [calcMode, setCalcMode] = useState(false);
  const [calcTotal, setCalcTotal] = useState("");
  const [calcContagem, setCalcContagem] = useState("");
  const [nota, setNota] = useState("");
  const [data, setData] = useState(todayLocalISO());

  useEffect(() => {
    if (indicador) {
      setValor(indicador.valorAtual != null ? String(indicador.valorAtual) : "");
      setConcluido(indicador.concluido ?? false);
      setMarcoStatus(indicador.marcoStatus ?? "nao_iniciado");
      setCalcMode(indicador.calcTotal != null && indicador.calcContagem != null);
      setCalcTotal(indicador.calcTotal != null ? String(indicador.calcTotal) : "");
      setCalcContagem(indicador.calcContagem != null ? String(indicador.calcContagem) : "");
      setNota("");
      setData(todayLocalISO());
    }
  }, [indicador]);

  if (!indicador) return null;

  const isPercentual = indicador.tipo === "percentual";
  const total = Number(calcTotal) || 0;
  const contagem = Number(calcContagem) || 0;
  const computedPercent = ratioToPercent(contagem, total);

  const submit = () => {
    let patch: IndicadorQuickPatch;
    let defaultNota = "";
    if (indicador.tipo === "binario") {
      patch = { concluido };
    } else if (indicador.tipo === "marco") {
      patch = { marcoStatus };
    } else if (isPercentual && calcMode) {
      patch = { valorAtual: computedPercent, calcTotal: total, calcContagem: contagem };
      defaultNota = `${calcContagem} de ${calcTotal}`;
    } else {
      patch = {
        valorAtual: valor ? Number(valor) : undefined,
        calcTotal: undefined,
        calcContagem: undefined,
      };
    }
    onSave(indicador, patch, nota.trim() || defaultNota, data);
  };

  return (
    <Dialog open={!!indicador} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogTitle className="flex items-center gap-2 text-base font-semibold">
          <Target className="h-4 w-4" /> Atualizar indicador
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {indicador.titulo}
        </DialogDescription>

        <div className="space-y-3">
          {indicador.tipo === "binario" ? (
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={concluido}
                onChange={(e) => setConcluido(e.target.checked)}
                className="h-4 w-4 rounded border-input"
                autoFocus
              />
              Concluído
            </label>
          ) : indicador.tipo === "marco" ? (
            <div>
              <label className="block text-xs font-medium text-muted-foreground">Etapa atual</label>
              <select
                value={marcoStatus}
                onChange={(e) => setMarcoStatus(e.target.value as IndicadorMarcoStatus)}
                autoFocus
                className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {INDICADOR_MARCO_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {MARCO_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              {isPercentual && (
                <div className="mb-2 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCalcMode(false)}
                    className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                      !calcMode
                        ? "border-foreground bg-muted text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    Digitar %
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalcMode(true)}
                    className={`flex-1 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
                      calcMode
                        ? "border-foreground bg-muted text-foreground"
                        : "border-border text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    Calcular (X de Y)
                  </button>
                </div>
              )}

              {isPercentual && calcMode ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Quantos alcançaram
                      </label>
                      <input
                        type="number"
                        value={calcContagem}
                        onChange={(e) => setCalcContagem(e.target.value)}
                        placeholder="Ex: 2"
                        autoFocus
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground">
                        Total
                      </label>
                      <input
                        type="number"
                        value={calcTotal}
                        onChange={(e) => setCalcTotal(e.target.value)}
                        placeholder="Ex: 10"
                        className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {calcContagem || "0"} de {calcTotal || "0"} ={" "}
                    <span className="font-medium text-foreground">{computedPercent}%</span>
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-muted-foreground">
                    Valor atual
                    {indicador.unidade ? ` (${indicador.unidade})` : isPercentual ? " (%)" : ""}
                  </label>
                  {indicador.tipo === "moeda" ? (
                    <FormattedNumberInput
                      mode="currency"
                      value={valor.trim() ? Number(valor) : undefined}
                      onValueChange={(n) => setValor(n != null ? String(n) : "")}
                      autoFocus={!isPercentual}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  ) : (
                    <input
                      type="number"
                      value={valor}
                      onChange={(e) => setValor(e.target.value)}
                      autoFocus={!isPercentual}
                      className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                  )}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Data da atualização
            </label>
            <DateField
              value={data || undefined}
              onChange={(v) => setData(v ?? "")}
              className="mt-1"
            />
          </div>
          {objetivosVinculados && objetivosVinculados.length > 1 && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs font-medium text-foreground">
                Esta atualização impactará {objetivosVinculados.length} objetivos:
              </p>
              <ul className="mt-1 space-y-0.5">
                {objetivosVinculados.map((o) => (
                  <li key={o.id} className="truncate text-xs text-muted-foreground">
                    {o.titulo}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-muted-foreground">
              Nota (opcional)
            </label>
            <input
              type="text"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="O que mudou desde a última atualização?"
              className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
