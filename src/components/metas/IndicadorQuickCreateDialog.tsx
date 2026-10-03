import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { FormattedNumberInput } from "@/components/ui/formatted-number-input";
import { DateField } from "@/components/ui/date-field";
import {
  META_AREAS,
  type Indicador,
  type MetaArea,
  type MetricDirection,
  type MetricType,
} from "@/lib/metas-store";

type Member = { name: string; photo?: string };

const FIELD_CLS =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand";
const LABEL_CLS = "text-xs font-medium text-text-secondary";

type HowKind = "alcancar" | "acima" | "abaixo" | "concluir";

const HOW_OPTIONS: { kind: HowKind; label: string; hint: string }[] = [
  { kind: "alcancar", label: "Chegar a um valor", hint: "Ex.: faturar R$ 100 mil no trimestre." },
  { kind: "acima", label: "Ficar acima de um valor", hint: "Ex.: margem sempre acima de 30%." },
  { kind: "abaixo", label: "Ficar abaixo de um valor", hint: "Ex.: cancelamentos abaixo de 5%." },
  { kind: "concluir", label: "Marcar como concluído", hint: "Sem número: está feito ou não." },
];

type Unit = "percentual" | "moeda" | "numero";
const UNIT_OPTIONS: { unit: Unit; label: string }[] = [
  { unit: "percentual", label: "%" },
  { unit: "moeda", label: "R$" },
  { unit: "numero", label: "un." },
];

/** Campo de meta — ganha formatação pt-BR em tempo real quando a unidade
 * escolhida é R$ (mesmo padrão do resto da plataforma pra valor
 * monetário); percentual/un. continuam com o número puro. */
