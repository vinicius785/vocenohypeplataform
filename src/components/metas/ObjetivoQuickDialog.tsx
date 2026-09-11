import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateField } from "@/components/ui/date-field";
import { META_AREAS, type Objetivo, type MetaArea } from "@/lib/metas-store";

type Member = { name: string; photo?: string };

const FIELD_CLS =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand";
const LABEL_CLS = "text-xs font-medium text-text-secondary";

/** Criação/edição de um Objetivo — drawer lateral (padrão Comercial/
 * Reuniões), uma tela só, sem etapas. Só os campos essenciais (nome/
 * área/dono/período); descrição e colaboradores ficam atrás de um "+"
 * pra não pesar a tela em quem não precisa deles agora. Indicadores NÃO
 * são configurados aqui — isso acontece na página do objetivo depois de
 * criado (um objetivo vazio é um estado válido). */
export function ObjetivoQuickDialog({
  open,
  initial,
  members,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: Objetivo;
  members: Member[];
  onClose: () => void;
  onSave: (objetivo: Objetivo) => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [area, setArea] = useState<MetaArea>("Operação");
  const [dono, setDono] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [descricao, setDescricao] = useState("");
  const [colaboradores, setColaboradores] = useState<string[]>([]);
  const [showDescricao, setShowDescricao] = useState(false);
  const [showColaboradores, setShowColaboradores] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(initial?.titulo ?? "");
    setArea(initial?.area ?? "Operação");
    setDono(initial?.dono ?? "");
    setDataInicio(initial?.dataInicio ?? "");
    setDataFim(initial?.dataFim ?? "");
    setDescricao(initial?.descricao ?? "");
    setColaboradores(initial?.colaboradores ?? []);
    setShowDescricao(!!initial?.descricao);
    setShowColaboradores((initial?.colaboradores?.length ?? 0) > 0);
  }, [open, initial]);

  const toggleColaborador = (name: string) =>
    setColaboradores((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );

  const submit = () => {
    if (!titulo.trim()) return;
    onSave({
      kind: "objetivo",
      id: initial?.id ?? crypto.randomUUID(),
      titulo: titulo.trim(),
      descricao: descricao.trim() || undefined,
      area,
      dono: dono || undefined,
      colaboradores: colaboradores.length ? colaboradores : undefined,
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      frequencia: initial?.frequencia ?? "continuo",
      vinculos: initial?.vinculos,
      cancelado: initial?.cancelado,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="flex h-full w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-md">
        <div className="border-b border-border/60 px-6 py-5">
          <SheetTitle>{initial ? "Editar objetivo" : "Novo objetivo"}</SheetTitle>
          <SheetDescription className="text-xs text-text-secondary">
            Qual resultado você quer alcançar? Os indicadores você adiciona depois, na página do
            objetivo.
          </SheetDescription>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-5">
          <div>
            <Label htmlFor="objetivo-nome" className={LABEL_CLS}>
              Nome
            </Label>
            <input
              id="objetivo-nome"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Escalar a operação sem aumentar a estrutura fixa"
              className={FIELD_CLS}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="objetivo-area" className={LABEL_CLS}>
                Área
              </Label>
              <select
                id="objetivo-area"
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
              <Label htmlFor="objetivo-dono" className={LABEL_CLS}>
                Dono
              </Label>
              <select
                id="objetivo-dono"
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

          {showDescricao ? (
            <div>
              <Label htmlFor="objetivo-descricao" className={LABEL_CLS}>
                Descrição
              </Label>
              <textarea
                id="objetivo-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={2}
                autoFocus
                className="mt-1 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowDescricao(true)}
              className="rounded text-xs font-medium text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              + Adicionar descrição
            </button>
          )}

          {members.length > 0 &&
            (showColaboradores ? (
              <div>
                <Label className={LABEL_CLS}>Colaboradores</Label>
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
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                            active
                              ? "bg-brand-subtle text-brand"
                              : "bg-muted text-text-secondary hover:text-foreground"
                          }`}
                        >
                          {m.name}
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowColaboradores(true)}
                className="rounded text-xs font-medium text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                + Adicionar colaboradores
              </button>
            ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border/60 px-6 py-4">
          <Button variant="outline" size="comfortable" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" size="comfortable" onClick={submit} disabled={!titulo.trim()}>
            {initial ? "Salvar" : "Criar objetivo"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
