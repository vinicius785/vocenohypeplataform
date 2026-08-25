import { useEffect, type RefObject } from "react";

/** Fecha um menu/popover ao clicar fora dele — mesmo padrão já usado em
 * `InfluencerBoard.tsx`, só generalizado pra aceitar um ref+estado já
 * existentes em vez de gerenciar o próprio estado (várias telas de Metas
 * têm mais de um popover independente na mesma página). */
export function useDropdown(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
