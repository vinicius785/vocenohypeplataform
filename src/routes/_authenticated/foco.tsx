import { createFileRoute } from "@tanstack/react-router";
import { FocusModeScreen } from "@/components/focus/FocusModeScreen";

/** Rota própria e imersiva do Modo Foco (item 2) — nunca renderiza
 * `AppShell` (sem sidebar/busca/notificações), ocupando toda a área
 * disponível, igual ao padrão já usado por `CallOverlay.tsx` pra telas
 * de tela cheia. `taskId` (opcional) chega do acesso contextual
 * ("Iniciar foco" numa tarefa específica) já pré-selecionado; `from`
 * guarda a rota de origem pra "Sair do foco" voltar exatamente pra lá
 * (item 2: "preservar a rota anterior"). */
export const Route = createFileRoute("/_authenticated/foco")({
  validateSearch: (search: Record<string, unknown>): { taskId?: string; from?: string } => ({
    taskId: typeof search.taskId === "string" ? search.taskId : undefined,
    from: typeof search.from === "string" ? search.from : undefined,
  }),
  component: FocoRoute,
  head: () => ({ meta: [{ title: "Modo foco · Plataforma VNH" }] }),
});

function FocoRoute() {
  const { taskId, from } = Route.useSearch();
  return <FocusModeScreen initialTaskId={taskId} returnTo={from ?? "/time"} />;
}
