import { useTaskModalStack, popTaskModal } from "@/lib/task-modal-stack";
import { findTaskContext } from "@/lib/task-directory";
import { lazy, Suspense } from "react";

// O workspace de tarefa (editor rico etc., ~600 KB) só carrega quando alguém abre uma
// tarefa por aqui — não faz parte do bundle do shell.
const TaskDialog = lazy(() => import("./TaskBoard").then((m) => ({ default: m.TaskDialog })));

/** Overlay global — tarefas abertas a partir de uma dependência (item da
 * seção "Dependências" dentro de outra tarefa) empilham aqui, nunca
 * navegam de página, mesmo vindo de um projeto/campanha diferente do
 * board atualmente aberto. Fechar (X) só tira o topo da pilha — se havia
 * uma tarefa anterior, ela reaparece sozinha ("voltar"). Montado uma
 * única vez em `AppShell.tsx`. */
export function TaskModalStack() {
  const stack = useTaskModalStack();
  const topId = stack[stack.length - 1];
  if (!topId) return null;

  const ctx = findTaskContext(topId);
  if (!ctx) {
    // Tarefa não encontrada (excluída entre o clique e a resolução, ou
    // id inválido) — não deixa um dialog vazio pendurado, só recua.
    popTaskModal();
    return null;
  }

  return (
    <Suspense fallback={null}>
      <TaskDialog
        open
        onOpenChange={(o) => !o && popTaskModal()}
        initial={ctx.task}
        scope={ctx.scope}
        breadcrumb={ctx.breadcrumb}
        onSave={ctx.save}
        // Fechar aqui é só `onOpenChange` (linha acima) — `ctx.save` nunca
        // fecha nada sozinho, então é seguro reaproveitar pro autosave.
        onAutosave={ctx.save}
        onDelete={() => {
          ctx.remove();
          popTaskModal();
        }}
      />
    </Suspense>
  );
}
