import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  upsertAeoResposta,
  type AeoIa,
  type AeoNarrativa,
  type AeoPosicao,
  type AeoPrompt,
  type AeoResposta,
} from "@/lib/aeo-store";
import { proximoPromptNaoPreenchido } from "@/lib/aeo-engine";
import { TagChipInput } from "../shared/TagChipInput";
import { PosicaoButtonGroup } from "../shared/PosicaoButtonGroup";
import { NarrativaButtonGroup } from "../shared/NarrativaButtonGroup";
import { EvidenciaField } from "../shared/EvidenciaField";

type FormState = {
  citada: boolean;
  posicao?: AeoPosicao;
  rawResposta: string;
  descricao: string;
  concorrentes: string[];
  fontes: string[];
  narrativa?: AeoNarrativa;
  evidenciaPath?: string;
  evidenciaUrl?: string;
};

function respostaFor(respostas: AeoResposta[], rodadaId: string, promptId: string, ia: AeoIa) {
  return respostas.find((r) => r.rodadaId === rodadaId && r.promptId === promptId && r.ia === ia);
}

function emptyForm(): FormState {
  return {
    citada: false,
    posicao: undefined,
    rawResposta: "",
    descricao: "",
    concorrentes: [],
    fontes: [],
    narrativa: undefined,
    evidenciaPath: undefined,
    evidenciaUrl: undefined,
  };
}

function formFrom(r: AeoResposta | undefined): FormState {
  if (!r) return emptyForm();
  return {
    citada: r.citada,
    posicao: r.posicao,
    rawResposta: r.rawResposta ?? "",
    descricao: r.descricao ?? "",
    concorrentes: r.concorrentes,
    fontes: r.fontes,
    narrativa: r.narrativa,
    evidenciaPath: r.evidenciaPath,
    evidenciaUrl: r.evidenciaUrl,
  };
}

/** O componente-chave da correção do bug de vazamento entre IAs — o
 * `key` no `RespostaDrawerBody` (rodadaId+promptId+ia) força o React a
 * desmontar e remontar o formulário inteiro toda vez que qualquer um dos
 * 3 muda. Nenhum estado sobrevive a essa troca, então nunca há como o
 * texto de uma IA vazar pra outra — é a garantia arquitetural pedida,
 * não só uma correção pontual. */
