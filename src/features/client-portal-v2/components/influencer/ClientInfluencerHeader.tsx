import { ExternalLink } from "lucide-react";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { PublicInfluencer } from "@/lib/portal-types";
import { resolveProfileUrl } from "@/lib/social-profiles";

const STATUS_TONE: Record<string, string> = {
  APROVADO: "bg-success-soft text-success-soft-foreground",
  ENVIADO_AO_CLIENTE: "bg-warning-soft text-warning-soft-foreground",
  RECUSADO: "bg-danger-soft text-danger-soft-foreground",
};

/** Cabeçalho do drawer — sticky, sem ações administrativas internas. O
 * link de perfil usa `resolveProfileUrl` (já existente, mesma resolução
 * de URL usada em todo o app pra redes sociais). */
export function ClientInfluencerHeader({ influencer }: { influencer: PublicInfluencer }) {
  const primaryRede = influencer.redes[0];
  const profileUrl = primaryRede ? resolveProfileUrl(primaryRede) : null;

  return (
    <SheetHeader className="sticky top-0 z-10 space-y-0 border-b border-border bg-background px-6 py-4 text-left">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold text-muted-foreground">
          {influencer.foto ? (
            <img src={influencer.foto} alt="" className="h-full w-full object-cover" />
          ) : (
            influencer.nome.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1 pr-8">
          <SheetTitle className="truncate">{influencer.nome}</SheetTitle>
          <p className="mt-0.5 truncate text-xs text-text-secondary">
            {primaryRede
              ? `@${primaryRede.handle.replace(/^@+/, "")} · ${primaryRede.plataforma}`
              : ""}
            {influencer.nicho ? ` · ${influencer.nicho}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                STATUS_TONE[influencer.status] ?? "bg-muted text-muted-foreground"
              }`}
            >
              {influencer.statusCliente}
            </span>
            {profileUrl && (
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                Abrir perfil <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>
    </SheetHeader>
  );
}
