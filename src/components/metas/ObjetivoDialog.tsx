import { useEffect, useState } from "react";
import { Info, Plus, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  META_AREAS,
  TRACKING_FREQUENCIES,
  type Objetivo,
  type Indicador,
  type MetaArea,
  type TrackingFrequency,
} from "@/lib/metas-store";
import { indicadorSaude, INDICADOR_SAUDE_LABEL, INDICADOR_SAUDE_TONE } from "@/lib/metas-engine";
import { IndicadorForm } from "./IndicadorDialog";
import { formatIndicadorValor } from "./metas-ui-utils";

type Member = { name: string; photo?: string };

const FIELD_CLS =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";
const LABEL_CLS = "flex items-center gap-1 text-xs font-medium text-muted-foreground";
const SECTION_TITLE_CLS = "text-[11px] font-semibold uppercase tracking-wider text-foreground/70";

const FREQUENCY_LABEL: Record<TrackingFrequency, string> = {
  continuo: "Contínuo",
  semanal: "Semanal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  personalizado: "Personalizado",
};

/** Pontinho "i" com dica no hover — evita parágrafo embaixo de cada campo. */
function Hint({ text }: { text: string }) {
  return (
    <span title={text} className="cursor-help text-muted-foreground/60 hover:text-foreground">
      <Info className="h-3 w-3" />
    </span>
  );
}

