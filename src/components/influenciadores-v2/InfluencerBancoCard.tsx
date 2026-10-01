import { Star, MoreVertical, Copy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { formatCompactSeguidores } from "@/lib/format";
import { type BankInflu } from "@/lib/banco-influs-store";
import { totalSeguidores, type InfluencerBancoEnrichment } from "@/lib/influencer-banco-v2";

function initials(nome: string): string {
  return nome
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

function redePrincipal(i: BankInflu) {
  return i.redes.find((r) => r.id === i.redePrincipalId) ?? i.redes[0];
}

/** Texto que pode estourar a largura do card SEMPRE passa por aqui:
 * trunca com ellipsis via CSS (nunca corta a string em JS, que quebraria
 * em qualquer breakpoint diferente) e expõe o valor completo via
 * tooltip — nunca title nativo, que é inconsistente entre navegadores. */
function Truncated({ text, className }: { text: string; className?: string }) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`block min-w-0 truncate ${className ?? ""}`}>{text}</span>
        </TooltipTrigger>
        <TooltipContent side="top">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function AvaliacaoLine({ enrichment }: { enrichment?: InfluencerBancoEnrichment }) {
  if (enrichment && enrichment.avaliacoesCount > 0) {
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-[13px] font-medium text-foreground">
        <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
        <span className="tabular-nums">
          {enrichment.mediaAvaliacao?.toFixed(1).replace(".", ",")}
        </span>
        <span className="truncate font-normal text-text-secondary">
          · {enrichment.avaliacoesCount} avaliaç{enrichment.avaliacoesCount === 1 ? "ão" : "ões"}
        </span>
      </span>
    );
  }
  return <span className="text-[13px] text-text-secondary">Ainda não avaliado</span>;
}

/** Um único componente pra grade E lista — `variant` muda só o layout,
 * nunca o conteúdo. Altura fixa na grade (`h-full` + `justify-between`)
 * pra nenhum card ficar maior/menor que os vizinhos dependendo da
 * quantidade de informação; todo texto potencialmente longo (nome,
 * handle, nicho, campanha) passa por `Truncated` — nunca por redução de
 * fonte. Nenhuma menção a "confiabilidade": a única métrica de qualidade
 * aqui é "Avaliação do time" (manual), sempre com a contagem ao lado. */
export function InfluencerBancoCard({
  influ,
  variant,
  enrichment,
  onOpen,
  onEdit,
}: {
  influ: BankInflu;
  variant: "grade" | "lista";
  enrichment?: InfluencerBancoEnrichment;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const rede = redePrincipal(influ);
  const seguidores = totalSeguidores(influ.redes);
  const seguidoresLabel = seguidores > 0 ? formatCompactSeguidores(String(seguidores)) : null;
  const historico = enrichment?.historicoCount ?? 0;

  const copiarHandle = () => {
    if (!rede) return;
    void navigator.clipboard.writeText(`@${rede.handle}`);
    toast.success("Handle copiado.");
  };

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 rounded-md p-1 text-text-secondary hover:bg-muted hover:text-foreground"
          aria-label={`Mais ações para ${influ.nome}`}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onOpen}>Abrir perfil</DropdownMenuItem>
        <DropdownMenuItem onSelect={onEdit}>Editar cadastro</DropdownMenuItem>
        {rede && (
          <DropdownMenuItem onSelect={copiarHandle}>
            <Copy className="h-3.5 w-3.5" /> Copiar @handle
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (variant === "lista") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full min-w-0 items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
      >
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarImage src={influ.foto} alt="" className="object-cover" />
          <AvatarFallback className="text-xs">{initials(influ.nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <Truncated text={influ.nome} className="text-sm font-medium text-foreground" />
          <Truncated
            text={rede ? `@${rede.handle}` : (influ.nicho ?? "Sem rede cadastrada")}
            className="text-xs text-text-secondary"
          />
        </div>
        <div className="hidden w-20 shrink-0 items-center text-xs text-text-secondary sm:flex">
          {seguidoresLabel ?? "—"}
        </div>
        <Badge variant="outline" className="hidden shrink-0 text-[10px] md:inline-flex">
          {historico} campanha{historico === 1 ? "" : "s"}
        </Badge>
        <div className="hidden w-44 shrink-0 lg:block">
          <AvaliacaoLine enrichment={enrichment} />
        </div>
        {menu}
      </button>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === "Enter" && onOpen()}
      className="flex h-full min-w-0 w-full cursor-pointer flex-col rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border hover:bg-muted/20"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Avatar className="h-11 w-11 shrink-0">
          <AvatarImage src={influ.foto} alt="" className="object-cover" />
          <AvatarFallback>{initials(influ.nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 pt-0.5">
          <Truncated text={influ.nome} className="text-[15px] font-semibold text-foreground" />
          <Truncated
            text={rede ? `@${rede.handle}` : "Sem rede cadastrada"}
            className="text-xs text-text-secondary"
          />
        </div>
        {menu}
      </div>

      <div className="mt-3 flex min-w-0 items-center gap-1.5 overflow-hidden">
        {influ.nicho && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            <span className="max-w-[88px] truncate">{influ.nicho}</span>
          </Badge>
        )}
        {rede && (
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {rede.plataforma}
          </Badge>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-2 border-t border-border/60 pt-3">
        <div className="min-w-0">
          <p className="text-base font-semibold tabular-nums text-foreground">
            {seguidoresLabel ?? "—"}
          </p>
          <p className="text-[11px] text-text-secondary">Seguidores</p>
        </div>
        <p className="shrink-0 text-xs text-text-secondary">
          {historico} campanha{historico === 1 ? "" : "s"}
        </p>
      </div>

      <div className="mt-3 min-w-0 border-t border-border/60 pt-3">
        <AvaliacaoLine enrichment={enrichment} />
      </div>
    </div>
  );
}
