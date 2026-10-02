/** Faixa de resumo operacional — cinco números objetivos, sem ranking.
 * "Abertas" e "Atrasadas" levam à lista de tarefas que precisam de atenção. */
function Item({
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "danger";
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-semibold tabular-nums ${tone === "danger" && Number(value) > 0 ? "text-destructive" : "text-foreground"}`}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-text-secondary">{hint}</p>}
    </>
  );
  const cls = "min-w-0 rounded-2xl bg-card px-4 py-3 text-left dark:shadow-none";
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} cursor-pointer hover:bg-card/70`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function TimeSummaryStrip({
  openCount,
  dueTodayCount,
  overdueCount,
  membersCount,
  onlineCount,
  completedThisWeek,
  onOpenAberto,
  onOpenHoje,
  onOpenAtrasadas,
}: {
  openCount: number;
  dueTodayCount: number;
  overdueCount: number;
  membersCount: number;
  onlineCount: number;
  completedThisWeek: number;
  onOpenAberto: () => void;
  onOpenHoje: () => void;
  onOpenAtrasadas: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      <Item label="Tarefas abertas" value={openCount} onClick={onOpenAberto} />
      <Item label="Vencem hoje" value={dueTodayCount} onClick={onOpenHoje} />
      <Item label="Atrasadas" value={overdueCount} tone="danger" onClick={onOpenAtrasadas} />
      <Item label="Membros" value={membersCount} hint={`${onlineCount} online`} />
      <Item label="Concluídas na semana" value={completedThisWeek} />
    </div>
  );
}
