import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-field";
import { META_AREAS, type Objetivo, type MetaArea } from "@/lib/metas-store";

type Member = { name: string; photo?: string };

const FIELD_CLS =
  "mt-1 h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring";
const LABEL_CLS = "block text-xs font-medium text-muted-foreground";

/** Criação/edição de um Objetivo — uma tela só, sem etapas. Só os campos
 * essenciais (nome/área/dono/período); descrição e colaboradores ficam
 * atrás de um "+" pra não pesar a tela em quem não precisa deles agora.
 * Indicadores NÃO são configurados aqui — isso acontece na página do
 * objetivo depois de criado (um objetivo vazio é um estado válido). */
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
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogTitle>{initial ? "Editar objetivo" : "Novo objetivo"}</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          Qual resultado você quer alcançar? Os indicadores você adiciona depois, na página do
          objetivo.
        </DialogDescription>

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
              <select value={dono} onChange={(e) => setDono(e.target.value)} className={FIELD_CLS}>
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
            <label className={LABEL_CLS}>Período (opcional)</label>
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

          {members.length > 0 &&
            (showColaboradores ? (
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
            ) : (
              <button
                type="button"
                onClick={() => setShowColaboradores(true)}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground hover:underline"
              >
                + Adicionar colaboradores
              </button>
            ))}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-border pt-4">
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
            {initial ? "Salvar" : "Criar objetivo"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
