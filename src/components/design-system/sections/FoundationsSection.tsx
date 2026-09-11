import {
  TYPOGRAPHY,
  SPACING,
  RADIUS,
  ELEVATION,
  TYPOGRAPHY_MIGRATION_NOTE,
} from "@/lib/design-tokens";
import { cn } from "@/lib/utils";
import { Plus, Bug, Loader2, Check, X } from "lucide-react";

const LIGHT_SWATCHES = [
  { name: "Fundo principal", hex: "#F3F4F6", cls: "bg-[#F3F4F6]" },
  { name: "Fundo alternativo", hex: "#ECEEF2", cls: "bg-[#ECEEF2]" },
  { name: "Superfície principal", hex: "#FFFFFF", cls: "bg-[#FFFFFF] border border-border" },
  { name: "Superfície secundária", hex: "#F8F9FB", cls: "bg-[#F8F9FB]" },
  { name: "Superfície interativa", hex: "#F0F2F6", cls: "bg-[#F0F2F6]" },
  { name: "Borda discreta", hex: "#E2E5EA", cls: "bg-[#E2E5EA]" },
  { name: "Texto principal", hex: "#111318", cls: "bg-[#111318]" },
  { name: "Texto secundário", hex: "#667085", cls: "bg-[#667085]" },
];

const DARK_SWATCHES = [
  { name: "Fundo principal", hex: "#090B0F", cls: "bg-[#090B0F]" },
  { name: "Fundo alternativo", hex: "#0D1015", cls: "bg-[#0D1015]" },
  { name: "Superfície principal", hex: "#11141A", cls: "bg-[#11141A]" },
  { name: "Superfície elevada", hex: "#181C24", cls: "bg-[#181C24]" },
  { name: "Superfície interativa", hex: "#202530", cls: "bg-[#202530]" },
  { name: "Borda discreta", hex: "#282D38", cls: "bg-[#282D38]" },
  { name: "Texto principal", hex: "#F7F8FA", cls: "bg-[#F7F8FA]" },
  { name: "Texto secundário", hex: "#98A1B2", cls: "bg-[#98A1B2]" },
];

const BRAND_SWATCHES = [
  { name: "Marca", cls: "bg-brand", note: "#6F95FF" },
  {
    name: "Marca hover",
    cls: "bg-brand-hover",
    note: "mais clara no escuro, mais escura no claro",
  },
  {
    name: "Marca suave",
    cls: "bg-brand-subtle border border-border",
    note: "fundo de chip ou badge",
  },
];

const SEMANTIC_SWATCHES = [
  { name: "Success", solid: "bg-success", soft: "bg-success-soft text-success-soft-foreground" },
  { name: "Warning", solid: "bg-warning", soft: "bg-warning-soft text-warning-soft-foreground" },
  { name: "Danger", solid: "bg-danger", soft: "bg-danger-soft text-danger-soft-foreground" },
  { name: "Info", solid: "bg-info", soft: "bg-info-soft text-info-soft-foreground" },
];

function Swatch({ name, hex, cls }: { name: string; hex?: string; cls: string }) {
  return (
    <div className="space-y-1.5">
      <div className={`h-14 w-full rounded-lg ${cls}`} />
      <p className="text-xs font-medium text-foreground">{name}</p>
      {hex && <p className="text-[11px] text-muted-foreground">{hex}</p>}
    </div>
  );
}

