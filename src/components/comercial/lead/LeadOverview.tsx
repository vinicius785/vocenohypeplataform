import { AlertTriangle, Star } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { formatBRL, type Lead } from "@/lib/comercial";
import {
  daysSinceLastContact,
  daysSinceLastStageChange,
  hasNoRecentContact,
  isOpportunityStale,
  legacyStage,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STAGE_LABEL,
} from "@/lib/comercial-engine";
import { parseMoney, type LeadDraft } from "@/lib/comercial-lead-draft";
import { propostaMargem, type TimelineItem } from "@/lib/comercial-lead-view";
import type { TeamMemberLite } from "@/lib/projetos";
import { formatIsoDate } from "@/lib/utils";
import { Fact } from "./Fact";
import { InlineField } from "./InlineField";
import { TimelineList } from "./LeadTimeline";

const SOURCES = ["Indicação", "Instagram", "Google", "LinkedIn", "Site", "Evento", "Outro"];

const headingCls = "text-[15px] font-semibold text-foreground";

export type LeadFieldApi = {
  draft: LeadDraft;
  setField: <K extends keyof LeadDraft>(key: K, value: LeadDraft[K]) => void;
  /** Salva os campos (o `patch` entra no rascunho antes de salvar, sem
   * depender de o React ter re-renderizado). */
  commit: (patch?: Partial<LeadDraft>) => void;
};

const pluralDias = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

/** Contexto da negociação num relance — tempo na etapa, último contato,
 * proposta e (quando existirem) previsão de fechamento e probabilidade.
 * Só mostra dado que existe; nada é inventado. */
function NegotiationFacts({
  lead,
  draft,
  valueDiverges,
  onOpenProposal,
}: {
  lead: Lead;
  draft: LeadDraft;
  valueDiverges: boolean;
  onOpenProposal: () => void;
}) {
  const stage = legacyStage(lead.stage);
  const terminal = stage === "GANHO" || stage === "PERDIDO";
  const stageDays = daysSinceLastStageChange(lead);
  const contactDays = daysSinceLastContact(lead);
  const margem = draft.proposta ? propostaMargem(draft.proposta) : null;
  const hasForecast = !!lead.expectedCloseAt || lead.probability !== undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {!terminal && (
          <Fact label="Na etapa há" tone={isOpportunityStale(lead) ? "warning" : "neutral"}>
            {stageDays === 0 ? "Hoje" : pluralDias(stageDays)}
          </Fact>
        )}
        {!terminal && (
          <Fact label="Último contato" tone={hasNoRecentContact(lead) ? "warning" : "neutral"}>
            {contactDays === null
              ? "Nunca contatado"
              : contactDays === 0
                ? "Hoje"
                : contactDays === 1
                  ? "Ontem"
                  : `há ${contactDays} dias`}
          </Fact>
        )}
        <Fact label="Proposta" tone={valueDiverges ? "warning" : "neutral"}>
          {draft.proposta ? (
            <button
              type="button"
              onClick={onOpenProposal}
              className="rounded text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {formatBRL(draft.proposta.precoFinal)}
              {margem?.pct != null && (
                <span className="ml-1 text-xs font-normal text-text-secondary">
                  · margem {Math.round(margem.pct * 100)}%
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenProposal}
              className="rounded text-left font-normal text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Não criada
            </button>
          )}
        </Fact>
        {hasForecast && (
          <Fact label="Previsão de fechamento">
            {lead.expectedCloseAt ? formatIsoDate(lead.expectedCloseAt.slice(0, 10)) : "—"}
            {lead.probability !== undefined && (
              <span className="ml-1 text-xs font-normal text-text-secondary">
                · {Math.round(lead.probability)}%
              </span>
            )}
          </Fact>
        )}
      </div>
    </div>
  );
}

/**
 * Visão geral do lead. Com o lead salvo: contexto da negociação → últimas
 * interações → dados do lead (leitura compacta, edição inline ao clicar).
 * Na criação (sem lead): só o formulário, sempre editável.
 */
