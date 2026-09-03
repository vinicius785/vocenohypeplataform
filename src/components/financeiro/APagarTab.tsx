import { PendingKindTab } from "./PendingKindTab";
import type { useFinanceiroFilteredEntries } from "./useFinanceiroFilteredEntries";

export function APagarTab({
  filtered,
}: {
  filtered: ReturnType<typeof useFinanceiroFilteredEntries>;
}) {
  return <PendingKindTab filtered={filtered} kind="despesa" />;
}
