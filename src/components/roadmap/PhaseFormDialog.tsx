import { useEffect, useState } from "react";
import { Milestone } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DateField } from "@/components/ui/date-field";
import { TASK_TAG_COLORS } from "@/lib/task-tags-store";
import { loadTeamMembers } from "@/lib/projetos";
import { FASE_STATUS_LABEL, type FaseStatus, type ProjetoFase } from "@/lib/roadmap-engine";

const FASE_STATUSES: FaseStatus[] = [
  "nao_iniciada",
  "em_andamento",
  "em_risco",
  "atrasada",
  "concluida",
];

function ColorSwatches({ value, onPick }: { value: string; onPick: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TASK_TAG_COLORS.map((c) => (
        <button
          key={c.value}
          type="button"
          title={c.label}
          onClick={() => onPick(c.value)}
          className={`h-6 w-6 shrink-0 rounded-full ${c.value.split(" ")[0]} ${
            value === c.value ? "ring-2 ring-offset-2 ring-offset-background ring-foreground" : ""
          }`}
        />
      ))}
    </div>
  );
}

/** Criar/editar uma fase do roadmap — mesmo `DialogContent` compartilhado
 * (`mobileFullScreen`, já usado por TaskDialog/EntryDialog/MeetingDialog),
 * mesmo `DateField`/paleta de cores (`TASK_TAG_COLORS`) já usados em
 * outros lugares da plataforma. */
export function PhaseFormDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: ProjetoFase;
  onSave: (fase: Omit<ProjetoFase, "id" | "createdAt" | "updatedAt" | "sortOrder">) => void;
}) {
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [responsavelPrincipal, setResponsavelPrincipal] = useState("");
  const [cor, setCor] = useState(TASK_TAG_COLORS[0].value);
  const [status, setStatus] = useState<FaseStatus>("nao_iniciada");
  const [error, setError] = useState("");
  const members = loadTeamMembers();

  useEffect(() => {
    if (!open) return;
    setNome(initial?.nome ?? "");
    setDescricao(initial?.descricao ?? "");
    setDataInicio(initial?.dataInicio ?? "");
    setDataFim(initial?.dataFim ?? "");
    setResponsavelPrincipal(initial?.responsavelPrincipal ?? "");
    setCor(initial?.cor ?? TASK_TAG_COLORS[0].value);
    setStatus(initial?.status ?? "nao_iniciada");
    setError("");
  }, [open, initial]);

  const save = () => {
    if (!nome.trim()) {
      setError("Nome é obrigatório.");
      return;
    }
    if (!dataInicio) {
      setError("Data de início é obrigatória.");
      return;
    }
    if (!dataFim) {
      setError("Data final é obrigatória.");
      return;
    }
    if (dataFim < dataInicio) {
      setError("Data final não pode ser anterior à inicial.");
      return;
    }
    onSave({
      nome: nome.trim(),
      descricao: descricao.trim() || undefined,
      dataInicio,
      dataFim,
      status,
      responsavelPrincipal: responsavelPrincipal || undefined,
      cor,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullScreen className="flex max-h-[85vh] max-w-lg flex-col gap-0 p-0">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Milestone className="h-4 w-4 text-muted-foreground" />
            {initial ? "Editar fase" : "Nova fase"}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Nome</label>
            <input
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Definição do plano estratégico"
              className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Descrição
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              placeholder="Opcional"
              className="w-full resize-none rounded-md border border-input bg-background px-2.5 py-2 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Data de início
              </label>
              <DateField
                value={dataInicio || undefined}
                onChange={(v) => setDataInicio(v ?? "")}
                max={dataFim || undefined}
                ariaLabel="Data de início da fase"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Data final
              </label>
              <DateField
                value={dataFim || undefined}
                onChange={(v) => setDataFim(v ?? "")}
                min={dataInicio || undefined}
                ariaLabel="Data final da fase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Responsável principal
              </label>
              <select
                value={responsavelPrincipal}
                onChange={(e) => setResponsavelPrincipal(e.target.value)}
                className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              >
                <option value="">Sem responsável</option>
                {members.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                Status inicial
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as FaseStatus)}
                className="h-9 w-full cursor-pointer rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
              >
                {FASE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {FASE_STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Cor</label>
            <ColorSwatches value={cor} onPick={setCor} />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="border-t border-border px-6 py-3.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={save}
            className="cursor-pointer rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
          >
            {initial ? "Salvar" : "Criar fase"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
