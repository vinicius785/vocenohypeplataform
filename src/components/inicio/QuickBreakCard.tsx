import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coffee, Grid3x3, Type } from "lucide-react";
import { Card, CardHeader } from "@/components/InicioDashboard";
import { Button } from "@/components/ui/button";
import { getZipSession } from "@/lib/games/zip.functions";
import { getTermoSession } from "@/lib/games/termo.functions";
import { ZipGameModal } from "@/components/games/ZipGameModal";
import { TermoGameModal } from "@/components/games/TermoGameModal";

type GameStatus = "disponivel" | "em_andamento" | "concluido";

function statusLabel(status: GameStatus): { text: string; action: string } {
  if (status === "concluido") return { text: "Concluído hoje", action: "Ver resultado" };
  if (status === "em_andamento") return { text: "Em andamento", action: "Continuar" };
  return { text: "Disponível", action: "Jogar" };
}

/**
 * "Pausa rápida" — card discreto com ZIP e Termo. NUNCA renderiza o jogo
 * completo aqui: só um resumo de status + botão que abre o modal grande
 * (desktop) / tela cheia (mobile). Sem ranking, sem exposição de quem
 * jogou — cada tile reflete só a sessão do próprio usuário.
 */
export function QuickBreakCard() {
  const [openGame, setOpenGame] = useState<"zip" | "termo" | null>(null);

  const getZipSessionFn = useServerFn(getZipSession);
  const { data: zipData } = useQuery({
    queryKey: ["zip-session"],
    queryFn: () => getZipSessionFn(),
  });
  const zipStatus: GameStatus = zipData?.session?.completed_at
    ? "concluido"
    : (zipData?.session?.state as { path?: unknown[] } | undefined)?.path?.length
      ? "em_andamento"
      : "disponivel";

  const getTermoSessionFn = useServerFn(getTermoSession);
  const { data: termoData } = useQuery({
    queryKey: ["termo-session"],
    queryFn: () => getTermoSessionFn(),
  });
  const termoStatus: GameStatus = termoData?.finished
    ? "concluido"
    : (termoData?.attempts ?? 0) > 0
      ? "em_andamento"
      : "disponivel";

  const zip = statusLabel(zipStatus);
  const termo = statusLabel(termoStatus);

  return (
    <>
      <Card>
        <CardHeader icon={<Coffee className="h-4 w-4" />} title="Pausa rápida" />
        <div className="px-4 pb-1 pt-0 md:px-5">
          <p className="text-xs text-muted-foreground">Uma pausa rápida entre as tarefas.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 p-3 md:p-4">
          <div className="rounded-xl border border-border/60 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Grid3x3 className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">ZIP</p>
                <p className="truncate text-[11px] text-muted-foreground">Conecte os pontos</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{zip.text}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => setOpenGame("zip")}
            >
              {zip.action}
            </Button>
          </div>
          <div className="rounded-xl border border-border/60 p-3">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Type className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-foreground">Termo</p>
                <p className="truncate text-[11px] text-muted-foreground">Descubra a palavra</p>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">{termo.text}</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-2 w-full"
              onClick={() => setOpenGame("termo")}
            >
              {termo.action}
            </Button>
          </div>
        </div>
      </Card>

      {openGame === "zip" && <ZipGameModal open onOpenChange={(v) => !v && setOpenGame(null)} />}
      {openGame === "termo" && (
        <TermoGameModal open onOpenChange={(v) => !v && setOpenGame(null)} />
      )}
    </>
  );
}