export function ObjetivoDialog({
  open,
  initial,
  /** Indicadores já vinculados a este objetivo (edição) + indicadores
   * standalone disponíveis pra vincular. */
  indicadoresDoObjetivo,
  indicadoresDisponiveis,
  members,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  initial?: Objetivo;
  indicadoresDoObjetivo: Indicador[];
  indicadoresDisponiveis: Indicador[];
  members: Member[];
  onClose: () => void;
  /** `linkedIndicadores` é a lista completa (existentes vinculados + novos
   * criados aqui) que deve terminar com `objetivoId` apontando pra este
   * objetivo — quem chama cuida de desvincular quem saiu da lista. */
  onSave: (objetivo: Objetivo, linkedIndicadores: Indicador[]) => void;
  onDelete?: () => void;
}) {
  const [objetivoId] = useState(() => initial?.id ?? crypto.randomUUID());
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [area, setArea] = useState<MetaArea>("Operação");
  const [dono, setDono] = useState("");
  const [colaboradores, setColaboradores] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [frequencia, setFrequencia] = useState<TrackingFrequency>("continuo");
  const [linked, setLinked] = useState<Indicador[]>([]);
  const [vincularOpen, setVincularOpen] = useState(false);
  const [indicadorDialog, setIndicadorDialog] = useState<{ data?: Indicador } | null>(null);
  const [showDescricao, setShowDescricao] = useState(false);

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
    setLinked(indicadoresDoObjetivo);
    setShowDescricao(!!initial?.descricao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const toggleColaborador = (name: string) =>
    setColaboradores((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  const unlink = (id: string) => setLinked((prev) => prev.filter((i) => i.id !== id));
  const setPeso = (id: string, peso: number | undefined) =>
    setLinked((prev) => prev.map((i) => (i.id === id ? { ...i, peso } : i)));

  const submit = () => {
    if (!titulo.trim()) return;
    onSave(
      {
        kind: "objetivo",
        id: objetivoId,
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
      },
      linked.map((i) => ({ ...i, objetivoId })),
    );
  };

  const pesoSum = linked.reduce((s, i) => s + (i.peso ?? 0), 0);

  // Criar/editar um indicador vinculado troca o CONTEÚDO deste mesmo modal
  // (em vez de abrir um segundo modal por cima) — evita o problema de dois
  // formulários empilhados, um bloqueando o preenchimento do outro.
  if (indicadorDialog) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="flex max-h-[88vh] max-w-lg flex-col">
          <DialogTitle>{indicadorDialog.data ? "Editar indicador" : "Novo indicador"}</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Vinculado ao objetivo "{titulo || "sem nome ainda"}".
          </DialogDescription>
          <IndicadorForm
            initial={indicadorDialog.data}
            objetivoId={objetivoId}
            members={members}
            cancelLabel="Voltar pro objetivo"
            onCancel={() => setIndicadorDialog(null)}
            onSubmit={(ind) => {
              setLinked((prev) => {
                const exists = prev.some((i) => i.id === ind.id);
                return exists ? prev.map((i) => (i.id === ind.id ? ind : i)) : [...prev, ind];
              });
              setIndicadorDialog(null);
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="flex max-h-[88vh] max-w-lg flex-col">
        <DialogTitle>{initial ? "Editar objetivo" : "Novo objetivo"}</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Agrupa vários indicadores e mostra o progresso combinado deles.
        </DialogDescription>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto pr-1">
          {/* Sobre */}
          <div className="space-y-3">
            <div>
              <label className={LABEL_CLS}>Nome</label>
              <input
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Ex: Escalar a operação sem aumentar a estrutura fixa"
                className={FIELD_CLS}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
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
                <label className={LABEL_CLS}>Dono</label>
                <select
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
                        title="Colaborador — participa junto, sem ser o dono principal"
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                          active
                            ? "border-foreground bg-muted text-foreground"
                            : "border-border text-muted-foreground hover:bg-muted/40"
                        }`}
                      >
                        + {m.name}
                      </button>
                    );
                  })}
              </div>
            )}
            {showDescricao ? (
              <div>
                <label className={LABEL_CLS}>Descrição</label>
                <textarea
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  rows={2}
                  autoFocus
                  className="mt-1 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowDescricao(true)}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                + Adicionar descrição
              </button>
            )}
          </div>

          {/* Período */}
          <div className="space-y-3 border-t border-border pt-4">
            <p className={SECTION_TITLE_CLS}>Período</p>
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
              <label className={LABEL_CLS}>
                Frequência <Hint text="De quanto em quanto tempo o objetivo é revisado." />
              </label>
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

          {/* Indicadores */}
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className={SECTION_TITLE_CLS}>
                Indicadores{" "}
                <Hint text="O progresso do objetivo é a média do desempenho de cada indicador, ponderada pelo peso de cada um (sem peso, todos contam igual)." />
              </p>
              {pesoSum > 100 && (
                <span className="text-right text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  Peso soma {pesoSum}% — será normalizado
                </span>
              )}
            </div>

            {linked.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhum indicador vinculado ainda.</p>
            ) : (
              <ul className="space-y-1.5">
                {linked.map((ind) => {
                  const saude = indicadorSaude(ind);
                  return (
                    <li
                      key={ind.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2"
                    >
                      <button
                        type="button"
                        onClick={() => setIndicadorDialog({ data: ind })}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-xs font-medium text-foreground">{ind.titulo}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {ind.dono || "Sem dono"} ·{" "}
                          {formatIndicadorValor(ind.tipo, ind.valorAtual, ind.unidade)}
                        </p>
                      </button>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${INDICADOR_SAUDE_TONE[saude]}`}
                      >
                        {INDICADOR_SAUDE_LABEL[saude]}
                      </span>
                      <input
                        type="number"
                        value={ind.peso ?? ""}
                        onChange={(e) =>
                          setPeso(ind.id, e.target.value ? Number(e.target.value) : undefined)
                        }
                        placeholder="peso %"
                        title="Peso desse indicador no progresso do objetivo"
                        className="h-7 w-16 shrink-0 rounded border border-input bg-background px-1.5 text-[11px]"
                      />
                      <button
                        type="button"
                        onClick={() => unlink(ind.id)}
                        aria-label="Desvincular"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIndicadorDialog({})}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" /> Criar novo
              </button>
              <div className="relative flex-1">
                <button
                  type="button"
                  onClick={() => setVincularOpen((v) => !v)}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                >
                  Vincular existente
                </button>
                {vincularOpen && (
                  <div className="absolute right-0 top-full z-20 mt-1 max-h-56 w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-md">
                    {indicadoresDisponiveis.filter((i) => !linked.some((l) => l.id === i.id))
                      .length === 0 ? (
                      <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
                        Nenhum indicador independente disponível.
                      </p>
                    ) : (
                      indicadoresDisponiveis
                        .filter((i) => !linked.some((l) => l.id === i.id))
                        .map((i) => (
                          <button
                            key={i.id}
                            type="button"
                            onClick={() => {
                              setLinked((prev) => [...prev, i]);
                              setVincularOpen(false);
                            }}
                            className="block w-full truncate rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
                          >
                            {i.titulo}
                          </button>
                        ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
          <div>
            {initial && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir objetivo
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
