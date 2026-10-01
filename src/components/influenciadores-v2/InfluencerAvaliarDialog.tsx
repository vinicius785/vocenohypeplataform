import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AVALIACAO_CRITERIOS,
  type CampanhaInfluenciadorAvaliacao,
} from "@/lib/campanha-influenciador-avaliacao";
import { upsertAvaliacao } from "@/lib/campanha-influenciador-avaliacao.functions";
import type { ParticipacaoCampanha } from "@/lib/influencer-banco-v2";

type Notas = Record<(typeof AVALIACAO_CRITERIOS)[number]["key"], number>;

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="p-0.5"
          aria-label={`${n} estrelas`}
        >
          <Star
            className={`h-5 w-5 ${n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
          />
        </button>
      ))}
    </div>
  );
}

/** Avaliação manual do time — SEM relação nenhuma com NPS (que é a
 * experiência do influenciador, respondida por ele) nem com a antiga
 * "confiabilidade" automática (removida). Nunca obrigatório: só aparece
 * quando a campanha já está concluída, e pode ficar pra depois. */
export function InfluencerAvaliarDialog({
  open,
  participacao,
  existing,
  onClose,
  onSaved,
}: {
  open: boolean;
  participacao: ParticipacaoCampanha | null;
  existing: CampanhaInfluenciadorAvaliacao | null;
  onClose: () => void;
  onSaved: (a: CampanhaInfluenciadorAvaliacao) => void;
}) {
  const doUpsert = useServerFn(upsertAvaliacao);
  const [notas, setNotas] = useState<Notas>({
    cumprimentoCombinados: 0,
    comunicacao: 0,
    qualidadeEntregas: 0,
    aderenciaBriefing: 0,
    organizacaoProfissionalismo: 0,
  });
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNotas({
      cumprimentoCombinados: existing?.cumprimentoCombinados ?? 0,
      comunicacao: existing?.comunicacao ?? 0,
      qualidadeEntregas: existing?.qualidadeEntregas ?? 0,
      aderenciaBriefing: existing?.aderenciaBriefing ?? 0,
      organizacaoProfissionalismo: existing?.organizacaoProfissionalismo ?? 0,
    });
    setObservacao(existing?.observacao ?? "");
  }, [open, existing]);

  const complete = AVALIACAO_CRITERIOS.every((c) => notas[c.key] > 0);

  const handleSave = async () => {
    if (!participacao || !complete) return;
    setSaving(true);
    try {
      const saved = await doUpsert({
        data: {
          campanhaInfluenciadorId: participacao.campanhaInfluenciadorId,
          campanhaId: participacao.campanhaId,
          ...notas,
          observacao: observacao.trim() || undefined,
        },
      });
      toast.success("Avaliação salva.");
      onSaved(saved);
    } catch {
      toast.error("Não foi possível salvar a avaliação.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Avaliação do time</DialogTitle>
        </DialogHeader>
        {participacao && (
          <p className="-mt-2 text-xs text-text-secondary">{participacao.campanhaNome}</p>
        )}

        <div className="space-y-3 py-1">
          {AVALIACAO_CRITERIOS.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">{c.label}</span>
              <StarPicker
                value={notas[c.key]}
                onChange={(v) => setNotas((prev) => ({ ...prev, [c.key]: v }))}
              />
            </div>
          ))}

          <div className="pt-1">
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Observação (opcional)"
              rows={3}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!complete || saving}>
            {saving ? "Salvando..." : "Salvar avaliação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
