import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell, type SectionKey } from "@/components/AppShell";
import { InfluencerBancoV2Page } from "@/components/influenciadores-v2/InfluencerBancoV2Page";

/**
 * Banco de Influenciadores V2 — reconstrução isolada (ver pedido do
 * usuário), acessível em `/banco-influenciadores-v2` SEM substituir a V1
 * (`/time?section=influenciadores`, intacta) e SEM sair do `AppShell`
 * oficial — mesmo padrão de coexistência já usado por `/chat-v2`. O item
 * "Banco de influenciadores" da sidebar continua abrindo a V1; a V2 só é
 * alcançada digitando a URL, de propósito — o usuário quer comparar as
 * duas antes de decidir trocar.
 */
export const Route = createFileRoute("/_authenticated/banco-influenciadores-v2")({
  component: BancoInfluenciadoresV2Layout,
  validateSearch: z.object({ influenciador: z.string().optional() }),
});

function BancoInfluenciadoresV2Layout() {
  const navigate = useNavigate();
  const onSelect = (key: SectionKey) => {
    if (key === "influenciadores") return;
    void navigate({ to: "/time", search: { section: key } });
  };

  return (
    <AppShell active="influenciadores" onSelect={onSelect}>
      <InfluencerBancoV2Page />
    </AppShell>
  );
}
