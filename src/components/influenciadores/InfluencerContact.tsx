import { useState } from "react";
import { toast } from "sonner";
import { mailtoUrl, whatsappUrl } from "@/lib/contact-links";
import { formatPhoneBR } from "@/lib/influencer-model";
import { QuietButton } from "./InfluencerCockpit";

const ACTION =
  "rounded text-xs text-text-secondary underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const INPUT =
  "h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function copy(text: string, what: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(`${what} copiado.`),
    () => toast.error("Não foi possível copiar."),
  );
}

/** Contato em LEITURA, compacto: rótulo pequeno, valor e ações (Copiar / WhatsApp / E-mail) na mesma
 * linha. Só mostra o que existe; sem nada, uma linha "Nenhum contato cadastrado" + "Adicionar
 * contato" (edição ali mesmo, nos mesmos campos `telefone`/`email`). */
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
  const has = !!phone || !!mail;
  return (
    <section aria-label="Contato" className="min-w-0 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-medium text-text-secondary">Contato</h3>
        {onSave && !editing && has && <QuietButton onClick={start}>Editar</QuietButton>}
      </div>
      {editing ? (
        <div className="space-y-2">
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
      ) : !has ? (
        <p className="flex flex-wrap items-baseline gap-x-3 text-sm text-text-secondary">
          Nenhum contato cadastrado
          {onSave && <QuietButton onClick={start}>Adicionar contato</QuietButton>}
        </p>
      ) : (
        <dl className="space-y-1.5">
          {phone && (
            <div className="min-w-0">
              <dt className="text-[11px] text-text-secondary">WhatsApp</dt>
              <dd className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-sm font-medium text-foreground">{phone}</span>
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
                    Abrir
                  </a>
                )}
              </dd>
            </div>
          )}
          {mail && (
            <div className="min-w-0">
              <dt className="text-[11px] text-text-secondary">E-mail</dt>
              <dd className="flex flex-wrap items-baseline gap-x-3">
                <span className="min-w-0 break-all text-sm font-medium text-foreground">
                  {mail}
                </span>
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
                    Enviar
                  </a>
                )}
              </dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}