function MetaValueInput({
  unit,
  value,
  onChange,
  placeholder,
  className,
}: {
  unit: Unit;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  className?: string;
}) {
  if (unit === "moeda") {
    return (
      <FormattedNumberInput
        mode="currency"
        value={value.trim() ? Number(value) : undefined}
        onValueChange={(n) => onChange(n != null ? String(n) : "")}
        placeholder={placeholder}
        className={className}
      />
    );
  }
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

function howToTipoDirecao(
  how: HowKind,
  unit: Unit,
): { tipo: MetricType; direcao: MetricDirection } {
  if (how === "acima") return { tipo: "min", direcao: "manter_acima" };
  if (how === "abaixo") return { tipo: "max", direcao: "manter_abaixo" };
  if (how === "concluir") return { tipo: "binario", direcao: "concluir" };
  return { tipo: unit, direcao: "aumentar" };
}

/** "Manter acima/abaixo" sempre vira `tipo: "min"/"max"` (não muda com a
 * unidade escolhida, ao contrário de "alcançar"), então `%`/`R$` precisam
 * ser gravados como `unidade` de verdade pra aparecer no valor exibido —
 * `formatIndicadorValor` só prefixa "%"/"R$" sozinho quando `tipo` é
 * literalmente "percentual"/"moeda". */
function unidadeFor(how: HowKind, unit: Unit, unidadeLivre: string): string | undefined {
  if (how === "acima" || how === "abaixo") {
    if (unit === "percentual") return "%";
    if (unit === "moeda") return "R$";
    return unidadeLivre.trim() || undefined;
  }
  if (how === "alcancar" && unit === "numero") return unidadeLivre.trim() || undefined;
  return undefined;
}

/** Criação de um Indicador — uma tela só, em linguagem natural. Tipo e
 * direção técnicos (`MetricType`/`MetricDirection` em `metas-store.ts`,
 * lidos por `metas-engine.ts` sem nenhuma mudança) continuam existindo por
 * baixo, só que aqui o usuário escolhe "como a meta funciona" em vez de
 * escolher os termos técnicos direto. `marco`/`manual` e os níveis
 * avançados (baseline/mínima/excelência/origem/peso) não aparecem aqui —
 * ficam em "Configurações avançadas" na página do indicador, depois de
 * criado. Indicador é universal: sempre tem seu próprio dono/período,
 * vinculado a um Objetivo ou não — esses campos nunca ficam escondidos. */
export function IndicadorQuickCreateDialog({
  open,
  objetivoId,
  objetivoArea,
  members,
  onClose,
  onCreate,
}: {
  open: boolean;
  /** Setado quando criado de dentro de um Objetivo — nesse caso o
   * indicador já nasce vinculado a ele (`objetivoIds: [objetivoId]`), e
   * `objetivoArea` só pré-preenche o campo Área como sugestão. */
  objetivoId?: string;
  objetivoArea?: MetaArea;
  members: Member[];
  onClose: () => void;
  onCreate: (ind: Indicador) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [how, setHow] = useState<HowKind | null>(null);
  const [unit, setUnit] = useState<Unit>("percentual");
  const [unidadeLivre, setUnidadeLivre] = useState("");
  const [meta, setMeta] = useState("");
  const [area, setArea] = useState<MetaArea>("Operação");
  const [dono, setDono] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo("");
    setHow(null);
    setUnit("percentual");
    setUnidadeLivre("");
    setMeta("");
    setArea(objetivoArea ?? "Operação");
    setDono("");
    setDataInicio("");
    setDataFim("");
    setMoreOpen(false);
  }, [open, objetivoArea]);

  const submit = () => {
    if (!titulo.trim() || !how) return;
    const { tipo, direcao } = howToTipoDirecao(how, unit);
    const now = new Date().toISOString();
    const ind: Indicador = {
      kind: "indicador",
      id: crypto.randomUUID(),
      titulo: titulo.trim(),
      area,
      dono: dono || undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      frequencia: "continuo",
      objetivoIds: objetivoId ? [objetivoId] : undefined,
      tipo,
      direcao,
      dataSource: "manual",
      unidade: unidadeFor(how, unit, unidadeLivre),
      niveis: { esperado: how === "concluir" ? undefined : meta.trim() ? Number(meta) : undefined },
      concluido: how === "concluir" ? false : undefined,
      createdAt: now,
      updatedAt: now,
    };
    onCreate(ind);
  };

  const canSubmit = titulo.trim().length > 0 && how !== null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="border-b border-border/60 px-6 py-5">
          <SheetTitle>Novo indicador</SheetTitle>
          <SheetDescription className="text-xs text-text-secondary">
            Uma métrica para acompanhar. Detalhes mais finos (baseline, metas mínima e de
            excelência) dá pra ajustar depois, na página do indicador.
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <Label htmlFor="indicador-nome" className={LABEL_CLS}>
              Nome
            </Label>
            <input
              id="indicador-nome"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Margem média da carteira"
              className={FIELD_CLS}
              autoFocus
            />
          </div>

          <div>
            <Label className={LABEL_CLS}>O que você quer acompanhar?</Label>
            <RadioGroup
              value={how ?? ""}
              onValueChange={(v) => setHow(v as HowKind)}
              className="mt-1 gap-0"
            >
              {HOW_OPTIONS.map(({ kind, label, hint }) => (
                <label
                  key={kind}
                  className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/50"
                >
                  <RadioGroupItem value={kind} className="mt-0.5" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-foreground">{label}</span>
                    <span className="block text-xs leading-snug text-text-secondary">{hint}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </div>

          {how && how !== "concluir" && (
            <div>
              <Label className={LABEL_CLS}>
                {how === "alcancar"
                  ? "Valor a alcançar"
                  : how === "acima"
                    ? "Manter acima de"
                    : "Manter abaixo de"}
              </Label>
              <div className="mt-1 flex gap-2">
                <MetaValueInput
                  unit={unit}
                  value={meta}
                  onChange={setMeta}
                  placeholder={how === "alcancar" ? "Ex: 63" : "Ex: 6"}
                  className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
                <div className="flex overflow-hidden rounded-md bg-muted p-0.5">
                  {UNIT_OPTIONS.map(({ unit: u, label }) => (
                    <button
                      key={u}
                      type="button"
                      onClick={() => setUnit(u)}
                      className={`rounded px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        unit === u
                          ? "bg-background text-foreground shadow-sm"
                          : "text-text-secondary hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {unit === "numero" && (
                <input
                  value={unidadeLivre}
                  onChange={(e) => setUnidadeLivre(e.target.value)}
                  placeholder="Unidade (opcional) — clientes, operações..."
                  className="mt-1.5 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
                />
              )}
            </div>
          )}

          <div className="border-t border-border/60 pt-3">
            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              aria-expanded={moreOpen}
              className="inline-flex items-center gap-1 rounded text-xs font-medium text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {moreOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              Mais detalhes (responsável, área, período)
            </button>
            {moreOpen && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="indicador-dono" className={LABEL_CLS}>
                      Responsável
                    </Label>
                    <select
                      id="indicador-dono"
                      value={dono}
                      onChange={(e) => setDono(e.target.value)}
                      className={FIELD_CLS}
                    >
                      <option value="">Sem responsável</option>
                      {members.map((m) => (
                        <option key={m.name} value={m.name}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="indicador-area" className={LABEL_CLS}>
                      Área
                    </Label>
                    <select
                      id="indicador-area"
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
                <div>
                  <Label className={LABEL_CLS}>Período (opcional)</Label>
                  <div className="mt-1 grid grid-cols-2 gap-3">
                    <DateField
                      value={dataInicio || undefined}
                      onChange={(v) => setDataInicio(v ?? "")}
                      max={dataFim || undefined}
                    />
                    <DateField
                      value={dataFim || undefined}
                      onChange={(v) => setDataFim(v ?? "")}
                      min={dataInicio || undefined}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button variant="outline" size="comfortable" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="comfortable" onClick={submit} disabled={!canSubmit}>
            Criar indicador
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
