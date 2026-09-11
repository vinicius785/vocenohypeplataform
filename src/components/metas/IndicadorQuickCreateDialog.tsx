import { useEffect, useState } from "react";
import { Check, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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

const HOW_OPTIONS: { kind: HowKind; label: string; icon: typeof TrendingUp }[] = [
  { kind: "alcancar", label: "Alcançar um valor", icon: TrendingUp },
  { kind: "acima", label: "Manter acima de um valor", icon: TrendingUp },
  { kind: "abaixo", label: "Manter abaixo de um valor", icon: TrendingDown },
  { kind: "concluir", label: "Concluir algo", icon: Check },
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
            Uma métrica individual para acompanhar. Detalhes mais finos (baseline, meta mínima,
            excelência...) dá pra ajustar depois, na página do indicador.
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
            <Label className={LABEL_CLS}>Como essa meta funciona?</Label>
            <div className="mt-1.5 grid grid-cols-2 gap-2">
              {HOW_OPTIONS.map(({ kind, label, icon: Icon }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setHow(kind)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-2 text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    how === kind
                      ? "bg-brand-subtle text-brand"
                      : "bg-muted text-text-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {how === "alcancar" && (
            <div>
              <Label className={LABEL_CLS}>Meta</Label>
              <div className="mt-1 flex gap-2">
                <MetaValueInput
                  unit={unit}
                  value={meta}
                  onChange={setMeta}
                  placeholder="63"
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

          {(how === "acima" || how === "abaixo") && (
            <div>
              <Label className={LABEL_CLS}>
                {how === "acima" ? "Manter acima de" : "Manter abaixo de"}
              </Label>
              <div className="mt-1 flex gap-2">
                <MetaValueInput
                  unit={unit}
                  value={meta}
                  onChange={setMeta}
                  placeholder="Ex: 6"
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

          {how === "concluir" && (
            <p className="flex items-center gap-1.5 rounded-2xl bg-muted/40 p-3 text-xs text-text-secondary">
              <Minus className="h-3.5 w-3.5 shrink-0" /> Sem valor numérico — o indicador fica
              "concluído" ou "em aberto".
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
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
            <div>
              <Label htmlFor="indicador-dono" className={LABEL_CLS}>
                Dono
              </Label>
              <select
                id="indicador-dono"
                value={dono}
                onChange={(e) => setDono(e.target.value)}
                className={FIELD_CLS}
              >
                <option value="">Sem dono</option>
                {members.map((m) => (
                  <option key={m.name} value={m.name}>
                    {m.name}
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
