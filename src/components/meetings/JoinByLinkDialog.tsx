import { useState } from "react";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

/** Ação secundária do header: cola um link (ou código) de videochamada e
 * entra direto — só abre a URL numa nova aba, sem validar domínio. */
export function JoinByLinkDialog() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  const join = () => {
    const v = value.trim();
    if (!v) return;
    const url = /^https?:\/\//.test(v) ? v : `https://meet.google.com/${v}`;
    window.open(url, "_blank", "noopener,noreferrer");
    setOpen(false);
    setValue("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <LogIn className="h-3.5 w-3.5" /> Entrar com código ou link
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-xs font-medium text-muted-foreground">Entrar em uma reunião</p>
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                join();
              }
            }}
            placeholder="Link ou código do Google Meet"
            autoFocus
            className="h-9 flex-1 rounded-md border border-input bg-background px-2.5 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <Button size="sm" onClick={join} disabled={!value.trim()}>
            Entrar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
