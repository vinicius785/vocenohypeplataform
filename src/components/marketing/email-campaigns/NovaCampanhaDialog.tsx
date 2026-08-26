import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { upsertEmailCampaign } from "@/lib/email-campaigns.functions";
import {
  CAMPAIGN_OBJETIVOS,
  CAMPAIGN_OBJETIVO_LABEL,
  type CampaignObjetivo,
} from "@/lib/email-campaigns-constants";

/**
 * Criação (ou edição dos campos básicos) de campanha — uma tela só,
 * compacta: nome + objetivo + descrição opcional. Campanha nasce vazia,
 * sem público/etapa/agendamento obrigatório (isso é configurado depois,
 * na página da campanha).
 */
export function NovaCampanhaDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: { id: string; name: string; description: string | null; objetivo: string };
  onSaved: (id: string) => void;
}) {
  const saveFn = useServerFn(upsertEmailCampaign);
  const [name, setName] = useState(initial?.name ?? "");
  const [objetivo, setObjetivo] = useState<CampaignObjetivo>(
    (initial?.objetivo as CampaignObjetivo) ?? "outro",
  );
  const [description, setDescription] = useState(initial?.description ?? "");
  const [showDescription, setShowDescription] = useState(!!initial?.description);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await saveFn({ data: { id: initial?.id, name, objetivo, description } });
      onSaved(saved.id);
      if (!initial) {
        setName("");
        setDescription("");
        setShowDescription(false);
        setObjetivo("outro");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar campanha" : "Nova campanha"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Nome</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Convite para evento de outubro"
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">Objetivo</span>
            <select
              value={objetivo}
              onChange={(e) => setObjetivo(e.target.value as CampaignObjetivo)}
              className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            >
              {CAMPAIGN_OBJETIVOS.map((o) => (
                <option key={o} value={o}>
                  {CAMPAIGN_OBJETIVO_LABEL[o]}
                </option>
              ))}
            </select>
          </label>
          {showDescription ? (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">Descrição (opcional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </label>
          ) : (
            <button
              type="button"
              onClick={() => setShowDescription(true)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              + Adicionar descrição
            </button>
          )}
        </div>
        <DialogFooter>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !name.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            {saving ? "Salvando..." : initial ? "Salvar" : "Criar campanha"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
