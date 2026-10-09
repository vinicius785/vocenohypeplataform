import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Link2, RefreshCw, Unplug } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { KpiCell, KpiStrip } from "@/components/shared/Kpi";
import { useConfirm } from "@/hooks/use-confirm";
import {
  createInstagramConnectLink,
  disconnectInstagram,
  getInstagramConnection,
  syncInstagramMetrics,
} from "@/lib/instagram.functions";
import type { PublicConnection } from "@/lib/instagram/instagram-service";
import type { DemographicEntry } from "@/lib/instagram/instagram-client";

const fmt = (n: number) => new Intl.NumberFormat("pt-BR", { notation: "compact" }).format(n);
const HEADING = "text-xs font-semibold uppercase tracking-wide text-text-secondary";
type State = PublicConnection & { configured: boolean };

const dt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      })
    : "—";

const ERROR_TEXT: Record<string, string> = {
  token_invalid: "O acesso foi revogado ou expirou. Gere um novo link para reconectar.",
  token_expired: "O acesso expirou. Gere um novo link para reconectar.",
  permission_missing: "Faltam permissões. Gere um novo link e peça para autorizar as duas.",
  rate_limited: "Limite de consultas do Instagram atingido. Tente mais tarde.",
  unavailable: "Instagram indisponível agora. Tente mais tarde.",
};

function TopList({ title, items }: { title: string; items?: DemographicEntry[] }) {
  if (!items?.length) return null;
  return (
    <div className="min-w-0">
      <p className="text-xs text-text-secondary">{title}</p>
      <ul className="mt-1 space-y-0.5 text-sm">
        {items.slice(0, 3).map((e) => (
          <li key={e.id} className="flex justify-between gap-2">
            <span className="truncate">{e.label}</span>
            <span className="shrink-0 tabular-nums text-text-secondary">{e.percentual}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Conexão do Instagram do influenciador (somente leitura): gera o link, mostra o estado e as métricas. */
export function InstagramConnectionCard({ influenciadorId }: { influenciadorId: string }) {
  const load = useServerFn(getInstagramConnection);
  const makeLink = useServerFn(createInstagramConnectLink);
  const sync = useServerFn(syncInstagramMetrics);
  const unlink = useServerFn(disconnectInstagram);
  const { confirm, confirmDialog } = useConfirm();
  const [st, setSt] = useState<State | null>(null);
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSt(await load({ data: { influenciadorId } }));
      setFailed(false);
    } catch {
      setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load (useServerFn) não é estável
  }, [influenciadorId]);

  useEffect(() => {
    setSt(null);
    setLink(null);
    void refresh();
  }, [influenciadorId, refresh]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch {
      toast.error("Não foi possível concluir a ação.");
    } finally {
      setBusy(null);
    }
  };

  if (failed)
    return (
      <Section>
        <p className="text-xs text-text-secondary">Não foi possível carregar o Instagram.</p>
      </Section>
    );
  if (!st)
    return (
      <Section>
        <p className="text-xs text-text-secondary">Carregando…</p>
      </Section>
    );
  if (!st.configured)
    return (
      <Section>
        <p className="text-xs text-text-secondary">
          A integração com o Instagram ainda não foi configurada neste ambiente.
        </p>
      </Section>
    );

  const snap = st.snapshot;
  return (
    <Section>
      {confirmDialog}
      {!st.connected ? (
        <div className="space-y-2">
          <p className="text-sm text-text-secondary">
            O influenciador conecta a própria conta profissional (Business ou Criador) por um link
            único e a plataforma lê perfil e métricas, só leitura.
          </p>
          {link ? (
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link.url}
                  aria-label="Link de conexão do Instagram"
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(link.url);
                    toast.success("Link copiado.");
                  }}
                >
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Copiar
                </Button>
              </div>
              <p className="text-xs text-text-secondary">
                Válido até {dt(link.expiresAt)}. Quem tiver o link pode conectar uma conta: envie só
                ao influenciador.
              </p>
            </div>
          ) : (
            <Button
              size="sm"
              disabled={busy === "link"}
              onClick={() =>
                run("link", async () => setLink(await makeLink({ data: { influenciadorId } })))
              }
            >
              <Link2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Gerar link de conexão
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium">@{st.username ?? "—"}</span>
            <span className="text-text-secondary">{st.accountType ?? ""}</span>
            <span
              className={
                st.status === "connected"
                  ? "text-xs font-medium text-emerald-600 dark:text-emerald-400"
                  : "text-xs font-medium text-amber-600 dark:text-amber-400"
              }
            >
              {st.status === "connected" ? "Conectado" : "Reconexão necessária"}
            </span>
          </div>
          {st.lastSyncError && (
            <p role="alert" className="text-xs text-amber-600 dark:text-amber-400">
              {ERROR_TEXT[st.lastSyncError] ?? "A última atualização falhou."}
            </p>
          )}
          {snap && (
            <>
              <KpiStrip aria-label="Métricas do Instagram">
                <KpiCell
                  label="Seguidores"
                  value={snap.profile.followers != null ? fmt(snap.profile.followers) : "—"}
                />
                <KpiCell
                  label={`Alcance (${snap.windowDays}d)`}
                  value={snap.totals.reach != null ? fmt(snap.totals.reach) : "—"}
                />
                <KpiCell
                  label={`Interações (${snap.windowDays}d)`}
                  value={
                    snap.totals.totalInteractions != null ? fmt(snap.totals.totalInteractions) : "—"
                  }
                />
                <KpiCell
                  label="Interações ÷ alcance"
                  value={
                    snap.interactionRateByReach != null ? `${snap.interactionRateByReach}%` : "—"
                  }
                />
              </KpiStrip>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <TopList title="Gênero" items={snap.demographics.gender} />
                <TopList title="Idade" items={snap.demographics.age} />
                <TopList title="Países" items={snap.demographics.country} />
                <TopList title="Cidades" items={snap.demographics.city} />
              </div>
              {!snap.demographics.age && (
                <p className="text-xs text-text-secondary">
                  O Instagram só informa o perfil do público com 100 ou mais seguidores.
                </p>
              )}
            </>
          )}
          <p className="text-xs text-text-secondary">
            Atualizado em {dt(st.lastSyncAt)} · acesso válido até {dt(st.tokenExpiresAt)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "sync"}
              onClick={() =>
                run("sync", async () => {
                  setSt({ ...(await sync({ data: { influenciadorId } })), configured: true });
                })
              }
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Atualizar métricas
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "off"}
              onClick={() =>
                run("off", async () => {
                  const ok = await confirm(
                    "Isso apaga o acesso e as métricas importadas deste influenciador. Para reconectar será preciso um novo link.",
                    {
                      title: "Desconectar Instagram?",
                      confirmLabel: "Desconectar",
                      destructive: true,
                    },
                  );
                  if (!ok) return;
                  await unlink({ data: { influenciadorId } });
                  await refresh();
                })
              }
            >
              <Unplug className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Desconectar
            </Button>
          </div>
        </div>
      )}
    </Section>
  );
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <section aria-label="Instagram">
      <h3 className={HEADING}>Instagram</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}
