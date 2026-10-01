import { Star, Users, MoreVertical } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatSeguidores } from "@/lib/format";
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

/** Um único componente pra grade E lista — `variant` muda só o layout,
 * nunca o conteúdo. Nenhuma menção a "confiabilidade": a única métrica de
 * qualidade aqui é "Avaliação do time" (manual, ver `AVALIACAO_CRITERIOS`
 * em `campanha-influenciador-avaliacao.ts`), sempre com a contagem ao
 * lado — nunca um número isolado sem contexto. */
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

  const avaliacaoLabel =
    enrichment && enrichment.avaliacoesCount > 0 ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
        {enrichment.mediaAvaliacao?.toFixed(1).replace(".", ",")}
        <span className="font-normal text-text-secondary">
          · {enrichment.avaliacoesCount} avaliaç{enrichment.avaliacoesCount === 1 ? "ão" : "ões"}
        </span>
      </span>
    ) : (
      <span className="text-xs text-text-secondary">Sem avaliação</span>
    );

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="rounded-md p-1 text-text-secondary hover:bg-muted"
          aria-label="Mais ações"
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={onEdit}>Editar cadastro</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  if (variant === "lista") {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50"
      >
        <Avatar className="h-9 w-9">
          <AvatarImage src={influ.foto} alt={influ.nome} />
          <AvatarFallback className="text-xs">{initials(influ.nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{influ.nome}</p>
          <p className="truncate text-xs text-text-secondary">
            {rede ? `@${rede.handle}` : influ.nicho || "Sem rede cadastrada"}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-1 text-xs text-text-secondary sm:flex">
          <Users className="h-3 w-3" />
          {formatSeguidores(String(seguidores))}
        </div>
        <Badge variant="outline" className="hidden shrink-0 text-[10px] md:inline-flex">
          {enrichment?.historicoCount ?? 0} campanha
          {(enrichment?.historicoCount ?? 0) === 1 ? "" : "s"}
        </Badge>
        <div className="hidden w-44 shrink-0 lg:block">{avaliacaoLabel}</div>
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
      className="flex cursor-pointer flex-col gap-3 rounded-xl border border-border/60 bg-card p-4 transition-colors hover:border-border hover:bg-muted/30"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11">
            <AvatarImage src={influ.foto} alt={influ.nome} />
            <AvatarFallback>{initials(influ.nome)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{influ.nome}</p>
            <p className="truncate text-xs text-text-secondary">
              {rede ? `@${rede.handle}` : "Sem rede cadastrada"}
            </p>
          </div>
        </div>
        {menu}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {influ.nicho && (
          <Badge variant="secondary" className="text-[10px]">
            {influ.nicho}
          </Badge>
        )}
        {rede && (
          <Badge variant="outline" className="text-[10px]">
            {rede.plataforma}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-text-secondary">
        <span className="inline-flex items-center gap-1">
          <Users className="h-3 w-3" />
          {formatSeguidores(String(seguidores))} seguidores
        </span>
        <span>
          {enrichment?.historicoCount ?? 0} campanha
          {(enrichment?.historicoCount ?? 0) === 1 ? "" : "s"}
        </span>
      </div>

      <div className="border-t border-border/60 pt-2">{avaliacaoLabel}</div>
    </div>
  );
}
