import { useCallback, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * In-app replacement for window.confirm(): native confirm() dialogs are
 * blocked/suppressed in some browsers and webviews, silently returning
 * false and making delete buttons look like they "do nothing".
 */
export function useConfirm() {
  const [state, setState] = useState<{ message: string; resolve: (v: boolean) => void } | null>(
    null,
  );

  const confirm = useCallback((message: string) => {
    return new Promise<boolean>((resolve) => {
      setState({ message, resolve });
    });
  }, []);

  const settle = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const confirmDialog = (
    <AlertDialog open={!!state} onOpenChange={(o) => !o && settle(false)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar ação</AlertDialogTitle>
          <AlertDialogDescription>{state?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>Confirmar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, confirmDialog };
}

/**
 * Variante de `useConfirm` com mais de duas saídas (ex: "só esta" vs
 * "todas" vs cancelar, pra ações numa reunião/item recorrente) — mesmo
 * padrão de Promise resolvida pelo clique, só que resolve pro `value` da
 * opção escolhida (ou `null` se cancelar/fechar) em vez de um boolean.
 */
export function useConfirmChoice<T extends string>() {
  const [state, setState] = useState<{
    message: string;
    options: { value: T; label: string }[];
    resolve: (v: T | null) => void;
  } | null>(null);

  const confirmChoice = useCallback((message: string, options: { value: T; label: string }[]) => {
    return new Promise<T | null>((resolve) => {
      setState({ message, options, resolve });
    });
  }, []);

  const settle = (value: T | null) => {
    state?.resolve(value);
    setState(null);
  };

  const confirmChoiceDialog = (
    <AlertDialog open={!!state} onOpenChange={(o) => !o && settle(null)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Reunião recorrente</AlertDialogTitle>
          <AlertDialogDescription>{state?.message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(null)}>Cancelar</AlertDialogCancel>
          {state?.options.map((o) => (
            <AlertDialogAction key={o.value} onClick={() => settle(o.value)}>
              {o.label}
            </AlertDialogAction>
          ))}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirmChoice, confirmChoiceDialog };
}
