import { useState } from "react";
import { Film } from "lucide-react";
import { ENTREGA_STAGE_TONE } from "@/lib/campanha-status";
import { InfluencerDrawerSection } from "./InfluencerDrawerSection";
import { ContentDetailDialog } from "../ContentDetailDialog";
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
  const [selected, setSelected] = useState<ContentItem | null>(
    () => items.find((i) => i.entrega.id === initialOpenEntregaId) ?? null,
  );

  if (items.length === 0) return null;

  return (
    <InfluencerDrawerSection icon={<Film className="h-4 w-4" />} title="Conteúdos e versões">
      <div className="space-y-1.5 rounded-2xl bg-card p-2 dark:shadow-none">
        {items.map((item) => (
          <button
            key={item.entrega.id}
            type="button"
            onClick={() => setSelected(item)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <Film className="h-3.5 w-3.5" />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
              {item.entrega.titulo || item.entrega.tipo}
            </p>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                ENTREGA_STAGE_TONE[item.entrega.stage as keyof typeof ENTREGA_STAGE_TONE] ??
                "bg-muted text-muted-foreground"
              }`}
            >
              {item.entrega.statusCliente}
            </span>
          </button>
        ))}
      </div>

      {selected && <ContentDetailDialog item={selected} onClose={() => setSelected(null)} />}
    </InfluencerDrawerSection>
  );
}
