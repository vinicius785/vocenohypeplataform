import { useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { AlertTriangle, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TYPOGRAPHY, type SemanticTone } from "@/lib/design-tokens";
import type { MetricDelta } from "@/lib/component-utils";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { DataTable, type DataTableColumn } from "@/components/shared/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const CHART_DATA = [
  { mes: "Jan", valor: 22 },
  { mes: "Fev", valor: 28 },
  { mes: "Mar", valor: 24 },
  { mes: "Abr", valor: 34 },
  { mes: "Mai", valor: 31 },
  { mes: "Jun", valor: 40 },
];
const chartConfig: ChartConfig = { valor: { label: "Vendas", color: "var(--brand)" } };

type Indicator = { label: string; value: string | null; tone?: SemanticTone; delta?: MetricDelta };

const DASHBOARD_INDICATORS: Indicator[] = [
  { label: "Receita", value: "R$ 128.400", tone: "success", delta: { value: 14 } },
  { label: "Novos clientes", value: "23", tone: "brand", delta: { value: 6 } },
  { label: "Ticket médio", value: "R$ 5.580", tone: "info" },
  { label: "Churn", value: "1,2%", tone: "danger", delta: { value: -3 } },
];

const DASHBOARD_INDICATORS_EMPTY: Indicator[] = DASHBOARD_INDICATORS.map((i) => ({
  label: i.label,
  value: null,
}));

type Lead = {
  id: string;
  nome: string;
  empresa: string;
  status: "novo" | "qualificado" | "perdido";
  valor: number;
};

const LEADS: Lead[] = [
  { id: "1", nome: "Marina Alves", empresa: "HubData", status: "qualificado", valor: 12500 },
  { id: "2", nome: "Diego Sousa", empresa: "Cix Citzen", status: "novo", valor: 8300 },
  {
    id: "3",
    nome: "Patrícia Nunes Ferreira Costa Almeida",
    empresa: "Consultoria Internacional de Operações",
    status: "novo",
    valor: 42100,
  },
  { id: "4", nome: "Bruno Lima", empresa: "Rodonaves", status: "perdido", valor: 4200 },
  { id: "5", nome: "Sem responsável definido ainda", empresa: "Jackery", status: "novo", valor: 0 },
];

const LEAD_STATUS_TONE = { novo: "info", qualificado: "success", perdido: "neutral" } as const;
const LEAD_STATUS_LABEL = { novo: "Novo", qualificado: "Qualificado", perdido: "Perdido" } as const;

const leadColumns: DataTableColumn<Lead>[] = [
  { key: "nome", header: "Contato", getValue: (r) => r.nome, sortable: true },
  { key: "empresa", header: "Empresa", getValue: (r) => r.empresa, sortable: true },
  {
    key: "valor",
    header: "Valor estimado",
    getValue: (r) => r.valor,
    align: "right",
    sortable: true,
    render: (r) => (r.valor > 0 ? `R$ ${r.valor.toLocaleString("pt-BR")}` : "—"),
  },
];

