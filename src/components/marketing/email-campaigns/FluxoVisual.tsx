import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Mail, Clock, ChevronUp, ChevronDown, Trash2, Plus, Flag, PlayCircle } from "lucide-react";
import { useConfirm } from "@/hooks/use-confirm";
import {
  deleteCampaignStep,
  reorderCampaignStep,
  upsertCampaignStep,
  type listEmailTemplates,
  type getCampaignDetail,
} from "@/lib/email-campaigns.functions";
import {
  RECIPIENT_RULE_LABEL,
  SEND_MODE_LABEL,
  type RecipientRule,
  type SendMode,
} from "@/lib/email-campaigns-constants";
import { EtapaEmailEditor } from "./EtapaEmailEditor";
import { fmtDateTime } from "./email-ui-utils";

type Detail = Awaited<ReturnType<typeof getCampaignDetail>>;
type Step = Detail["steps"][number];
type Template = Awaited<ReturnType<typeof listEmailTemplates>>[number];

const STEP_STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  pronta: "Pronta",
  agendada: "Agendada",
  enviando: "Enviando",
  enviado: "Enviado",
  erro: "Erro",
};

export function FluxoVisual({
  campaignId,
  steps,
  templates,
  onChanged,
}: {
  campaignId: string;
  steps: Step[];
  templates: Template[];
  onChanged: () => void;
}) {
  const deleteFn = useServerFn(deleteCampaignStep);
  const reorderFn = useServerFn(reorderCampaignStep);
  const saveStepFn = useServerFn(upsertCampaignStep);
  const { confirm, confirmDialog } = useConfirm();

  const [editing, setEditing] = useState<Step | "new" | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const sorted = [...steps].sort((a, b) => a.position - b.position);

  const addWaitStep = async () => {
    setAddOpen(false);
    await saveStepFn({ data: { campaignId, kind: "wait", waitDays: 2 } });
    onChanged();
  };

  const remove = async (id: string) => {
    const ok = await confirm(
      "Essa etapa vai ser removida da sequência. Esta ação não pode ser desfeita.",
    );
    if (!ok) return;
    await deleteFn({ data: { id } });
    onChanged();
  };

  const move = async (id: string, direction: "up" | "down") => {
    await reorderFn({ data: { campaignId, id, direction } });
    onChanged();
  };

  const updateWaitDays = async (step: Step, days: number) => {
    await saveStepFn({
      data: { id: step.id, campaignId, kind: "wait", waitDays: Math.max(0, days) },
    });
    onChanged();
  };

  return (
    <div className="space-y-3">
      {confirmDialog}
      <FlowNode icon={PlayCircle} label="Início" />

      {sorted.map((step, i) => (
        <div key={step.id} className="flex items-start gap-2">
          <div className="flex shrink-0 flex-col pt-3">
            <button
              type="button"
              onClick={() => void move(step.id, "up")}
              disabled={i === 0}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Mover pra cima"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void move(step.id, "down")}
              disabled={i === sorted.length - 1}
              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
              aria-label="Mover pra baixo"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>

          {step.kind === "wait" ? (
            <div className="flex flex-1 items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-3 py-2.5">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Aguardar</span>
              <input
                type="number"
                min={0}
                value={step.wait_days ?? 0}
                onChange={(e) => void updateWaitDays(step, Number(e.target.value))}
                className="w-14 rounded-md border border-border bg-background px-1.5 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
              />
              <span className="text-xs text-muted-foreground">dia(s) antes da próxima etapa</span>
              <button
                type="button"
                onClick={() => void remove(step.id)}
                className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(step)}
              className="group flex-1 rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-foreground/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">
                      {step.internal_name || "E-mail sem nome"}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {step.subject || "Sem assunto"}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {STEP_STATUS_LABEL[step.status] ?? step.status}
                  </span>
                  <Trash2
                    className="h-3.5 w-3.5 cursor-pointer text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(step.id);
                    }}
                  />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {RECIPIENT_RULE_LABEL[step.recipient_rule as RecipientRule]} ·{" "}
                {SEND_MODE_LABEL[step.send_mode as SendMode]}
                {step.send_mode === "agendado" &&
                  step.scheduled_at &&
                  ` (${fmtDateTime(step.scheduled_at)})`}
              </p>
            </button>
          )}
        </div>
      ))}

      <div className="relative">
        <button
          type="button"
          onClick={() => setAddOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Adicionar etapa
        </button>
        {addOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 w-56 rounded-md border border-border bg-background p-1 shadow-md">
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setEditing("new");
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
            >
              <Mail className="h-3.5 w-3.5" /> Enviar e-mail
            </button>
            <button
              type="button"
              onClick={() => void addWaitStep()}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
            >
              <Clock className="h-3.5 w-3.5" /> Aguardar
            </button>
          </div>
        )}
      </div>

      <FlowNode icon={Flag} label="Fim" />

      <EtapaEmailEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        campaignId={campaignId}
        step={editing && editing !== "new" ? editing : undefined}
        templates={templates}
        onSaved={onChanged}
      />
    </div>
  );
}

function FlowNode({ icon: Icon, label }: { icon: typeof Flag; label: string }) {
  return (
    <div className="ml-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5" /> {label}
    </div>
  );
}
