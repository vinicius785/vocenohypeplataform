import { Info } from "lucide-react";
import { formatBRL, type Lead } from "@/lib/comercial";
import { legacyStage } from "@/lib/comercial-engine";
import {
  groupByResponsible,
  groupByOrigin,
  lossReasonBreakdown,
  computeComercialKpis,
  type DateRange,
} from "@/lib/comercial-metrics";

/**
 * Relatórios — só dado real. Conversão por etapa/tempo médio/ciclo de
 * vendas/forecast dependem de histórico estruturado (`kind`/`fromStage`/
 * `toStage`, adicionado agora) ou de uma probabilidade que não existe —
 * aparecem como estado vazio explicando o que falta, nunca um número
 * aproximado por parsing de texto.
 */
export function ComercialReportsView({ leads, range }: { leads: Lead[]; range: DateRange }) {
  const kpis = computeComercialKpis(leads, range);
  const porResponsavel = groupByResponsible(leads);
  const porOrigem = groupByOrigin(leads);
  const motivosPerda = lossReasonBreakdown(leads);
  const totalPerdidos = leads.filter((l) => legacyStage(l.stage) === "PERDIDO").length;

  const temHistoricoEstruturado = leads.some((l) =>
    (l.history ?? []).some((h) => !!h.kind && !!h.fromStage),
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ReportCard title="Pipeline por responsável">
          {porResponsavel.length === 0 ? (
            <EmptyNote text="Nenhuma oportunidade cadastrada ainda." />
          ) : (
            <BucketTable
              rows={porResponsavel.map((b) => ({ label: b.name, count: b.count, value: b.value }))}
            />
          )}
        </ReportCard>

        <ReportCard title="Pipeline por origem">
          {porOrigem.length === 0 ? (
            <EmptyNote text="Nenhuma oportunidade cadastrada ainda." />
          ) : (
            <BucketTable
              rows={porOrigem.map((b) => ({ label: b.name, count: b.count, value: b.value }))}
            />
          )}
        </ReportCard>

        <ReportCard title="Valor ganho e perdido no período">
          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="Ganho" value={formatBRL(kpis.valorGanhoNoPeriodo)} tone="success" />
            <MiniStat label="Negócios ganhos" value={String(kpis.negociosGanhosNoPeriodo)} />
          </div>
          {kpis.ganhosSemDataRegistrada > 0 && (
            <EmptyNote
              text={`${kpis.ganhosSemDataRegistrada} negócio(s) ganho(s) antes desta métrica existir não têm data registrada — ficam fora deste período.`}
            />
          )}
        </ReportCard>

        <ReportCard title="Motivos de perda">
          {motivosPerda.length === 0 ? (
            <EmptyNote text="Nenhuma oportunidade perdida ainda." />
          ) : (
            <>
              <BucketTable rows={motivosPerda.map((m) => ({ label: m.reason, count: m.count }))} />
              <p className="mt-2 text-[11px] text-muted-foreground">
                {totalPerdidos} oportunidade(s) perdida(s) no total.
              </p>
            </>
          )}
        </ReportCard>

        <ReportCard title="Forecast ponderado">
          <EmptyNote text="Não existe uma probabilidade de fechamento configurada por etapa ou por lead — o forecast ponderado (valor × probabilidade) só é calculado quando essa regra existir. Nenhum peso é inventado até lá." />
        </ReportCard>

        <ReportCard title="Conversão por etapa, tempo médio e ciclo de vendas">
          {temHistoricoEstruturado ? (
            <EmptyNote text="Coletando histórico estruturado desde a introdução desta métrica — ainda não há volume suficiente para um relatório confiável." />
          ) : (
            <EmptyNote text="Estas métricas dependem de histórico estruturado de mudança de etapa, que passou a ser gravado a partir de agora. Vão aparecer aqui conforme o pipeline se movimentar — nunca reconstruídas por aproximação do histórico antigo (texto livre, sem etapa de origem/destino confiável)." />
          )}
        </ReportCard>
      </div>
    </div>
  );
}

function ReportCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-3 text-sm font-medium text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function BucketTable({ rows }: { rows: { label: string; count: number; value?: number }[] }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between text-xs">
          <span className="truncate text-muted-foreground">{r.label}</span>
          <span className="shrink-0 font-medium tabular-nums text-foreground">
            {r.count}
            {r.value != null ? ` · ${formatBRL(r.value)}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success";
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          tone === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {text}
    </p>
  );
}
