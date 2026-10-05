import { Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { mailtoUrl, whatsappUrl } from "@/lib/contact-links";

const ACTION =
  "rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copiado.`),
    () => toast.error("Não foi possível copiar."),
  );
}

/** Contato em modo de VISUALIZAÇÃO (sem precisar de "Editar"): telefone e e-mail com Copiar e
 * WhatsApp / E-mail. Só renderiza o que existe; sem nada, uma linha de aviso. Lê os mesmos campos
 * `telefone`/`email` que o editor do cabeçalho grava. */
export function InfluencerContact({ telefone, email }: { telefone?: string; email?: string }) {
  const phone = telefone?.trim();
  const mail = email?.trim();
  const wa = whatsappUrl(phone);
  const mailto = mailtoUrl(mail);
  return (
    <section aria-label="Contato" className="space-y-2">
      <p role="heading" aria-level={2} className="text-sm font-semibold text-foreground">
        Contato
      </p>
      {!phone && !mail ? (
        <p className="text-sm text-muted-foreground">Sem dados de contato cadastrados.</p>
      ) : (
        <ul className="space-y-1.5">
          {phone && (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="flex min-w-0 items-start gap-2">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-all text-sm text-foreground">{phone}</span>
              </span>
              <span className="flex items-center gap-2.5">
                <button
                  type="button"
                  className={ACTION}
                  onClick={() => copy(phone, "Telefone")}
                  aria-label="Copiar telefone"
                >
                  Copiar
                </button>
                {wa && (
                  <a
                    href={wa}
                    target="_blank"
                    rel="noreferrer"
                    className={ACTION}
                    aria-label="Abrir conversa no WhatsApp"
                  >
                    WhatsApp
                  </a>
                )}
              </span>
            </li>
          )}
          {mail && (
            <li className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className="flex min-w-0 items-start gap-2">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-all text-sm text-foreground">{mail}</span>
              </span>
              <span className="flex items-center gap-2.5">
                <button
                  type="button"
                  className={ACTION}
                  onClick={() => copy(mail, "E-mail")}
                  aria-label="Copiar e-mail"
                >
                  Copiar
                </button>
                {mailto && (
                  <a href={mailto} className={ACTION} aria-label="Enviar e-mail">
                    Enviar e-mail
                  </a>
                )}
              </span>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
