import { useEffect, useState } from "react";
import { Check, Copy, ExternalLink, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryIcon, ServiceBadge } from "./ServiceBadge";
import { DECRYPT_FAILED, displayHost, safeExternalUrl, type Senha } from "./cofre-model";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 border-t border-border/60 py-3 first:border-t-0 first:pt-0">
      <p className="text-[11px] font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      {children}
    </div>
  );
}

function CopyButton({
  label,
  onCopy,
  disabled,
}: {
  label: string;
  onCopy: () => void;
  disabled?: boolean;
}) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled}
      aria-label={label}
      onClick={() => {
        onCopy();
        setDone(true);
        window.setTimeout(() => setDone(false), 1400);
      }}
      className="shrink-0 gap-1.5 text-text-secondary"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copiado" : "Copiar"}
    </Button>
  );
}

/**
 * Leitura da credencial. A senha nasce OCULTA e some de novo ao fechar; mostrar/copiar usam o texto
 * já descriptografado pelo cofre (mesma fonte de antes — nada de segredo novo em memória).
 */
export function SenhaDetail({
  s,
  plainSenha,
  onClose,
  onEdit,
  onCopy,
}: {
  s: Senha;
  /** Senha em claro, ou `undefined` enquanto ainda descriptografa. */
  plainSenha: string | undefined;
  onClose: () => void;
  onEdit: () => void;
  onCopy: (value: string, what: string) => void;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(false), [s.id]);
  const failed = plainSenha === DECRYPT_FAILED;
  const ready = plainSenha !== undefined && !failed;
  const site = safeExternalUrl(s.url);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent mobileFullScreen className="max-w-md gap-5">
        <DialogHeader className="flex-row items-center gap-3 space-y-0 text-left">
          <ServiceBadge nome={s.nome} size="lg" />
          <div className="min-w-0">
            <DialogTitle className="truncate text-lg">{s.nome}</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              <CategoryIcon categoria={s.categoria} className="h-3.5 w-3.5" />
              {s.categoria || "Sem categoria"}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div>
          {s.usuario && (
            <Row label="Usuário / e-mail">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 break-all text-sm text-foreground">{s.usuario}</p>
                <CopyButton label="Copiar usuário" onCopy={() => onCopy(s.usuario, "Usuário")} />
              </div>
            </Row>
          )}

          <Row label="Senha">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate font-mono text-sm text-foreground">
                {failed
                  ? "Não foi possível descriptografar"
                  : plainSenha === undefined
                    ? "Carregando…"
                    : show
                      ? plainSenha
                      : "•".repeat(Math.min(14, Math.max(8, plainSenha.length)))}
              </p>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!ready}
                  aria-label={show ? "Ocultar senha" : "Mostrar senha"}
                  aria-pressed={show}
                  onClick={() => setShow((v) => !v)}
                  className="gap-1.5 text-text-secondary"
                >
                  {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  {show ? "Ocultar" : "Mostrar"}
                </Button>
                <CopyButton
                  label="Copiar senha"
                  disabled={!ready}
                  onCopy={() => plainSenha && onCopy(plainSenha, "Senha")}
                />
              </div>
            </div>
          </Row>

          {site && (
            <Row label="Site">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm text-foreground" title={s.url}>
                  {displayHost(s.url)}
                </p>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1.5 text-text-secondary"
                >
                  <a href={site} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" /> Abrir
                  </a>
                </Button>
              </div>
            </Row>
          )}

          {s.notas && (
            <Row label="Notas">
              <p className="whitespace-pre-wrap break-words text-sm text-foreground">{s.notas}</p>
            </Row>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={onEdit}>
            Editar
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