export function LeadOverview({
  lead,
  fields,
  team,
  timeline,
  valueDiverges,
  onOpenProposal,
  onOpenHistory,
  onRegisterFollowUp,
}: {
  lead: Lead | null;
  fields: LeadFieldApi;
  team: TeamMemberLite[];
  timeline: TimelineItem[];
  valueDiverges: boolean;
  onOpenProposal: () => void;
  onOpenHistory: () => void;
  onRegisterFollowUp?: () => void;
}) {
  const { draft, setField, commit } = fields;
  const isNew = !lead;

  const text = (
    key: "name" | "company" | "contact" | "role" | "vertical" | "email" | "phone" | "urgency",
    label: string,
    opts: { maxLength: number; type?: string; required?: boolean; className?: string } = {
      maxLength: 120,
    },
  ) => (
    <InlineField
      label={label}
      display={draft[key]}
      empty={!draft[key].trim()}
      always={isNew}
      required={opts.required}
      className={opts.className}
      onCommit={() => commit()}
      render={(p) => (
        <Input
          autoFocus={p.autoFocus || (isNew && key === "name")}
          type={opts.type}
          value={draft[key]}
          maxLength={opts.maxLength}
          placeholder={key === "name" ? "Ex: Website institucional Acme" : undefined}
          onChange={(e) => setField(key, e.target.value)}
          onBlur={p.onBlur}
          onKeyDown={p.onKeyDown}
        />
      )}
    />
  );

  return (
    <div className="space-y-6">
      {lead && (
        <div className="space-y-4">
          <NegotiationFacts
            lead={lead}
            draft={draft}
            valueDiverges={valueDiverges}
            onOpenProposal={onOpenProposal}
          />
        </div>
      )}

      {lead && (
        <div className="space-y-3 border-t border-border/60 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p role="heading" aria-level={3} className={headingCls}>
              Últimas interações
            </p>
            {timeline.length > 3 && (
              <button
                type="button"
                onClick={onOpenHistory}
                className="rounded text-xs font-medium text-text-secondary hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Ver histórico completo ({timeline.length})
              </button>
            )}
          </div>
          {timeline.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Nenhuma interação registrada ainda.
              {onRegisterFollowUp && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={onRegisterFollowUp}
                    className="rounded font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Registrar follow-up
                  </button>
                </>
              )}
            </p>
          ) : (
            <TimelineList items={timeline.slice(0, 3)} compact />
          )}
        </div>
      )}

      <div className={`space-y-4 ${lead ? "border-t border-border/60 pt-5" : ""}`}>
        {lead && (
          <p role="heading" aria-level={3} className={headingCls}>
            Dados do lead
          </p>
        )}
        <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {text("name", "Oportunidade", {
            maxLength: 120,
            required: true,
            className: "sm:col-span-2",
          })}
          {text("company", "Empresa", { maxLength: 120 })}
          {text("contact", "Contato", { maxLength: 120 })}
          {text("role", "Cargo", { maxLength: 120 })}
          {text("vertical", "Setor", { maxLength: 120 })}
          {text("email", "E-mail", { maxLength: 255, type: "email" })}
          {text("phone", "Telefone", { maxLength: 40 })}

          <InlineField
            label="Responsável"
            display={draft.responsible}
            empty={!draft.responsible}
            placeholder="Definir"
            always={isNew}
            onCommit={() => commit()}
            render={(p) => (
              <NativeSelect
                autoFocus={p.autoFocus}
                value={draft.responsible}
                onChange={(e) => {
                  setField("responsible", e.target.value);
                  commit({ responsible: e.target.value });
                  p.close();
                }}
                onBlur={p.onBlur}
              >
                <option value="">Selecione...</option>
                {team.map((m) => (
                  <option key={m.id} value={m.name}>
                    {m.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          />
          <InlineField
            label="Origem"
            display={draft.source}
            empty={!draft.source}
            placeholder="Definir"
            always={isNew}
            onCommit={() => commit()}
            render={(p) => (
              <NativeSelect
                autoFocus={p.autoFocus}
                value={draft.source}
                onChange={(e) => {
                  setField("source", e.target.value);
                  commit({ source: e.target.value });
                  p.close();
                }}
                onBlur={p.onBlur}
              >
                <option value="">Selecione...</option>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </NativeSelect>
            )}
          />

          {text("urgency", "Urgência", { maxLength: 60 })}
          <InlineField
            label="Orçamento mensal"
            display={
              parseMoney(draft.budget) > 0 ? formatBRL(parseMoney(draft.budget)) : draft.budget
            }
            empty={!draft.budget.trim()}
            always={isNew}
            onCommit={() => commit()}
            render={(p) => (
              <Input
                autoFocus={p.autoFocus}
                value={draft.budget}
                placeholder="R$"
                onChange={(e) => setField("budget", e.target.value)}
                onBlur={p.onBlur}
                onKeyDown={p.onKeyDown}
              />
            )}
          />

          <div className="min-w-0">
            <p
              className={
                isNew
                  ? "mb-1.5 text-sm font-medium text-foreground"
                  : "text-[11px] font-medium uppercase tracking-wide text-text-secondary"
              }
            >
              Qualificação
            </p>
            <div
              className="mt-0.5 flex h-7 items-center gap-0.5"
              role="group"
              aria-label="Nota de 1 a 5"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Nota ${n}`}
                  aria-pressed={n === draft.score}
                  onClick={() => {
                    const next = draft.score === n ? 0 : n;
                    setField("score", next);
                    commit({ score: next });
                  }}
                  className="rounded p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Star
                    className={`h-4 w-4 ${
                      n <= draft.score ? "fill-foreground text-foreground" : "text-text-secondary"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <InlineField
            label="Valor (R$)"
            display={draft.value ? formatBRL(parseMoney(draft.value)) : ""}
            empty={!draft.value.trim()}
            placeholder="Definir"
            always={isNew}
            onCommit={() => commit()}
            trailing={
              valueDiverges && draft.proposta ? (
                <button
                  type="button"
                  onClick={onOpenProposal}
                  title={`Diverge da proposta salva (${formatBRL(draft.proposta.precoFinal)})`}
                  className="mt-0.5 shrink-0 rounded p-0.5 text-warning-soft-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Valor diverge da proposta salva (${formatBRL(draft.proposta.precoFinal)}). Abrir proposta`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                </button>
              ) : undefined
            }
            render={(p) => (
              <Input
                autoFocus={p.autoFocus}
                inputMode="decimal"
                value={draft.value}
                placeholder="0"
                onChange={(e) => setField("value", e.target.value)}
                onBlur={p.onBlur}
                onKeyDown={p.onKeyDown}
              />
            )}
          />

          {isNew && (
            <div className="min-w-0">
              <p className="mb-1.5 text-sm font-medium text-foreground">Etapa inicial</p>
              <NativeSelect
                value={draft.stage}
                onChange={(e) => setField("stage", e.target.value as LeadDraft["stage"])}
              >
                {OPPORTUNITY_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {OPPORTUNITY_STAGE_LABEL[s]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          )}

          <InlineField
            label="Observações"
            display={draft.notes}
            empty={!draft.notes.trim()}
            multiline
            always={isNew}
            className="sm:col-span-2"
            onCommit={() => commit()}
            render={(p) => (
              <Textarea
                autoFocus={p.autoFocus}
                value={draft.notes}
                maxLength={1000}
                className="h-20 resize-none py-2"
                onChange={(e) => setField("notes", e.target.value)}
                onBlur={p.onBlur}
              />
            )}
          />
          <InlineField
            label="Experiência com agência"
            display={draft.experience}
            empty={!draft.experience.trim()}
            multiline
            always={isNew}
            className="sm:col-span-2"
            onCommit={() => commit()}
            render={(p) => (
              <Textarea
                autoFocus={p.autoFocus}
                value={draft.experience}
                maxLength={500}
                className="h-16 resize-none py-2"
                onChange={(e) => setField("experience", e.target.value)}
                onBlur={p.onBlur}
              />
            )}
          />
        </div>
      </div>
    </div>
  );
}
