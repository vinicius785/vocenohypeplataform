import { Copy, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { mailtoUrl, whatsappUrl } from "@/lib/contact-links";

const ICON_BTN =
  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-text-secondary hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copiado.`),
    () => toast.error("Não foi possível copiar."),
  );
}

/** Contato como METADADO do cabeçalho (logo abaixo do nome): telefone e e-mail em uma linha, com
 * ícones discretos de copiar / abrir WhatsApp. Sem contato: "Sem contato cadastrado" + "Adicionar
 * contato" (abre a edição do cabeçalho). Nunca exige "Editar" para descobrir os dados. */
export function HeaderContact({
  telefone,
  email,
  onAdd,
}: {
  telefone?: string;
  email?: string;
  onAdd?: () => void;
}) {
  const phone = telefone?.trim();
  const mail = email?.trim();
  const wa = whatsappUrl(phone);
  const mailto = mailtoUrl(mail);
  if (!phone && !mail) {
    return (
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-xs text-text-secondary">
        Sem contato cadastrado
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="font-medium underline-offset-2 hover:text-foreground hover:underline"
          >
            Adicionar contato
          </button>
        )}
      </p>
    );
  }
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground/90">
      {phone && (
        <span className="inline-flex items-center gap-0.5">
          <span>{phone}</span>
          <button
            type="button"
            className={ICON_BTN}
            onClick={() => copy(phone, "Telefone")}
            aria-label="Copiar telefone"
            title="Copiar telefone"
          >
            <Copy className="h-3 w-3" />
          </button>
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noreferrer"
              className={ICON_BTN}
              aria-label="Abrir conversa no WhatsApp"
              title="Abrir no WhatsApp"
            >
              <MessageCircle className="h-3 w-3" />
            </a>
          )}
        </span>
      )}
      {phone && mail && (
        <span aria-hidden className="text-text-secondary">
          ·
        </span>
      )}
      {mail && (
        <span className="inline-flex min-w-0 items-center gap-0.5">
          {mailto ? (
            <a href={mailto} className="min-w-0 break-all hover:underline" title="Enviar e-mail">
              {mail}
            </a>
          ) : (
            <span className="break-all">{mail}</span>
          )}
          <button
            type="button"
            className={ICON_BTN}
            onClick={() => copy(mail, "E-mail")}
            aria-label="Copiar e-mail"
            title="Copiar e-mail"
          >
            <Copy className="h-3 w-3" />
          </button>
        </span>
      )}
    </p>
  );
}
