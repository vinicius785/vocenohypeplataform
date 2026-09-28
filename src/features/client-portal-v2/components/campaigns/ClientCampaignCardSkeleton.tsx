/** Skeleton no formato exato do card — nunca um spinner solto. */
export function ClientCampaignCardSkeleton() {
  return (
    <div className="flex w-full max-w-[500px] animate-pulse flex-col gap-3 rounded-[20px] border border-border/60 bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 rounded-xl bg-muted" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-2/3 rounded bg-muted" />
          <div className="h-3 w-1/3 rounded bg-muted" />
        </div>
      </div>
      <div className="h-3 w-full rounded bg-muted" />
      <div className="h-1.5 w-full rounded-full bg-muted" />
    </div>
  );
}
