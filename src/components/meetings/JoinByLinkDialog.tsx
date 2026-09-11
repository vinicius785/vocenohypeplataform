import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Ação secundária do header: cola um link (ou código) de videochamada e
 * entra direto — só abre a URL numa nova aba, sem validar domínio. Modal
 * pequeno e focado (não um drawer) — o fluxo é um campo só. */
export function JoinByLinkDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const join = () => {
    const v = value.trim();
    if (!v) {
      setError("Informe um link ou código.");
      return;
    }
    const url = /^https?:\/\//.test(v) ? v : `https://meet.google.com/${v}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
    setValue("");
    setError(null);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setValue("");
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="comfortable">
          <LogIn className="h-3.5 w-3.5" /> Entrar com código ou link
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Entrar em uma reunião</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="join-by-link-input">Código ou link do Google Meet</Label>
          <Input
            id="join-by-link-input"
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                join();
              }
            }}
            placeholder="Ex.: abc-defg-hij ou meet.google.com/abc-defg-hij"
            autoFocus
            className="focus-visible:ring-brand"
            aria-invalid={!!error}
            aria-describedby={error ? "join-by-link-error" : undefined}
          />
          {error && (
            <p id="join-by-link-error" className="text-xs text-danger">
              {error}
            </p>
          )}
        </div>
        <Button
          variant="primary"
          size="comfortable"
          className="w-full"
          onClick={join}
          disabled={!value.trim()}
        >
          <LogIn className="h-3.5 w-3.5" /> Entrar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
