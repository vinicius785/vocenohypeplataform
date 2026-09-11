import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/** Composições pequenas sobre o `Skeleton` primitivo já existente
 * (`ui/skeleton.tsx`, não alterado) — o pedido era exemplos pra
 * card/lista/tabela/indicador, não um primitivo novo. */

export function SkeletonMetric() {
  return (
    <Card className="flex flex-col gap-2 p-5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-28" />
      <Skeleton className="h-3 w-16" />
    </Card>
  );
}

export function SkeletonCard() {
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </Card>
  );
}

export function SkeletonListRow() {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-2.5 w-1/4" />
      </div>
      <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
      <Skeleton className="h-3 w-14 shrink-0" />
    </div>
  );
}

export function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-0">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-3 flex-1" />
      ))}
    </div>
  );
}
