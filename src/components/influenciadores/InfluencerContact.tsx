import { useState } from "react";
import { Mail, Phone } from "lucide-react";
import { toast } from "sonner";
import { mailtoUrl, whatsappUrl } from "@/lib/contact-links";
import { formatPhoneBR } from "@/lib/influencer-model";
import { QuietButton } from "./InfluencerCockpit";

const ACTION =
  "rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const INPUT =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copiado.`),
    () => toast.error("Não foi possível copiar."),
  );
}

/** Contato em modo de LEITURA (sem precisar de "Editar"): telefone com Copiar/WhatsApp e e-mail com
 * Copiar/Enviar e-mail. Só mostra o que existe; sem nada, "Nenhum contato cadastrado." e a ação
 * discreta "Adicionar contato" (edição ali mesmo, nos mesmos campos `telefone`/`email`). */
export function InfluencerContact({
  telefone,
  email,
  onSave,
}: {
  telefone?: string;
  email?: string;
  onSave?: (patch: { telefone?: string; email?: string }) => void;
}) {
  const phone = telefone?.trim();
  const mail = email?.trim();
  const wa = whatsappUrl(phone);
  const mailto = mailtoUrl(mail);
  const [editing, setEditing] = useState(false);
  const [dPhone, setDPhone] = useState(phone ?? "");
  const [dMail, setDMail] = useState(mail ?? "");
  const start = () => {
    setDPhone(phone ?? "");
    setDMail(mail ?? "");
    setEditing(true);
  };
  const save = () => {
    onSave?.({ telefone: dPhone.trim() || undefined, email: dMail.trim() || undefined });
    setEditing(false);
  };
  return (
    <section aria-label="Contato" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2
          role="heading"
          aria-level={2}
          className="text-[11px] font-semibold uppercase tracking-wide text-text-secondary"
        >
          Contato
        </h2>
        {onSave && !editing && (
          <QuietButton onClick={start}>
            {phone || mail ? "Editar" : "Adicionar contato"}
          </QuietButton>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              value={dPhone}
              onChange={(e) => setDPhone(formatPhoneBR(e.target.value))}
              placeholder="Telefone / WhatsApp"
              aria-label="Telefone"
              inputMode="tel"
              className={INPUT}
            />
            <input
              value={dMail}
              onChange={(e) => setDMail(e.target.value)}
              placeholder="E-mail"
              aria-label="E-mail"
              inputMode="email"
              className={INPUT}
            />
          </div>
          <div className="flex justify-end gap-3">
            <QuietButton onClick={() => setEditing(false)}>Cancelar</QuietButton>
            <button
              type="button"
              onClick={save}
              className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background hover:opacity-90"
            >
              Salvar
            </button>
          </div>
        </div>
      ) : !phone && !mail ? (
        <p className="text-sm text-text-secondary">Nenhum contato cadastrado.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {phone && (
            <li className="min-w-0">
              <div className="flex min-w-0 items-start gap-2">
                <Phone className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="break-all text-sm text-foreground">{phone}</p>
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
                </div>
              </div>
            </li>
          )}
          {mail && (
            <li className="min-w-0">
              <div className="flex min-w-0 items-start gap-2">
                <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0">
                  <p className="break-all text-sm text-foreground">{mail}</p>
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
                </div>
              </div>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
