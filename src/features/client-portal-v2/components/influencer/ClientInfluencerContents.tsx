import { useState } from "react";
import { ChevronRight, Film } from "lucide-react";
import { ENTREGA_STAGE_TONE } from "@/lib/campanha-status";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import { ContentDetailDialog } from "../ContentDetailDialog";
import {
  activeAjuste,
  ajusteSemDetalheDisponivel,
  conteudoAindaNaoEnviado,
  formatAjusteSummary,
} from "../../lib/ajuste-format";
import type { ContentItem } from "../../types/content";

/** Conteúdos e versões — mesmo viewer já usado em Conteúdos/campanha
 * (`ContentDetailDialog`), nunca um segundo drawer por cima deste.
 * `initialOpenEntregaId` — deep link `?conteudo=`, abre o viewer
 * automaticamente assim que a lista monta. */
export function ClientInfluencerContents({
  items,
  initialOpenEntregaId,
}: {
  items: ContentItem[];
  initialOpenEntregaId?: string;
}) {
  const [selected, setSelected] = useState<ContentItem | null>(() => {
    const found = items.find((i) => i.entrega.id === initialOpenEntregaId);
    // Nunca abre o viewer pra um conteúdo que ainda não existe de verdade
    // (deep link antigo/inválido apontando pra uma entrega ainda em
    // produção sem nada enviado).
    return found && !conteudoAindaNaoEnviado(found.entrega) ? found : null;
  });

  if (items.length === 0) return null;

  return (
    <InfluencerDrawerSection icon={<Film className="h-4 w-4" />} title="Conteúdos e versões">
      <div className="space-y-1.5 rounded-2xl bg-card p-2 dark:shadow-none">
        {items.map((item) => {
          const naoEnviado = conteudoAindaNaoEnviado(item.entrega);
          const ajuste = activeAjuste(item.entrega);
          const semDetalhe = !ajuste && ajusteSemDetalheDisponivel(item.entrega);

          const rowContent = (
            <>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Film className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {item.entrega.titulo || item.entrega.tipo}
                </p>
                {naoEnviado && (
                  <p className="truncate text-xs text-text-secondary">
                    Aguardando a equipe da Você no Hype.
                  </p>
                )}
                {ajuste && (
                  <p className="truncate text-xs text-text-secondary">
                    {formatAjusteSummary(ajuste.veredito)}
                  </p>
                )}
                {semDetalhe && (
                  <p className="truncate text-xs text-text-secondary">
                    Ajuste solicitado anteriormente.
                  </p>
                )}
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  ENTREGA_STAGE_TONE[item.entrega.stage as keyof typeof ENTREGA_STAGE_TONE] ??
                  "bg-muted text-muted-foreground"
                }`}
              >
                {naoEnviado ? "Ainda não enviado" : item.entrega.statusCliente}
              </span>
            </>
          );

          if (naoEnviado) {
            return (
              <div key={item.entrega.id} className="flex w-full items-center gap-3 px-3 py-2">
                {rowContent}
              </div>
            );
          }

          return (
            <button
              key={item.entrega.id}
              type="button"
              onClick={() => setSelected(item)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted/40"
            >
              {rowContent}
              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          );
        })}
      </div>

      {selected && <ContentDetailDialog item={selected} onClose={() => setSelected(null)} />}
    </InfluencerDrawerSection>
  );
}
