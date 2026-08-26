import { useMemo } from "react";
import type { getCampaignDetail, listCampaignSends } from "@/lib/email-campaigns.functions";

type Detail = Awaited<ReturnType<typeof getCampaignDetail>>;
type Step = Detail["steps"][number];
type Recipient = Detail["recipients"][number];
type Send = Awaited<ReturnType<typeof listCampaignSends>>[number];

/** Funil simples (contatos → enviados → entregues → abriram →
 * responderam) + números por etapa — só números, gráfico nenhum (o
 * pedido é clareza, não decoração). */
export function ResultadosPanel({
  steps,
  recipients,
  sends,
}: {
  steps: Step[];
  recipients: Recipient[];
  sends: Send[];
}) {
  const funil = useMemo(() => {
    const enviados = sends.filter((s) => s.status !== "queued" && s.status !== "failed").length;
    const entregues = sends.filter((s) =>
      ["delivered", "opened", "clicked"].includes(s.status),
    ).length;
    const abriram = sends.filter((s) => s.opened_at).length;
    const clicaram = sends.filter((s) => s.clicked_at).length;
    const erros = sends.filter((s) => s.status === "failed" || s.status === "bounced").length;
    const responderam = recipients.filter((r) => r.status === "responded").length;
    return {
      contatos: recipients.length,
      enviados,
      entregues,
      abriram,
      clicaram,
      erros,
      responderam,
    };
  }, [sends, recipients]);

  const porEtapa = useMemo(() => {
    return steps
      .filter((s) => s.kind === "email")
      .map((s) => {
        const stepSends = sends.filter((snd) => snd.step_id === s.id);
        return {
          step: s,
          enviados: stepSends.filter((x) => x.status !== "queued" && x.status !== "failed").length,
          entregues: stepSends.filter((x) => ["delivered", "opened", "clicked"].includes(x.status))
            .length,
          abriram: stepSends.filter((x) => x.opened_at).length,
          clicaram: stepSends.filter((x) => x.clicked_at).length,
          erros: stepSends.filter((x) => x.status === "failed" || x.status === "bounced").length,
        };
      });
  }, [steps, sends]);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <ResultTile label="Contatos" value={funil.contatos} />
        <ResultTile label="Enviados" value={funil.enviados} />
        <ResultTile label="Entregues" value={funil.entregues} />
        <ResultTile label="Abriram" value={funil.abriram} />
        <ResultTile label="Responderam" value={funil.responderam} />
        <ResultTile
          label="Erros"
          value={funil.erros}
          tone={funil.erros > 0 ? "text-destructive" : undefined}
        />
      </div>

      {porEtapa.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Por etapa
          </h4>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Etapa</th>
                  <th className="px-3 py-2 font-medium">Enviados</th>
                  <th className="px-3 py-2 font-medium">Entregues</th>
                  <th className="px-3 py-2 font-medium">Abriram</th>
                  <th className="px-3 py-2 font-medium">Clicaram</th>
                  <th className="px-3 py-2 font-medium">Erros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {porEtapa.map((row) => (
                  <tr key={row.step.id}>
                    <td className="truncate px-3 py-2 font-medium text-foreground">
                      {row.step.internal_name || "E-mail sem nome"}
                    </td>
                    <td className="px-3 py-2 text-foreground">{row.enviados}</td>
                    <td className="px-3 py-2 text-foreground">{row.entregues}</td>
                    <td className="px-3 py-2 text-foreground">{row.abriram}</td>
                    <td className="px-3 py-2 text-foreground">{row.clicaram}</td>
                    <td
                      className={`px-3 py-2 ${row.erros > 0 ? "text-destructive" : "text-foreground"}`}
                    >
                      {row.erros}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ResultTile({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone ?? "text-foreground"}`}>{value}</p>
    </div>
  );
}
