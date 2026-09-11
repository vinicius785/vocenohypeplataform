import { useState } from "react";
import { Search, Mail, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TYPOGRAPHY } from "@/lib/design-tokens";
import { SegmentedControl } from "@/components/ui/segmented-control";

const BUTTON_VARIANTS = [
  "primary",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;
const BUTTON_SIZES = ["sm", "default", "lg"] as const;

export function FormsSection() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"todos" | "ativos" | "arquivados">("todos");
  const [chartMode, setChartMode] = useState<"realizado" | "projetado">("realizado");
  const [filterValue, setFilterValue] = useState("");

  return (
    <div className="space-y-10">
      <section id="botoes" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Botões</h2>
        <p className={`${TYPOGRAPHY.bodySecondary} break-words`}>
          Variantes, tamanhos e estados. `variant="primary"` é o único que usa a marca — os demais
          mapeiam pro que já existe hoje (`default`, `outline`, `ghost`, `destructive`, `link`).
        </p>
        <div className="space-y-3">
          {BUTTON_VARIANTS.map((variant) => (
            <div key={variant} className="flex flex-wrap items-center gap-2">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{variant}</span>
              {BUTTON_SIZES.map((size) => (
                <Button key={size} variant={variant} size={size}>
                  {variant === "link" ? "Ver mais" : "Ação"}
                </Button>
              ))}
              <Button variant={variant} size="icon" aria-label="Adicionar">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">estados</span>
            <Button variant="primary" disabled>
              Desabilitado
            </Button>
            <Button variant="primary" isLoading={loading} onClick={() => setLoading((v) => !v)}>
              {loading ? "Carregando" : "Simular loading"}
            </Button>
          </div>
        </div>
      </section>

      <section id="icon-button" className="space-y-3">
        <h2 className={TYPOGRAPHY.sectionTitle}>IconButton</h2>
        <p className={TYPOGRAPHY.bodySecondary}>
          Sempre com nome acessível (`label`) — passe o mouse pra ver a tooltip.
        </p>
        <div className="flex items-center gap-2">
          <IconButton label="Buscar" tone="neutral">
            <Search className="h-4 w-4" />
          </IconButton>
          <IconButton label="Enviar e-mail" tone="brand">
            <Mail className="h-4 w-4" />
          </IconButton>
          <IconButton label="Remover" tone="destructive">
            <X className="h-4 w-4" />
          </IconButton>
        </div>
      </section>

      <section id="inputs" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Inputs</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={TYPOGRAPHY.label}>Nome</span>
            <Input placeholder="Ex: Ana Torres" />
            <span className={TYPOGRAPHY.caption}>Texto auxiliar opcional.</span>
          </label>
          <label className="space-y-1.5">
            <span className={TYPOGRAPHY.label}>E-mail (com erro)</span>
            <Input
              placeholder="voce@empresa.com"
              aria-invalid
              className="border-danger focus-visible:ring-danger"
            />
            <span className="text-[11px] text-danger">E-mail inválido.</span>
          </label>
          <label className="space-y-1.5">
            <span className={TYPOGRAPHY.label}>Busca</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar..." className="pl-8" />
            </div>
          </label>
          <label className="space-y-1.5">
            <span className={TYPOGRAPHY.label}>Somente leitura</span>
            <Input readOnly value="valor fixo" />
          </label>
          <label className="space-y-1.5">
            <span className={TYPOGRAPHY.label}>Desabilitado</span>
            <Input disabled placeholder="indisponível" />
          </label>
          <label className="space-y-1.5">
            <span className={TYPOGRAPHY.label}>Prefixo e sufixo</span>
            <div className="flex items-center rounded-md border border-input bg-transparent">
              <span className="px-2 text-xs text-muted-foreground">R$</span>
              <input
                className="h-9 flex-1 bg-transparent px-1 text-sm outline-none"
                placeholder="0,00"
              />
              <span className="px-2 text-xs text-muted-foreground">/mês</span>
            </div>
          </label>
        </div>
      </section>

      <section id="selects-filtros" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Selects e filtros</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className={TYPOGRAPHY.label}>Select simples</span>
            <Select value={filterValue} onValueChange={setFilterValue}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma opção" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="a">Opção A</SelectItem>
                <SelectItem value="b">Opção B</SelectItem>
                <SelectItem value="c">Opção C</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <div className="space-y-1.5">
            <span className={TYPOGRAPHY.label}>Sem seleção</span>
            <Select>
              <SelectTrigger>
                <SelectValue placeholder="Nada selecionado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="x">Item X</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <span className={TYPOGRAPHY.label}>Chips de filtros ativos</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {["Cliente: HubData", "Status: Ativo"].map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
              >
                {chip}
                <X className="h-3 w-3 text-muted-foreground" />
              </span>
            ))}
            <button
              type="button"
              className="text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
            >
              Limpar filtros
            </button>
          </div>
        </div>
      </section>

      <section id="segmented" className="space-y-4">
        <h2 className={TYPOGRAPHY.sectionTitle}>Segmented control</h2>
        <p className={TYPOGRAPHY.bodySecondary}>
          Só alterna visualização do mesmo conteúdo — nunca deve parecer navegação.
        </p>
        <div className="space-y-3">
          <SegmentedControl
            aria-label="Filtrar por status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "todos", label: "Todos" },
              { value: "ativos", label: "Ativos" },
              { value: "arquivados", label: "Arquivados" },
            ]}
          />
          <SegmentedControl
            aria-label="Realizado ou projetado"
            size="sm"
            value={chartMode}
            onChange={setChartMode}
            options={[
              { value: "realizado", label: "Realizado" },
              { value: "projetado", label: "Projetado" },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