export function FoundationsSection() {
  return (
    <div className="space-y-10">
      <section id="principios" className="space-y-3">
        <h2 className={TYPOGRAPHY.sectionTitle}>Princípios</h2>
        <p className={cn(TYPOGRAPHY.body, "break-words")}>
          Minimalista, premium, modular. Hierarquia vem de tipografia e espaço, não de mais uma
          borda. Cor é reservada: azul de marca pra ação, foco e navegação — verde, amarelo e
          vermelho só quando há significado real (sucesso, atenção, risco).
        </p>
        <ul className={cn(TYPOGRAPHY.bodySecondary, "list-inside list-disc space-y-1 break-words")}>
          <li>Sem gradiente decorativo, sem sombra pesada, sem card dentro de card.</li>
          <li>Um componente por função — nunca dois botões ou cards diferentes pro mesmo papel.</li>
          <li>Raio contido no desktop (14–18px em cards), levemente maior no mobile.</li>
        </ul>
      </section>

      <section id="paleta-clara" className="space-y-3">
        <h2 className={TYPOGRAPHY.sectionTitle}>Paleta — modo claro</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {LIGHT_SWATCHES.map((s) => (
            <Swatch key={s.name} {...s} />
          ))}
        </div>
      </section>

      <section id="paleta-escura" className="space-y-3">
        <h2 className={TYPOGRAPHY.sectionTitle}>Paleta — modo escuro</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {DARK_SWATCHES.map((s) => (
            <Swatch key={s.name} {...s} />
          ))}
        </div>
        <p className={cn(TYPOGRAPHY.caption, "break-words")}>
          Esses valores fixos ilustram a referência do modo escuro independente do tema ativo nesta
          página — os tokens reais (`--brand`, `--success`...) já respondem ao tema.
        </p>
      </section>

      <section id="marca-semantica" className="space-y-3">
        <h2 className={TYPOGRAPHY.sectionTitle}>Marca e cores semânticas</h2>
        <div className="grid grid-cols-3 gap-4">
          {BRAND_SWATCHES.map((s) => (
            <div key={s.name} className="space-y-1.5">
              <div className={`h-14 w-full rounded-lg ${s.cls}`} />
              <p className="text-xs font-medium text-foreground">{s.name}</p>
              <p className="break-words text-[11px] text-muted-foreground">{s.note}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {SEMANTIC_SWATCHES.map((s) => (
            <div key={s.name} className="space-y-1.5">
              <div className={`h-10 w-full rounded-lg ${s.solid}`} />
              <div
                className={`h-10 w-full rounded-lg ${s.soft} flex items-center justify-center text-[11px] font-medium`}
              >
                suave
              </div>
              <p className="text-xs font-medium text-foreground">{s.name}</p>
            </div>
          ))}
        </div>
        <p className={cn(TYPOGRAPHY.caption, "break-words")}>
          Verde, amarelo e vermelho nunca substituem a marca em botão principal, link, foco, seleção
          ou navegação ativa — só indicam estado.
        </p>
      </section>

      <section id="tipografia" className="space-y-3">
        <h2 className={TYPOGRAPHY.sectionTitle}>Tipografia</h2>
        <div className="space-y-3 rounded-xl border border-border bg-card p-5">
          <p className={TYPOGRAPHY.display}>Display — Aa 123</p>
          <p className={TYPOGRAPHY.pageTitle}>Título de página — Aa 123</p>
          <p className={TYPOGRAPHY.sectionTitle}>Título de seção — Aa 123</p>
          <p className={TYPOGRAPHY.cardTitle}>Título de card — Aa 123</p>
          <p className={TYPOGRAPHY.body}>
            Texto principal — o corpo do conteúdo, legível e neutro.
          </p>
          <p className={TYPOGRAPHY.bodySecondary}>Texto secundário — contexto, descrição, apoio.</p>
          <p className={TYPOGRAPHY.label}>Label — categoria do campo</p>
          <p className={TYPOGRAPHY.caption}>Caption — nota fina, metadado</p>
          <p className={TYPOGRAPHY.numberLarge}>R$ 42.900</p>
          <p className={TYPOGRAPHY.numberMedium}>128</p>
        </div>
        <details className="group rounded-xl border border-border p-4">
          <summary className="cursor-pointer text-xs font-medium text-text-secondary group-open:text-foreground">
            Nota técnica de migração (não executada agora)
          </summary>
          <p className="mt-2 break-words text-xs text-text-secondary">
            {TYPOGRAPHY_MIGRATION_NOTE}
          </p>
        </details>
      </section>

      <section id="espacamento" className="space-y-3">
        <h2 className={TYPOGRAPHY.sectionTitle}>Espaçamento</h2>
        <div className="grid gap-2 text-xs sm:grid-cols-2">
          {Object.entries(SPACING).map(([role, cls]) => (
            <div
              key={role}
              className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
            >
              <span className="text-foreground">{role}</span>
              <code className="text-muted-foreground">{cls}</code>
            </div>
          ))}
        </div>
      </section>

      <section id="raios-sombras" className="grid gap-8 sm:grid-cols-2">
        <div className="space-y-3">
          <h2 className={TYPOGRAPHY.sectionTitle}>Raios</h2>
          <div className="flex flex-wrap items-end gap-4">
            {Object.entries(RADIUS).map(([role, cls]) => (
              <div key={role} className="space-y-1.5 text-center">
                <div className={`h-14 w-14 border border-border bg-muted ${cls}`} />
                <p className="text-[11px] text-muted-foreground">{role}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          <h2 className={TYPOGRAPHY.sectionTitle}>Sombras / elevação</h2>
          <div className="flex flex-wrap gap-4">
            {Object.entries(ELEVATION).map(([role, cls]) => (
              <div key={role} className="space-y-1.5 text-center">
                <div className={`h-14 w-20 rounded-xl bg-card ${cls}`} />
                <p className="text-[11px] text-muted-foreground">{role}</p>
              </div>
            ))}
          </div>
          <p className={TYPOGRAPHY.caption}>
            No escuro, a diferença vem do contraste de superfície e borda, não de sombra preta.
          </p>
        </div>
      </section>

      <section id="icones" className="space-y-3">
        <h2 className={TYPOGRAPHY.sectionTitle}>Ícones</h2>
        <p className={TYPOGRAPHY.bodySecondary}>lucide-react (já em uso em toda a plataforma).</p>
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
          {[Plus, Bug, Loader2, Check, X].map((Icon, i) => (
            <Icon key={i} className="h-5 w-5" />
          ))}
        </div>
      </section>
    </div>
  );
}
