import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateField } from "@/components/ui/date-field";
import { createRodada, type AeoRodada } from "@/lib/aeo-store";
import { todayISO } from "../aeo-ui-utils";

export function NovaRodadaDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (rodada: AeoRodada) => void;
}) {
  const [dataRodada, setDataRodada] = useState(todayISO());

  const submit = () => {
    if (!dataRodada) return;
    const nova = createRodada(dataRodada);
    onCreated(nova);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova rodada</DialogTitle>
        </DialogHeader>
        <div>
          <label className="block text-[11px] font-medium text-muted-foreground">
            Data da rodada
          </label>
          <DateField value={dataRodada} onChange={(v) => setDataRodada(v ?? "")} className="mt-1" />
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={submit}>
            Criar rodada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
