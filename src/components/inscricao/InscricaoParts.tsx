import { useRef, useState, type ReactNode } from "react";
import { Check, FileText, Loader2, Plus, UploadCloud, X } from "lucide-react";
import { DateField } from "@/components/ui/date-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelect } from "@/components/ui/native-select";
import { PLATAFORMAS, platformDef, groupByPlatform } from "@/lib/social-profiles";
import { ANEXO_ACEITOS } from "@/lib/inscricao-validation";
import type { CustomQuestion } from "@/lib/inscricao-page";
import { INPUT, inputClass } from "./input-class";

export type RedeForm = {
  id: string;
  plataforma: string;
  handle: string;
  profileUrl?: string;
  seguidores: string;
  isPrimary?: boolean;
};
export type RespostaValue = string | string[];

/** Rótulo + campo + erro/ajuda ligados por id (leitor de tela lê o erro junto do campo). */
export function Field({
  id,
  label,
  required,
  optional,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: (a: { id: string; "aria-invalid": boolean; "aria-describedby"?: string }) => ReactNode;
}) {
  const describedBy = error ? `${id}-erro` : hint ? `${id}-ajuda` : undefined;
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {optional && <span className="ml-1 font-normal text-text-secondary">(opcional)</span>}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        )}
      </label>
      <div className="mt-1.5">
        {children({ id, "aria-invalid": !!error, "aria-describedby": describedBy })}
      </div>
      {error ? (
        <p id={`${id}-erro`} role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-ajuda`} className="mt-1.5 text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Etapa numerada do formulário (1 Seus dados, 2 Redes...). Sem card dentro de card: só um
 * número, o título e o conteúdo, separados por espaço e uma linha sutil. */
export function FormStep({
  n,
  title,
  description,
  done,
  children,
}: {
  n: number;
  title: string;
  description?: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`etapa-${n}`}
      className="border-t border-border/60 pt-8 first:border-t-0 first:pt-0"
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
            done ? "bg-foreground text-background" : "bg-muted text-muted-foreground"
          }`}
        >
          {done ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        <div className="min-w-0">
          <h3 id={`etapa-${n}`} className="text-base font-semibold text-foreground">
            {title}
            {done && <span className="sr-only"> (concluída)</span>}
          </h3>
          {description && <p className="mt-0.5 text-sm text-text-secondary">{description}</p>}
        </div>
      </div>
      <div className="mt-5 space-y-4 sm:pl-10">{children}</div>
    </section>
  );
}

