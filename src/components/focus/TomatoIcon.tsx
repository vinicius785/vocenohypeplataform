/** Ícone de tomate — referência direta à técnica Pomodoro ("tomate" em
 * italiano), usado no lugar de um ícone de relógio genérico em todo
 * acesso ao Modo Foco (cabeçalho global, menus de tarefa, "Meu
 * trabalho"). Desenhado à mão no mesmo padrão visual do lucide-react
 * (viewBox 24x24, `stroke="currentColor"`, `strokeWidth=2`, sem fill)
 * pra encaixar ao lado dos outros ícones sem destoar — não existe um
 * ícone de tomate pronto na biblioteca. */
export function TomatoIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 8c-4.4 0-8 3.4-8 7.5S8.6 21 12 21s8-2.4 8-5.5S16.4 8 12 8Z" />
      <path d="M12 8V5" />
      <path d="M12 5c-1.2-1.3-3-1.8-4.5-1.2C8 5.6 9.8 6.3 11 6" />
      <path d="M12 5c1.2-1.3 3-1.8 4.5-1.2C16 5.6 14.2 6.3 13 6" />
    </svg>
  );
}