function DashboardComposition() {
  const [empty, setEmpty] = useState(false);

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-background p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className={TYPOGRAPHY.cardTitle}>Composição A — Dashboard</p>
        <Button variant="ghost" size="sm" onClick={() => setEmpty((v) => !v)}>
          {empty ? "Ver com dados" : "Ver vazio"}
        </Button>
      </div>
      <PageHeader
        title="Visão geral"
        description="Resumo do mês, atualizado em tempo real."
        primaryAction={{ label: "Novo relatório", onClick: () => {} }}
        indicators={empty ? DASHBOARD_INDICATORS_EMPTY : DASHBOARD_INDICATORS}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-5 dark:shadow-none lg:col-span-2">
          <p className={cn(TYPOGRAPHY.cardTitle, "mb-1")}>Vendas nos últimos 6 meses</p>
          <p className={TYPOGRAPHY.caption}>Fechamentos por mês</p>
          {empty ? (
            <EmptyState compact title="Sem vendas no período" />
          ) : (
            <ChartContainer config={chartConfig} className="mt-3 h-56 w-full">
              <LineChart data={CHART_DATA} margin={{ left: 0, right: 8, top: 4 }}>
                <CartesianGrid vertical={false} strokeOpacity={0.15} />
                <XAxis dataKey="mes" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11 }} width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="linear"
                  dataKey="valor"
                  stroke="var(--color-valor)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartContainer>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5 dark:shadow-none">
          <p className={cn(TYPOGRAPHY.cardTitle, "mb-3")}>Prioridades comerciais</p>
          {empty ? (
            <EmptyState compact title="Nenhuma prioridade" />
          ) : (
            <ul className="space-y-2.5">
              {[
                {
                  label: "Renovar contrato HubData",
                  reason: "Contrato vence em 5 dias e ainda não há confirmação de renovação.",
                  tone: "warning" as const,
                  tag: "Urgente",
                },
                {
                  label: "Follow-up Jackery",
                  reason: "Cliente pediu retorno até hoje sobre a proposta de eletrônicos.",
                  tone: "info" as const,
                  tag: "Hoje",
                },
                {
                  label: "Enviar proposta Rodonaves",
                  reason: "Proposta pronta, só falta enviar por e-mail.",
                  tone: "success" as const,
                  tag: "Pronto",
                },
                {
                  label:
                    "Revisar contrato de renovação da Consultoria Internacional de Operações Logísticas e Distribuição Ltda",
                  reason:
                    "Cliente antigo, alto valor mensal — parado há 9 dias sem próxima ação definida, risco de perda por inatividade.",
                  tone: "danger" as const,
                  tag: "Parado há 9 dias",
                },
                // Caso de teste (§ rodada corretiva): nome e motivo longos —
                // não pode quebrar a estrutura da linha; label usa
                // `line-clamp-2` (nunca `truncate`) e o motivo completo só
                // aparece na tooltip, como complemento, nunca única fonte.
              ].map((item) => (
                <li key={item.label} className="flex items-start gap-2">
                  <Badge variant={item.tone} className="mt-0.5 shrink-0">
                    {item.tag}
                  </Badge>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={cn(TYPOGRAPHY.body, "line-clamp-2 cursor-default")}>
                          {item.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">{item.reason}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ListingComposition() {
  const [rows, setRows] = useState<"preenchida" | "vazia">("preenchida");
  const [query, setQuery] = useState("");

  return (
    <div className="space-y-6 rounded-2xl border border-border bg-background p-4 md:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className={TYPOGRAPHY.cardTitle}>Composição B — Listagem</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRows(rows === "vazia" ? "preenchida" : "vazia")}
        >
          {rows === "vazia" ? "Ver com dados" : "Ver vazio"}
        </Button>
      </div>
      <PageHeader
        title="Leads"
        description="Todos os leads em aberto no funil comercial."
        primaryAction={{ label: "Novo lead", onClick: () => {} }}
        secondaryActions={[{ label: "Exportar", onClick: () => {} }]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome ou empresa..."
            className="h-10 pl-9"
          />
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2.5 py-1 text-xs text-foreground">
          Status: Novo
          <X className="h-3 w-3" />
        </span>
        <button
          type="button"
          className="text-xs font-medium text-text-secondary underline-offset-2 hover:underline"
        >
          Limpar filtros
        </button>
      </div>
      <DataTable
        columns={leadColumns}
        rows={rows === "vazia" ? [] : LEADS}
        getStatus={(r) => ({
          label: LEAD_STATUS_LABEL[r.status],
          tone: LEAD_STATUS_TONE[r.status],
        })}
        actions={[
          { label: "Ver detalhes", onClick: () => {} },
          { label: "Descartar", onClick: () => {}, destructive: true },
        ]}
        emptyTitle="Nenhum lead encontrado"
        emptyDescription="Ajuste os filtros ou cadastre um novo lead."
      />
    </div>
  );
}

function DrawerFormComposition() {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-background p-4 md:p-6">
      <p className={TYPOGRAPHY.cardTitle}>Composição C — Formulário em drawer</p>
      <Button variant="primary" size="comfortable" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Novo lançamento
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
          <SheetHeader className="border-b border-border p-5 text-left">
            <SheetTitle>Novo lançamento</SheetTitle>
          </SheetHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
            {state === "error" && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Não foi possível salvar</AlertTitle>
                <AlertDescription>
                  Verifique os campos obrigatórios e tente novamente.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-4">
              <label className="block space-y-1.5">
                <span className={TYPOGRAPHY.label}>Descrição</span>
                <Input placeholder="Ex: Mensalidade HubData" className="h-10" />
              </label>
              <label className="block space-y-1.5">
                <span className={TYPOGRAPHY.label}>Categoria</span>
                <Select defaultValue="servicos">
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="servicos">Serviços</SelectItem>
                    <SelectItem value="produtos">Produtos</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="block space-y-1.5">
                <span className={TYPOGRAPHY.label}>Valor</span>
                <div className="flex h-10 items-center rounded-md border border-input bg-transparent focus-within:ring-2 focus-within:ring-brand">
                  <span className="px-3 text-sm text-text-secondary">R$</span>
                  <input
                    className="h-full flex-1 bg-transparent pr-3 text-sm outline-none"
                    placeholder="0,00"
                  />
                </div>
              </label>
            </div>
          </div>

          <SheetFooter className="border-t border-border p-5">
            <Button variant="ghost" size="comfortable" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              size="comfortable"
              isLoading={state === "loading"}
              onClick={() => {
                setState("loading");
                setTimeout(() => setState("error"), 700);
              }}
            >
              Salvar
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <p className={TYPOGRAPHY.caption}>
        Abra o drawer e clique em Salvar pra ver o estado de carregamento e, em seguida, o erro
        simulado. No mobile o drawer ocupa a tela inteira (`w-full`); no desktop fica lateral,
        limitado a `sm:max-w-md`.
      </p>
      <Button variant="ghost" size="sm" onClick={() => setState("idle")}>
        Resetar estado
      </Button>
    </div>
  );
}

/**
 * Três composições realistas (rodada corretiva §10) — mostram os
 * componentes canônicos (`PageHeader`, `MetricCard` via `PageHeader`,
 * `DataTable`, `EmptyState`, `ChartContainer`) funcionando juntos, como
 * telas finalizadas, não como catálogo isolado de peças. Conteúdo 100%
 * fictício, definido localmente — nada lê dado real da plataforma.
 */
export function CompositionsSection() {
  return (
    <section id="composicoes" className="space-y-6">
      <div>
        <h2 className={TYPOGRAPHY.sectionTitle}>Padrões de composição</h2>
        <p className={cn(TYPOGRAPHY.bodySecondary, "mt-1 max-w-2xl")}>
          Os componentes acima funcionando juntos, como telas reais — não isolados numa vitrine.
        </p>
      </div>
      <DashboardComposition />
      <ListingComposition />
      <DrawerFormComposition />
    </section>
  );
}
