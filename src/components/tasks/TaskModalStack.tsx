import { useTaskModalStack, popTaskModal } from "@/lib/task-modal-stack";
import { findTaskContext } from "@/lib/task-directory";
import { TaskDialog } from "./TaskBoard";

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
    <TaskDialog
      open
      onOpenChange={(o) => !o && popTaskModal()}
      initial={ctx.task}
      scope={ctx.scope}
      breadcrumb={ctx.breadcrumb}
      onSave={ctx.save}
      onDelete={() => {
        ctx.remove();
        popTaskModal();
      }}
    />
  );
}
