import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Mail, Clock, Send, TrendingUp } from "lucide-react";
import { getEmailDashboard } from "@/lib/email-campaigns.functions";
import {
  CAMPAIGN_OBJETIVO_LABEL,
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_STATUS_TONE,
  type CampaignObjetivo,
  type CampaignStatus,
} from "@/lib/email-campaigns-constants";
import { fmtDateTime } from "./email-ui-utils";

type DashboardData = Awaited<ReturnType<typeof getEmailDashboard>>;
type Campaign = DashboardData["campaigns"][number];
type Step = DashboardData["steps"][number];
type Recipient = DashboardData["recipients"][number];

export function EmailDashboard({
  onOpenCampaign,
  onNewCampaign,
  refreshKey,
}: {
  onOpenCampaign: (id: string) => void;
  onNewCampaign: () => void;
  refreshKey: number;
}) {
  const getDashboardFn = useServerFn(getEmailDashboard);
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    void getDashboardFn().then(setData);
  }, [getDashboardFn, refreshKey]);

  const stepsByCampaign = useMemo(() => {
    const map = new Map<string, Step[]>();
    for (const s of data?.steps ?? []) {
      const list = map.get(s.campaign_id) ?? [];
      list.push(s);
      map.set(s.campaign_id, list);
    }
    return map;
  }, [data]);

  const recipientsByCampaign = useMemo(() => {
    const map = new Map<string, Recipient[]>();
    for (const r of data?.recipients ?? []) {
      const list = map.get(r.campaign_id) ?? [];
      list.push(r);
      map.set(r.campaign_id, list);
    }
    return map;
  }, [data]);

  const stepById = useMemo(() => {
    const map = new Map<string, Step>();
    for (const s of data?.steps ?? []) map.set(s.id, s);
    return map;
  }, [data]);

  const tiles = useMemo(() => {
    if (!data) return { ativas: 0, agendados: 0, enviados: 0, entregaPct: null as number | null };
    const ativas = data.campaigns.filter((c) => c.status === "ativa").length;
    const agendados = data.recipients.filter((r) => {
      if (r.status !== "active" || !r.next_run_at || !r.current_step_id) return false;
      const step = stepById.get(r.current_step_id);
      return step?.kind === "email";
    }).length;
    const sentOrLater = data.sends.filter((s) =>
      ["sent", "delivered", "opened", "clicked", "bounced"].includes(s.status),
    ).length;
    const delivered = data.sends.filter((s) =>
      ["delivered", "opened", "clicked"].includes(s.status),
    ).length;
    return {
      ativas,
      agendados,
      enviados: sentOrLater,
      entregaPct: sentOrLater > 0 ? Math.round((delivered / sentOrLater) * 100) : null,
    };
  }, [data, stepById]);

  const emAndamento = useMemo(() => {
    if (!data) return [];
    return data.campaigns
      .filter((c) => c.status === "ativa")
      .map((c) => {
        const recipients = recipientsByCampaign.get(c.id) ?? [];
        const steps = stepsByCampaign.get(c.id) ?? [];
        const active = recipients.filter((r) => r.status === "active");
        const nextRecipient = active
          .filter((r) => r.next_run_at)
          .sort(
            (a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime(),
          )[0];
        const nextStep = nextRecipient?.current_step_id
          ? stepById.get(nextRecipient.current_step_id)
          : undefined;
        return {
          campaign: c,
          total: recipients.length,
          active: active.length,
          stepCount: steps.filter((s) => s.kind === "email").length,
          nextLabel: nextStep
            ? nextStep.kind === "email"
              ? nextStep.internal_name || "Enviar e-mail"
              : "Aguardando"
            : null,
          nextAt: nextRecipient?.next_run_at ?? null,
        };
      });
  }, [data, recipientsByCampaign, stepsByCampaign, stepById]);

  const proximosDisparos = useMemo(() => {
    if (!data) return [];
    const rows = data.recipients
      .filter((r) => r.status === "active" && r.next_run_at && r.current_step_id)
      .map((r) => {
        const step = stepById.get(r.current_step_id!);
        const campaign = data.campaigns.find((c) => c.id === r.campaign_id);
        return { r, step, campaign };
      })
      .filter((x) => x.step?.kind === "email" && x.campaign?.status === "ativa");
    rows.sort(
      (a, b) => new Date(a.r.next_run_at!).getTime() - new Date(b.r.next_run_at!).getTime(),
    );
    const grouped = new Map<
      string,
      { campaignName: string; stepLabel: string; at: string; count: number }
    >();
    for (const row of rows) {
      const key = `${row.r.campaign_id}:${row.step!.id}`;
      const existing = grouped.get(key);
      if (existing) existing.count++;
      else
        grouped.set(key, {
          campaignName: row.campaign?.name ?? "",
          stepLabel: row.step!.internal_name || "Enviar e-mail",
          at: row.r.next_run_at!,
          count: 1,
        });
    }
    return Array.from(grouped.values()).slice(0, 8);
  }, [data, stepById]);

  if (!data)
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/30" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-4">
          <Tile icon={Mail} label="Campanhas ativas" value={tiles.ativas} />
          <Tile icon={Clock} label="Disparos agendados" value={tiles.agendados} />
          <Tile icon={Send} label="E-mails enviados" value={tiles.enviados} />
          <Tile
            icon={TrendingUp}
            label="Taxa de entrega"
            value={tiles.entregaPct === null ? "—" : `${tiles.entregaPct}%`}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={onNewCampaign}
        className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background hover:opacity-90"
      >
        <Plus className="h-3.5 w-3.5" /> Nova campanha
      </button>

      {emAndamento.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Em andamento
          </h3>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {emAndamento.map((e) => (
              <button
                key={e.campaign.id}
                type="button"
                onClick={() => onOpenCampaign(e.campaign.id)}
                className="rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-foreground/30"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {e.campaign.name}
                  </p>
                  <StatusBadge status={e.campaign.status as CampaignStatus} />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {e.active}/{e.total} contatos ativos · {e.stepCount} e-mail(s) na sequência
                </p>
                {e.nextLabel && (
                  <p className="mt-1.5 truncate text-[11px] text-foreground">
                    Próximo: <span className="font-medium">{e.nextLabel}</span>
                    {e.nextAt && (
                      <span className="text-muted-foreground"> · {fmtDateTime(e.nextAt)}</span>
                    )}
                  </p>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {proximosDisparos.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Próximos disparos
          </h3>
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {proximosDisparos.map((d, i) => (
              <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{d.stepLabel}</p>
                  <p className="truncate text-muted-foreground">{d.campaignName}</p>
                </div>
                <div className="shrink-0 text-right text-muted-foreground">
                  <p>{fmtDateTime(d.at)}</p>
                  <p>
                    {d.count} contato{d.count === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Todas as campanhas
        </h3>
        {data.campaigns.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma campanha criada ainda.</p>
        ) : (
          <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
            {data.campaigns.map((c: Campaign) => {
              const recipients = recipientsByCampaign.get(c.id) ?? [];
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onOpenCampaign(c.id)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/30"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-foreground">{c.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {CAMPAIGN_OBJETIVO_LABEL[c.objetivo as CampaignObjetivo]} ·{" "}
                      {recipients.length} contato(s)
                    </p>
                  </div>
                  <StatusBadge status={c.status as CampaignStatus} />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="mt-1 text-xl font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${CAMPAIGN_STATUS_TONE[status]}`}
    >
      {CAMPAIGN_STATUS_LABEL[status]}
    </span>
  );
}