export function RespostaDrawer({
  rodadaId,
  ia,
  prompt,
  ativos,
  respostas,
  open,
  onOpenChange,
  onNavigatePrompt,
}: {
  rodadaId: string;
  ia: AeoIa;
  prompt: AeoPrompt | null;
  ativos: AeoPrompt[];
  respostas: AeoResposta[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigatePrompt: (prompt: AeoPrompt) => void;
}) {
  if (!prompt) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        <SheetTitle className="sr-only">
          {prompt.idCodigo} · {ia}
        </SheetTitle>
        <RespostaDrawerBody
          key={`${rodadaId}-${prompt.id}-${ia}`}
          rodadaId={rodadaId}
          ia={ia}
          prompt={prompt}
          ativos={ativos}
          respostas={respostas}
          onNavigatePrompt={onNavigatePrompt}
          onClose={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function RespostaDrawerBody({
  rodadaId,
  ia,
  prompt,
  ativos,
  respostas,
  onNavigatePrompt,
  onClose,
}: {
  rodadaId: string;
  ia: AeoIa;
  prompt: AeoPrompt;
  ativos: AeoPrompt[];
  respostas: AeoResposta[];
  onNavigatePrompt: (prompt: AeoPrompt) => void;
  onClose: () => void;
}) {
  const initial = respostaFor(respostas, rodadaId, prompt.id, ia);
  const [form, setForm] = useState<FormState>(() => formFrom(initial));
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);

  const patch = (p: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...p }));
    setDirty(true);
  };

  const ordenados = [...ativos].sort((a, b) => a.idCodigo.localeCompare(b.idCodigo));
  const idx = ordenados.findIndex((p) => p.id === prompt.id);
  const anterior = idx > 0 ? ordenados[idx - 1] : idx === 0 ? ordenados.at(-1) : undefined;
  const proximo = idx >= 0 && idx < ordenados.length - 1 ? ordenados[idx + 1] : ordenados[0];

  const confirmNavigateAway = () => {
    if (!dirty) return true;
    return window.confirm("Há alterações não salvas nesta resposta. Descartar e continuar?");
  };

  const save = (): AeoResposta => {
    const result = upsertAeoResposta(rodadaId, prompt.id, ia, {
      citada: form.citada,
      posicao: form.posicao,
      rawResposta: form.rawResposta || undefined,
      descricao: form.descricao || undefined,
      concorrentes: form.concorrentes,
      fontes: form.fontes,
      narrativa: form.narrativa,
      evidenciaPath: form.evidenciaPath,
      evidenciaUrl: form.evidenciaUrl,
    });
    setDirty(false);
    setSaved(true);
    return result;
  };

  const handleSalvarEProximo = () => {
    const savedResposta = save();
    const nextRespostas = respostas.some((r) => r.id === savedResposta.id)
      ? respostas.map((r) => (r.id === savedResposta.id ? savedResposta : r))
      : [...respostas, savedResposta];
    const next = proximoPromptNaoPreenchido(ativos, rodadaId, ia, nextRespostas, prompt.id);
    if (next) onNavigatePrompt(next);
    else onClose();
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <button
          type="button"
          onClick={() => {
            if (anterior && confirmNavigateAway()) onNavigatePrompt(anterior);
          }}
          disabled={!anterior}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prompt anterior
        </button>
        <button
          type="button"
          onClick={() => {
            if (proximo && confirmNavigateAway()) onNavigatePrompt(proximo);
          }}
          disabled={!proximo}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          Próximo prompt <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {prompt.idCodigo} · {ia} · Rodada
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{prompt.texto}</p>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">
            Resposta da IA
          </label>
          <textarea
            value={form.rawResposta}
            onChange={(e) => patch({ rawResposta: e.target.value })}
            placeholder="Cole aqui a resposta completa da IA"
            rows={5}
            className="mt-1 w-full rounded-md border border-border bg-background p-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">
            A VNH foi citada?
          </label>
          <div className="mt-1 inline-flex rounded-md border border-border p-0.5">
            <button
              type="button"
              onClick={() => patch({ citada: true })}
              className={`rounded px-3 py-1 text-xs font-medium ${
                form.citada
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sim
            </button>
            <button
              type="button"
              onClick={() => patch({ citada: false, posicao: "nao_se_aplica" })}
              className={`rounded px-3 py-1 text-xs font-medium ${
                !form.citada
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Não
            </button>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">Posição</label>
          <div className="mt-1">
            <PosicaoButtonGroup
              value={form.posicao}
              onChange={(v) => patch({ posicao: v })}
              disabled={!form.citada}
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">
            Como a VNH foi descrita?
          </label>
          <input
            value={form.descricao}
            onChange={(e) => patch({ descricao: e.target.value })}
            className="mt-1 h-8 w-full rounded-md border border-border bg-background px-2 text-xs outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">
            Concorrentes citados
          </label>
          <div className="mt-1">
            <TagChipInput
              value={form.concorrentes}
              onChange={(v) => patch({ concorrentes: v })}
              placeholder="Adicionar concorrente..."
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">
            Fontes utilizadas
          </label>
          <div className="mt-1">
            <TagChipInput
              value={form.fontes}
              onChange={(v) => patch({ fontes: v })}
              placeholder="Adicionar fonte..."
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">Narrativa</label>
          <div className="mt-1">
            <NarrativaButtonGroup
              value={form.narrativa}
              onChange={(v) => patch({ narrativa: v })}
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">Evidência</label>
          <div className="mt-1">
            <EvidenciaField
              rodadaId={rodadaId}
              promptId={prompt.id}
              ia={ia}
              evidenciaPath={form.evidenciaPath}
              evidenciaUrl={form.evidenciaUrl}
              onChange={(next) => patch(next)}
            />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        {saved && !dirty ? (
          <Button size="sm" onClick={handleSalvarEProximo}>
            Salvar e próximo →
          </Button>
        ) : (
          <Button size="sm" onClick={() => save()}>
            Salvar resposta
          </Button>
        )}
      </div>
    </div>
  );
}
