import { useRef, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DateField } from "@/components/ui/date-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Textarea } from "@/components/ui/textarea";
import { TimeField } from "@/components/ui/time-field";
import { useConfirm } from "@/hooks/use-confirm";
import type { Lead } from "@/lib/comercial";
import {
  INTERACTION_OUTCOME_LABEL,
  INTERACTION_TYPE_LABEL,
  type InteractionOutcome,
  type InteractionType,
} from "@/lib/commercial-interactions.functions";
import {
  buildFollowUpInput,
  DEFAULT_NEXT_ACTION,
  defaultNextActionTime,
  initialFollowUpState,
  isFollowUpDirty,
  localDateTimeToIso,
  NEXT_ACTION_MAX,
  NEXT_ACTION_OPTIONS,
  quickNextDates,
  SUMMARY_MAX,
  suggestNextFromOutcome,
  validateFollowUp,
  type FollowUpFormState,
  type FollowUpInput,
} from "@/lib/comercial-followup-form";
import { formatTimelineWhen, nextActionDisplay } from "@/lib/comercial-lead-view";
import { formatDateToIso } from "@/lib/utils";

export type { FollowUpInput };

const TYPES = Object.keys(INTERACTION_TYPE_LABEL) as InteractionType[];
const TYPE_OPTIONS = TYPES.map((t) => ({ value: t, label: INTERACTION_TYPE_LABEL[t] }));

/** Do mais quente ao mais frio — é a leitura comercial do contato. */
const OUTCOMES: InteractionOutcome[] = [
  "interessado",
  "proposta_solicitada",
  "reuniao_agendada",
  "respondeu",
  "aguardando_retorno",
  "nao_respondeu",
  "sem_interesse",
];

const OTHER_ACTION = "__outra";
type DateMode = "hoje" | "amanha" | "outra";
const DATE_OPTIONS: { value: DateMode; label: string }[] = [
  { value: "hoje", label: "Hoje" },
  { value: "amanha", label: "Amanhã" },
  { value: "outra", label: "Outra data" },
];

const labelCls = "text-xs font-medium text-text-secondary";
const errorCls = "text-xs text-danger";

/**
 * Registro rápido de follow-up, sem abrir a ficha. Na ordem de leitura:
 * CONTATO (como e quando) → RESULTADO → RESUMO → PRÓXIMA AÇÃO → salvar.
 * Defaults para ser rápido: WhatsApp, "agora" e a próxima ação mais comum
 * (amanhã 09:00); com uma próxima ação já combinada no lead, o padrão é
 * mantê-la. Nunca altera a etapa do pipeline; só grava a interação e, se
 * informada, a próxima ação (ver `registerFollowUp`). Lógica (padrões,
 * validação, payload) em `lib/comercial-followup-form.ts`.
 */
