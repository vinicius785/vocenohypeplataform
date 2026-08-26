import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, MoreHorizontal, Pause, Play, Pencil, Trash2, AlertCircle } from "lucide-react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useConfirm } from "@/hooks/use-confirm";
import {
  getCampaignDetail,
  listCampaignSends,
  listEmailTemplates,
  deleteEmailCampaign,
  pauseCampaign,
  resumeCampaign,
  getCampaignReadiness,
} from "@/lib/email-campaigns.functions";
import {
  CAMPAIGN_OBJETIVO_LABEL,
  type CampaignObjetivo,
  type CampaignStatus,
} from "@/lib/email-campaigns-constants";
import { StatusBadge } from "./EmailDashboard";
import { FluxoVisual } from "./FluxoVisual";
import { PublicoManager } from "./PublicoManager";
import { ResultadosPanel } from "./ResultadosPanel";
import { HistoricoPanel } from "./HistoricoPanel";
import { ContatoDetalhe } from "./ContatoDetalhe";
import { ConfirmarDisparoDialog } from "./ConfirmarDisparoDialog";
import { NovaCampanhaDialog } from "./NovaCampanhaDialog";

type Detail = Awaited<ReturnType<typeof getCampaignDetail>>;
type Recipient = Detail["recipients"][number];
type Tab = "fluxo" | "publico" | "resultados" | "historico";

export function CampanhaPage({
  campaignId,
  onBack,
  onDeleted,
}: {
  campaignId: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const getDetailFn = useServerFn(getCampaignDetail);
  const listSendsFn = useServerFn(listCampaignSends);
  const listTemplatesFn = useServerFn(listEmailTemplates);
  const deleteFn = useServerFn(deleteEmailCampaign);
  const pauseFn = useServerFn(pauseCampaign);
  const resumeFn = useServerFn(resumeCampaign);
  const readinessFn = useServerFn(getCampaignReadiness);
  const { confirm, confirmDialog } = useConfirm();

  const [detail, setDetail] = useState<Detail | null>(null);
  const [sends, setSends] = useState<Awaited<ReturnType<typeof listCampaignSends>>>([]);
  const [templates, setTemplates] = useState<Awaited<ReturnType<typeof listEmailTemplates>>>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("fluxo");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [contact, setContact] = useState<Recipient | null>(null);

  const reload = () => {
    void getDetailFn({ data: { campaignId } }).then(setDetail);
    void listSendsFn({ data: { campaignId } }).then(setSends);
    void readinessFn({ data: { campaignId } }).then((r) => setMissing(r.missing));
  };

  useEffect(() => {
    reload();
    void listTemplatesFn().then(setTemplates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  if (!detail)
    return <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/30" />;

  const { campaign, steps, recipients, activity } = detail;
  const status = campaign.status as CampaignStatus;

  const tabs: { key: Tab; label: string }[] = [
    { key: "fluxo", label: "Fluxo" },
    { key: "publico", label: `Público (${recipients.length})` },
    { key: "resultados", label: "Resultados" },
    { key: "historico", label: "Histórico" },
  ];

  return (
    <div className="space-y-5">
      {confirmDialog}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Campanhas
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-foreground">{campaign.name}</h2>
            <StatusBadge status={status} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {CAMPAIGN_OBJETIVO_LABEL[campaign.objetivo as CampaignObjetivo]}
            {campaign.description ? ` · ${campaign.description}` : ""}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {status === "ativa" ? (
            <button
              type="button"
              onClick={() => void pauseFn({ data: { campaignId } }).then(reload)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Pause className="h-3.5 w-3.5" /> Pausar
            </button>
          ) : status === "pausada" ? (
            <button
              type="button"
              onClick={() => void resumeFn({ data: { campaignId } }).then(reload)}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" /> Retomar
            </button>
          ) : status !== "concluida" ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:opacity-90"
            >
              <Play className="h-3.5 w-3.5" /> Ativar campanha
            </button>
          ) : null}

          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Mais opções"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-muted"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar campanha
              </button>
              <button
                type="button"
                onClick={async () => {
                  setMenuOpen(false);
                  const ok = await confirm(
                    `Excluir a campanha "${campaign.name}"? Isso apaga a sequência, o público e o histórico de envios.`,
                  );
                  if (!ok) return;
                  await deleteFn({ data: { id: campaignId } });
                  onDeleted();
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Excluir campanha
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {missing.length > 0 && status !== "ativa" && status !== "concluida" && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Falta antes de ativar: {missing.join(" · ")}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              tab === t.key
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "fluxo" && (
        <FluxoVisual
          campaignId={campaignId}
          steps={steps}
          templates={templates}
          onChanged={reload}
        />
      )}
      {tab === "publico" && (
        <PublicoManager
          campaignId={campaignId}
          recipients={recipients}
          onChanged={reload}
          onOpenContact={setContact}
        />
      )}
      {tab === "resultados" && (
        <ResultadosPanel steps={steps} recipients={recipients} sends={sends} />
      )}
      {tab === "historico" && <HistoricoPanel activity={activity} sends={sends} />}

      <ContatoDetalhe
        open={contact !== null}
        onOpenChange={(o) => !o && setContact(null)}
        recipient={contact}
        sends={sends}
        onChanged={reload}
      />

      <ConfirmarDisparoDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        campaignId={campaignId}
        recipients={recipients}
        steps={steps}
        onActivated={() => {
          setConfirmOpen(false);
          reload();
        }}
      />

      <NovaCampanhaDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initial={{
          id: campaign.id,
          name: campaign.name,
          description: campaign.description,
          objetivo: campaign.objetivo,
        }}
        onSaved={() => {
          setEditOpen(false);
          reload();
        }}
      />
    </div>
  );
}