export function SocialPicker({
  redes,
  error,
  dupError,
  onAdd,
  onUpdate,
  onCommit,
  onRemove,
  onPrimary,
}: {
  redes: RedeForm[];
  error?: string;
  dupError: string | null;
  onAdd: (plataforma: string) => void;
  onUpdate: (id: string, patch: Partial<RedeForm>) => void;
  onCommit: (r: RedeForm) => void;
  onRemove: (id: string) => void;
  onPrimary: (plataforma: string, id: string) => void;
}) {
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const countOf = (key: string) => redes.filter((r) => r.plataforma === key).length;
  return (
    <div id="field-redes" tabIndex={-1} className="space-y-4 outline-none">
      <div>
        <p id="redes-legenda" className="text-sm font-medium text-foreground">
          Onde você publica?
        </p>
        <div
          role="group"
          aria-labelledby="redes-legenda"
          className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {PLATAFORMAS.map((p) => {
            const n = countOf(p.key);
            return (
              <button
                key={p.key}
                type="button"
                aria-pressed={n > 0}
                onClick={() => {
                  if (n === 0) onAdd(p.key);
                  else {
                    const first = redes.find((r) => r.plataforma === p.key);
                    if (first) refs.current[first.id]?.focus();
                  }
                }}
                className={`flex h-11 items-center justify-between gap-2 rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  n > 0
                    ? "border-foreground bg-muted text-foreground"
                    : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                }`}
              >
                {p.label}
                {n > 0 ? (
                  <Check className="h-4 w-4" aria-label="Adicionada" />
                ) : (
                  <Plus className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </div>

      {groupByPlatform(redes).map(([plataforma, items]) => {
        const def = platformDef(plataforma);
        return (
          <div key={plataforma} className="space-y-2">
            <p className="text-sm font-semibold text-foreground">{plataforma}</p>
            {items.map((r) => (
              <div key={r.id} className="space-y-1.5">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`rede-${r.id}`} className="text-xs text-text-secondary">
                      {def?.usesHandle ? "Usuário" : "Link"}
                    </label>
                    <div className="mt-1 flex items-center gap-1.5">
                      {def?.usesHandle && <span className="text-sm text-text-secondary">@</span>}
                      <Input
                        id={`rede-${r.id}`}
                        ref={(el) => {
                          refs.current[r.id] = el;
                        }}
                        placeholder={def?.placeholder ?? "usuario"}
                        value={r.handle}
                        onChange={(e) => onUpdate(r.id, { handle: e.target.value })}
                        onBlur={() => onCommit(r)}
                        autoCapitalize="none"
                        autoCorrect="off"
                        className={INPUT}
                      />
                    </div>
                  </div>
                  <div className="w-24 shrink-0 sm:w-32">
                    <label htmlFor={`seg-${r.id}`} className="text-xs text-text-secondary">
                      Seguidores
                    </label>
                    <Input
                      id={`seg-${r.id}`}
                      inputMode="numeric"
                      placeholder="Ex.: 25 mil"
                      value={r.seguidores}
                      onChange={(e) => onUpdate(r.id, { seguidores: e.target.value })}
                      className={`mt-1 ${INPUT}`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(r.id)}
                    aria-label={`Remover este perfil de ${plataforma}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:h-10 md:w-10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onPrimary(plataforma, r.id)}
                    aria-pressed={!!r.isPrimary}
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      r.isPrimary
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {r.isPrimary ? "Perfil principal" : "Tornar principal"}
                  </button>
                )}
                {dupError === r.id && (
                  <p role="alert" className="text-xs text-destructive">
                    Você já adicionou um perfil igual nesta rede.
                  </p>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={() => onAdd(plataforma)}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus className="h-3.5 w-3.5" /> Adicionar outro perfil de {plataforma}
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function UploadField({
  anexo,
  uploading,
  error,
  required,
  onFile,
  onRemove,
}: {
  anexo: { nome: string; dataUrl: string } | null;
  uploading: boolean;
  error?: string | null;
  required: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // O tamanho aproximado vem do próprio data-URL (base64 ≈ 4/3 do original).
  const kb = anexo
    ? Math.round(((anexo.dataUrl.length - anexo.dataUrl.indexOf(",") - 1) * 3) / 4 / 1024)
    : 0;
  return (
    <div id="field-anexo" tabIndex={-1} className="outline-none">
      <p className="text-sm font-medium text-foreground">
        Mídia kit
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        ) : (
          <span className="ml-1 font-normal text-text-secondary">(opcional)</span>
        )}
      </p>
      <div className="mt-1.5">
        {anexo ? (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
            <FileText className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{anexo.nome}</p>
              <p className="text-xs text-text-secondary">
                {kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`} · pronto para enviar
              </p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remover ${anexo.nome}`}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <label
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) onFile(f);
            }}
            className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-7 text-center transition-colors focus-within:ring-2 focus-within:ring-brand ${
              drag ? "border-foreground bg-muted" : "border-border hover:border-foreground"
            }`}
          >
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            ) : (
              <UploadCloud className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="text-sm font-medium text-foreground">
              {uploading ? "Lendo o arquivo..." : "Toque para escolher ou arraste o arquivo aqui"}
            </span>
            <span className="text-xs text-text-secondary">
              {ANEXO_ACEITOS.label} · até {ANEXO_ACEITOS.maxLabel}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept={ANEXO_ACEITOS.mimes.join(",")}
              className="sr-only"
              disabled={uploading}
              aria-label="Escolher arquivo do mídia kit"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFile(file);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function CustomQuestionField({
  question,
  value,
  error,
  onChange,
}: {
  question: CustomQuestion;
  value: RespostaValue | undefined;
  error?: string;
  onChange: (v: RespostaValue) => void;
}) {
  const id = `field-q:${question.id}`;
  const common = { id, label: question.label, required: question.required, error };
  const chip = (active: boolean) =>
    `inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border text-muted-foreground hover:text-foreground"
    }`;

  if (question.type === "texto_longo")
    return (
      <Field {...common}>
        {(a) => (
          <Textarea
            {...a}
            rows={3}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass(!!error)}
          />
        )}
      </Field>
    );
  if (question.type === "numero")
    return (
      <Field {...common}>
        {(a) => (
          <Input
            {...a}
            type="number"
            inputMode="numeric"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass(!!error)}
          />
        )}
      </Field>
    );
  if (question.type === "data")
    return (
      <Field {...common}>
        {() => (
          <DateField
            ariaLabel={question.label}
            value={(value as string) || undefined}
            onChange={(v) => onChange(v ?? "")}
            className={inputClass(!!error)}
          />
        )}
      </Field>
    );
  if (question.type === "sim_nao")
    return (
      <Field {...common}>
        {() => (
          <div role="group" aria-label={question.label} className="flex gap-2">
            {["Sim", "Não"].map((opt) => (
              <button
                key={opt}
                type="button"
                aria-pressed={value === opt}
                onClick={() => onChange(opt)}
                className={chip(value === opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </Field>
    );
  if (question.type === "selecao_unica")
    return (
      <Field {...common}>
        {(a) => (
          <NativeSelect
            {...a}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            selectClassName={inputClass(!!error)}
          >
            <option value="">Selecione</option>
            {(question.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
    );
  if (question.type === "selecao_multipla") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <Field {...common}>
        {() => (
          <div role="group" aria-label={question.label} className="flex flex-wrap gap-2">
            {(question.options ?? []).map((opt) => {
              const active = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  aria-pressed={active}
                  onClick={() =>
                    onChange(active ? selected.filter((o) => o !== opt) : [...selected, opt])
                  }
                  className={chip(active)}
                >
                  {active ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {opt}
                </button>
              );
            })}
          </div>
        )}
      </Field>
    );
  }
  return (
    <Field {...common}>
      {(a) => (
        <Input
          {...a}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass(!!error)}
        />
      )}
    </Field>
  );
}