export function FollowUpDialog({
  lead,
  open,
  onOpenChange,
  onSubmit,
}: {
  lead: Lead;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSubmit: (input: FollowUpInput) => Promise<void>;
}) {
  const makeInitial = () => initialFollowUpState(new Date(), lead);
  const [form, setForm] = useState<FollowUpFormState>(makeInitial);
  const [editingWhen, setEditingWhen] = useState(false);
  const [dateMode, setDateMode] = useState<DateMode>("amanha");
  const [pickerKey, setPickerKey] = useState(0);
  const [customAction, setCustomAction] = useState(false);
  // Enquanto a pessoa não mexe na próxima ação, o resultado sugere uma. Com uma
  // já combinada no lead, nunca sugerimos nada por cima dela.
  const [nextTouched, setNextTouched] = useState(() => !!lead.nextActionAt);
  const [timeTouched, setTimeTouched] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  const { confirm, confirmDialog } = useConfirm();

  const patch = (p: Partial<FollowUpFormState>) => setForm((f) => ({ ...f, ...p }));

  const { errors, warnings, valid } = validateFollowUp(form);
  const today = formatDateToIso(new Date());
  const [qHoje, qAmanha] = quickNextDates();
  const current = nextActionDisplay(lead);
  const hasNextAction = !form.noNextAction;
  const isListed = (NEXT_ACTION_OPTIONS as readonly string[]).includes(form.nextActionDescription);
  const showCustom = customAction || (!isListed && !!form.nextActionDescription);
  const whenLabel = formatTimelineWhen(
    new Date(localDateTimeToIso(form.occurredDate, form.occurredTime) ?? Date.now()).getTime(),
  );

  /** Mexeu em algo que abriu preenchido (tipo, momento ou próxima ação)? */
  const changedDefaults = (() => {
    const base = makeInitial();
    return (
      form.interactionType !== base.interactionType ||
      form.occurredDate !== base.occurredDate ||
      form.occurredTime !== base.occurredTime ||
      form.noNextAction !== base.noNextAction ||
      form.nextActionDescription !== base.nextActionDescription ||
      form.nextDate !== base.nextDate ||
      form.nextTime !== base.nextTime
    );
  })();

  const reset = () => {
    setForm(makeInitial());
    setEditingWhen(false);
    setDateMode("amanha");
    setCustomAction(false);
    setNextTouched(!!lead.nextActionAt);
    setTimeTouched(false);
    setAttempted(false);
    setError("");
  };

  const handleOpenChange = async (v: boolean) => {
    if (v) return onOpenChange(true);
    if (saving) return;
    if (isFollowUpDirty(form, changedDefaults)) {
      const discard = await confirm("O que você preencheu neste follow-up será perdido.", {
        title: "Descartar follow-up?",
        confirmLabel: "Descartar",
        destructive: true,
      });
      if (!discard) return;
    }
    reset();
    onOpenChange(false);
  };

  const handleSave = async () => {
    if (saving) return;
    setAttempted(true);
    if (!valid) {
      if (errors.summary) summaryRef.current?.focus();
      else if (errors.nextActionDescription) customRef.current?.focus();
      return;
    }
    const input = buildFollowUpInput(form);
    if (!input) return;
    setSaving(true);
    setError("");
    try {
      await onSubmit(input);
      reset();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível registrar o follow-up.");
    } finally {
      setSaving(false);
    }
  };

  const pickOutcome = (value: string) => {
    const outcome = value as InteractionOutcome | "";
    const suggestion = outcome && !nextTouched ? suggestNextFromOutcome(outcome) : null;
    if (suggestion) {
      setCustomAction(false);
      setDateMode("amanha");
    }
    patch({ outcome, ...(suggestion ?? {}) });
  };

  const pickDateMode = (mode: DateMode) => {
    setNextTouched(true);
    setDateMode(mode);
    if (mode === "outra") {
      setPickerKey((k) => k + 1); // abre (ou reabre) o calendário
      return;
    }
    const date = mode === "hoje" ? qHoje.date : qAmanha.date;
    patch({
      nextDate: date,
      ...(timeTouched ? {} : { nextTime: defaultNextActionTime(date) }),
    });
  };

  const pickAction = (value: string) => {
    setNextTouched(true);
    if (value === OTHER_ACTION) {
      setCustomAction(true);
      patch({
        noNextAction: false,
        nextActionDescription: isListed ? "" : form.nextActionDescription,
      });
      setTimeout(() => customRef.current?.focus(), 0);
      return;
    }
    setCustomAction(false);
    patch({
      noNextAction: false,
      nextActionDescription: value,
      nextDate: form.nextDate || qAmanha.date,
    });
  };

  const toggleNoNext = (checked: boolean) => {
    setNextTouched(true);
    if (checked) {
      setCustomAction(false);
      patch({ noNextAction: true });
    } else {
      patch({
        noNextAction: false,
        nextActionDescription: form.nextActionDescription || DEFAULT_NEXT_ACTION,
        nextDate: form.nextDate || qAmanha.date,
      });
      if (!form.nextDate) setDateMode("amanha");
    }
  };

  const contactLine = [lead.contact, lead.role].filter(Boolean).join(" · ");

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => void handleOpenChange(v)}>
        <DialogContent
          mobileFullScreen
          className="max-w-[460px] grid-cols-[minmax(0,1fr)] gap-4 p-5"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            summaryRef.current?.focus();
          }}
        >
          <DialogHeader className="space-y-0.5 pr-6">
            <DialogTitle className="text-base">Registrar follow-up</DialogTitle>
            <DialogDescription className="truncate text-sm">
              <span className="font-medium text-foreground">{lead.company || lead.name}</span>
              {contactLine ? ` · ${contactLine}` : ""}
            </DialogDescription>
          </DialogHeader>

          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSave();
            }}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
          >
            <fieldset disabled={saving} className="min-w-0 space-y-4 border-0 p-0">
              {/* CONTATO — como e quando (o momento é discreto; padrão: agora) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className={labelCls}>Contato</p>
                  {!editingWhen && (
                    <button
                      type="button"
                      onClick={() => setEditingWhen(true)}
                      title="Alterar data e hora do contato"
                      className="inline-flex items-center gap-1 rounded text-xs tabular-nums text-text-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {whenLabel}
                    </button>
                  )}
                </div>
                <SegmentedControl
                  aria-label="Tipo de contato"
                  size="sm"
                  fullWidth
                  value={form.interactionType}
                  onChange={(v) => patch({ interactionType: v })}
                  options={TYPE_OPTIONS}
                />
                {editingWhen && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <DateField
                        ariaLabel="Data do contato"
                        value={form.occurredDate}
                        max={today}
                        onChange={(v) => v && patch({ occurredDate: v })}
                        className="min-w-0 flex-1"
                      />
                      <TimeField
                        ariaLabel="Hora do contato"
                        value={form.occurredTime}
                        onChange={(v) => patch({ occurredTime: v })}
                        className="w-24 shrink-0"
                      />
                    </div>
                    {errors.occurredAt && <p className={errorCls}>{errors.occurredAt}</p>}
                  </div>
                )}
              </div>

              {/* RESULTADO */}
              <div className="space-y-1.5">
                <label htmlFor="fu-outcome" className={labelCls}>
                  Resultado
                </label>
                <NativeSelect
                  id="fu-outcome"
                  value={form.outcome}
                  onChange={(e) => pickOutcome(e.target.value)}
                >
                  <option value="">Como foi o contato?</option>
                  {OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {INTERACTION_OUTCOME_LABEL[o]}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              {/* RESUMO */}
              <div className="space-y-1.5">
                <label htmlFor="fu-summary" className={labelCls}>
                  Resumo
                </label>
                <Textarea
                  id="fu-summary"
                  ref={summaryRef}
                  value={form.summary}
                  onChange={(e) => patch({ summary: e.target.value })}
                  placeholder="O que foi conversado ou combinado?"
                  className="h-16 resize-none py-2"
                  maxLength={SUMMARY_MAX}
                  aria-invalid={attempted && !!errors.summary}
                />
                {attempted && errors.summary && (
                  <p role="alert" className={errorCls}>
                    {errors.summary}
                  </p>
                )}
              </div>

              {/* PRÓXIMA AÇÃO */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <label htmlFor="fu-next" className={labelCls}>
                    Próxima ação
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-xs text-text-secondary">
                    <Checkbox
                      checked={form.noNextAction}
                      onCheckedChange={(c) => toggleNoNext(c === true)}
                      aria-label="Sem próxima ação"
                    />
                    Sem próxima ação
                  </label>
                </div>

                {hasNextAction ? (
                  <>
                    <NativeSelect
                      id="fu-next"
                      value={showCustom ? OTHER_ACTION : form.nextActionDescription}
                      onChange={(e) => pickAction(e.target.value)}
                      aria-invalid={attempted && !!errors.nextActionDescription}
                    >
                      {!showCustom && !form.nextActionDescription && (
                        <option value="">O que precisa acontecer?</option>
                      )}
                      {NEXT_ACTION_OPTIONS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                      <option value={OTHER_ACTION}>Outra…</option>
                    </NativeSelect>
                    {showCustom && (
                      <Input
                        ref={customRef}
                        aria-label="Qual é a próxima ação?"
                        value={form.nextActionDescription}
                        onChange={(e) => {
                          setNextTouched(true);
                          patch({ nextActionDescription: e.target.value });
                        }}
                        placeholder="Qual é a próxima ação?"
                        maxLength={NEXT_ACTION_MAX}
                        aria-invalid={attempted && !!errors.nextActionDescription}
                      />
                    )}
                    {attempted && errors.nextActionDescription && (
                      <p role="alert" className={errorCls}>
                        {errors.nextActionDescription}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <SegmentedControl
                        aria-label="Quando fazer a próxima ação"
                        size="sm"
                        value={dateMode}
                        onChange={pickDateMode}
                        options={DATE_OPTIONS}
                      />
                      <TimeField
                        ariaLabel="Hora da próxima ação"
                        value={form.nextTime}
                        onChange={(v) => {
                          setNextTouched(true);
                          setTimeTouched(true);
                          patch({ nextTime: v });
                        }}
                        className="w-24 shrink-0"
                      />
                    </div>
                    {dateMode === "outra" && (
                      <DateField
                        key={pickerKey}
                        autoOpen={pickerKey > 0}
                        ariaLabel="Data da próxima ação"
                        value={form.nextDate || undefined}
                        min={today}
                        placeholder="Escolher data"
                        onChange={(v) => {
                          setNextTouched(true);
                          patch({
                            nextDate: v ?? "",
                            ...(v && !timeTouched ? { nextTime: defaultNextActionTime(v) } : {}),
                          });
                        }}
                      />
                    )}
                    {attempted && (errors.nextDate || errors.nextTime) && (
                      <p role="alert" className={errorCls}>
                        {errors.nextDate ?? errors.nextTime}
                      </p>
                    )}
                    {warnings.nextActionPast && (
                      <p className="flex items-center gap-1.5 text-xs text-warning-soft-foreground">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {warnings.nextActionPast}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-text-secondary">
                    Será registrado sem criar uma pendência.
                    {current ? ` A próxima ação atual continua: ${current.text}.` : ""}
                  </p>
                )}
              </div>
            </fieldset>

            {error && (
              <Alert variant="destructive" className="py-2 text-sm">
                {error}
              </Alert>
            )}

            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="ghost"
                disabled={saving}
                onClick={() => void handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" isLoading={saving} title="Ctrl/⌘ + Enter">
                Registrar follow-up
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}
