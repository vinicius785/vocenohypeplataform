import { useCallback, useEffect, useRef, useState } from "react";
import {
  countEditorial,
  createEditorial,
  deleteEditorial,
  editorialErrorMessage,
  fetchEditorialRange,
  updateEditorial,
} from "@/lib/marketing-editorial-store";
import type { EditorialDraft, EditorialItem, EditorialPatch } from "@/lib/marketing-editorial";

/** Conteúdos do período visível. Busca ao abrir e ao trocar de mês; depois de cada ação atualiza a
 * lista local (sem polling). */
export function useEditorialRange(projetoId: string, from: string, to: string) {
  const [items, setItems] = useState<EditorialItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const seq = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    setError(null);
    try {
      const [list, count] = await Promise.all([
        fetchEditorialRange(projetoId, from, to),
        countEditorial(projetoId),
      ]);
      if (mine !== seq.current) return;
      setItems(list);
      setTotal(count);
    } catch (e) {
      if (mine !== seq.current) return;
      setError(editorialErrorMessage(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [projetoId, from, to]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const inRange = useCallback((it: EditorialItem) => it.data >= from && it.data <= to, [from, to]);

  const create = async (draft: EditorialDraft) => {
    const it = await createEditorial(projetoId, draft);
    if (inRange(it)) setItems((prev) => [...prev, it]);
    setTotal((t) => (t ?? 0) + 1);
    return it;
  };
  const update = async (id: string, patch: EditorialPatch) => {
    const it = await updateEditorial(id, patch);
    setItems((prev) => {
      const without = prev.filter((x) => x.id !== id);
      return inRange(it) ? [...without, it] : without;
    });
    return it;
  };
  const remove = async (id: string) => {
    await deleteEditorial(id);
    setItems((prev) => prev.filter((x) => x.id !== id));
    setTotal((t) => Math.max(0, (t ?? 1) - 1));
  };

  return { items, loading, error, total, reload, create, update, remove };
}
