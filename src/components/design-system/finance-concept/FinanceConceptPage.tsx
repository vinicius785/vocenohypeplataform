import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Area,
  ComposedChart,
  Line,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Wallet,
  Settings2,
  Moon,
  Sun,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import type { SectionKey, FinanceiroTab } from "@/lib/section-nav";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import { CASH_FLOW_SERIES, RESUMO_FIXTURE, type CashPoint } from "./fixture";

/**
 * ============================================================================
 * ANÁLISE DA REFERÊNCIA (registrada antes de implementar, per pedido) —
 * ============================================================================
 * Escala tipográfica: o "Good morning, Alex" ocupa ~40-44px, muito maior
 * que qualquer label da UI (~11-13px) — a distância entre o maior e o
 * menor texto é enorme, e é exatamente essa distância que cria hierarquia
 * (não bordas). "320 pts" no widget de recompensa é ~32px MESMO dentro de
 * um card pequeno flutuante — o valor nunca encolhe pra caber no card, o
 * card cresce/flutua pra caber o valor.
 * Proporção espaço-vazio/conteúdo: os cards têm MUITO padding interno
 * relativo ao texto — "Book a ride" ocupa uma fração pequena da pílula
 * verde enorme que o contém. Vazio é usado como respiro, não como erro.
 * Variação de tamanho: pelo menos 4 escalas coexistem na mesma tela — o
 * mapa (grande, dominante), o botão "Book a ride" (largo, baixo), os
 * widgets "Rewards"/"Safety status" (pequenos, flutuantes, sobrepostos
 * ao card principal) e os ícones de navegação inferior (mínimos, iguais
 * entre si — mas são AÇÕES, não conteúdo, por isso podem repetir escala).
 * Superfícies claras/escuras: o card principal (mapa) é escuro sobre um
 * fundo claro — não é "tema escuro" da tela inteira, é uma SUPERFÍCIE
 * escura específica pro conteúdo que precisa de contraste (rota no mapa).
 * Raios: muito generosos (~24-32px) em TODOS os cards, inclusive nos
 * pequenos — nunca um raio de 6-8px "de formulário".
 * Elementos sobrepostos: "Your Rewards" e "Safety status" não são cards
 * na grade — flutuam por cima do card principal, parcialmente fora dele,
 * como notificações. Isso é o que dá a sensação de profundidade, não
 * sombra pesada.
 * Contraste: preto/branco/verde-elétrico, sem tons intermediários
 * competindo — cada elemento sabe se é fundo, conteúdo ou destaque.
 * Papel da cor de destaque: o verde aparece só onde importa agir (botão
 * "Book a ride", rota no mapa, pontos de recompensa) — nunca como cor de
 * fundo geral nem em ícones neutros.
 * Distribuição assimétrica: nada está centralizado ou em grade uniforme —
 * o mapa é grande e irregular, os widgets flutuam em cantos diferentes,
 * a barra inferior de ações é a única fileira realmente simétrica (e são
 * ações de navegação, não conteúdo).
 *
 * TRADUÇÃO pra um produto desktop de gestão financeira: o "mapa" vira o
 * GRÁFICO DE FLUXO DE CAIXA (o elemento espacial/visual central); a
 * "foto da mão com o telefone" vira o BLOCO DE SALDO (protagonista,
 * grande, com o valor gigante); "Your Rewards"/"Safety status" (widgets
 * flutuantes pequenos) viram "Requer atenção" e os indicadores
 * secundários (entradas/saídas) — compactos, com peso visual bem menor
 * que o hero e o gráfico; o verde-elétrico vira `#6F95FF`, usado do
 * mesmo jeito parcimonioso (botão principal, linha do gráfico, valor
 * protagonista, indicador ativo) — nunca pintando a tela inteira.
 * ============================================================================
 */

function fmtBRL(n: number) {
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function DeltaTag({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold ${up ? "text-success" : "text-danger"}`}
    >
      {up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
      {up ? "+" : ""}
      {pct}% vs. mês anterior
    </span>
  );
}

function CashTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload as CashPoint;
  return (
    <div className="rounded-2xl border border-white/10 bg-[#12151c] px-4 py-3 text-sm shadow-xl dark:bg-[#12151c]">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-white/50">{label}</p>
      {row.entradaRealizada > 0 && (
        <p className="text-white/90">
          Entrada realizada <b className="text-success">{fmtBRL(row.entradaRealizada)}</b>
        </p>
      )}
      {row.entradaProjetada > 0 && (
        <p className="text-white/70">
          Entrada projetada <b className="text-success">{fmtBRL(row.entradaProjetada)}</b>
        </p>
      )}
      {row.saidaRealizada > 0 && (
        <p className="text-white/90">
          Saída realizada <b className="text-danger">{fmtBRL(row.saidaRealizada)}</b>
        </p>
      )}
      {row.saidaProjetada > 0 && (
        <p className="text-white/70">
          Saída projetada <b className="text-danger">{fmtBRL(row.saidaProjetada)}</b>
        </p>
      )}
    </div>
  );
}

export function FinanceConceptPage() {
  const navigate = useNavigate();
  const [theme, setThemeState] = useState<Theme>("light");
  useEffect(() => setThemeState(getTheme()), []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setThemeState(next);
    setTheme(next);
  };

  const [saldoConfigurado, setSaldoConfigurado] = useState(true);
  const [chartMode, setChartMode] = useState<"realizado" | "projetado">("realizado");
  const [period, setPeriod] = useState<"mes" | "anterior">("mes");

  const saldoVal = saldoConfigurado ? RESUMO_FIXTURE.saldoConfigurado.valor : null;

  const series = useMemo(
    () =>
      CASH_FLOW_SERIES.map((p) => ({
        ...p,
        saldoRealizado: p.entradaRealizada - p.saidaRealizada,
        saldoProjetado: p.entradaProjetada - p.saidaProjetada,
      })),
    [],
  );

  // Rota de avaliação isolada — nunca navega pra dentro do AppShell real
  // a não ser que a pessoa clique num item de fato (sidebar/subitem), o
  // que aqui só deixa o conceito e vai pra tela real (comportamento
  // esperado: "a navegação do Financeiro continua só na sidebar").
  const onSelect = (key: SectionKey) => {
    if (key === "financeiro") return; // já estamos "em" Financeiro (Resumo) — não navega
    void navigate({ to: "/time", search: { section: key } });
  };
  const onSelectSubTab = (_section: SectionKey, subKey: string) => {
    void navigate({
      to: "/time",
      search: { section: "financeiro", financeiroTab: subKey as FinanceiroTab },
    });
  };

  return (
    <AppShell
      active="financeiro"
      onSelect={onSelect}
      activeSubTab="resumo"
      onSelectSubTab={onSelectSubTab}
    >
      {/* Canvas claro experimental (escopado a este conceito): o token
       * global `--background` é branco puro e igual a `--card`, então no
       * claro os cards não se distinguiam do fundo (requisito explícito
       * do brief: "muito claro" no fundo, branco nas superfícies,
       * contraste estrutural equivalente ao escuro). Reaproveita
       * `--muted` (já existente, oklch 0.968 — cinza bem claro) como
       * canvas em vez de inventar um token novo. No escuro, `--background`
       * (0.145) já é distinto de `--card` (0.205), então não precisa de
       * ajuste — só neutraliza no escuro (`dark:bg-transparent`). */}
      <div className="-m-4 min-h-full bg-muted p-4 dark:bg-transparent md:-m-8 md:p-8">
        <div className="mx-auto w-full max-w-[1400px] space-y-6 pb-10">
          {/* Cabeçalho — eyebrow discreto identifica o conceito sem virar banner */}
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-secondary">
                Setembro 2026 · Conceito visual — não está em produção
              </p>
              <h1 className="mt-1 text-[38px] font-bold leading-[1.05] tracking-tight text-foreground md:text-[44px]">
                Resumo financeiro
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-full border border-border bg-card p-1">
                {(["mes", "anterior"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      period === p
                        ? "bg-foreground text-background"
                        : "text-text-secondary hover:text-foreground"
                    }`}
                  >
                    {p === "mes" ? "Este mês" : "Mês passado"}
                  </button>
                ))}
              </div>
              <button
                onClick={toggleTheme}
                aria-label="Alternar tema"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
            </div>
          </header>

          {/* ============ BENTO — linha 1: hero + atenção/entradas/saídas ============ */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* HERO — bloco protagonista */}
            <div className="lg:col-span-7">
              <div className="relative h-full overflow-hidden rounded-[28px] bg-card p-7 dark:shadow-none md:p-9">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-subtle px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand">
                    <Wallet className="h-3.5 w-3.5" /> Saldo atual
                  </span>
                  <button
                    onClick={() => setSaldoConfigurado((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                    Configurar saldo
                  </button>
                </div>

                {saldoVal != null ? (
                  <>
                    <p className="mt-6 text-[64px] font-bold leading-none tracking-tight text-foreground md:text-[72px]">
                      {fmtBRL(saldoVal)}
                    </p>
                    <p className="mt-3 text-sm text-text-secondary">
                      {RESUMO_FIXTURE.saldoConfigurado.contexto}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="mt-6 text-[52px] font-bold leading-none tracking-tight text-text-secondary md:text-[60px]">
                      —
                    </p>
                    <p className="mt-3 text-sm text-text-secondary">
                      Saldo não configurado — informe o saldo inicial pra ver a posição de caixa em
                      tempo real.
                    </p>
                  </>
                )}

                <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Resultado do período
                    </p>
                    <p
                      className={`mt-1 text-[28px] font-bold tabular-nums leading-none ${
                        RESUMO_FIXTURE.resultadoRealizado >= 0 ? "text-success" : "text-danger"
                      }`}
                    >
                      +{fmtBRL(RESUMO_FIXTURE.resultadoRealizado)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      Projetado · {RESUMO_FIXTURE.horizonteProjecao}
                    </p>
                    <p className="mt-1 text-[28px] font-bold tabular-nums leading-none text-brand">
                      {fmtBRL(RESUMO_FIXTURE.saldoProjetado)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Coluna direita: Requer atenção + Entradas/Saídas */}
            <div className="flex flex-col gap-5 lg:col-span-5">
              <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
                <p className="text-[15px] font-semibold text-foreground">Requer atenção</p>
                <div className="mt-3 space-y-2">
                  {RESUMO_FIXTURE.requerAtencao.map((item) => (
                    <div
                      key={item.titulo}
                      className="flex items-center gap-3 rounded-2xl bg-muted/60 p-3"
                    >
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          item.tipo === "receber"
                            ? "bg-success-soft text-success"
                            : "bg-warning-soft text-warning"
                        }`}
                      >
                        {item.tipo === "receber" ? (
                          <ArrowUpRight className="h-4 w-4" />
                        ) : (
                          <AlertTriangle className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.titulo}
                        </p>
                        <p className="flex items-center gap-1 text-xs text-text-secondary">
                          <Clock className="h-3 w-3" /> {item.prazo}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                        {fmtBRL(item.valor)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-5">
                <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success-soft text-success">
                    <ArrowUpRight className="h-4 w-4" />
                  </span>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Entradas
                  </p>
                  <p className="mt-1 whitespace-nowrap text-[30px] font-bold tabular-nums leading-none text-foreground">
                    {fmtBRL(RESUMO_FIXTURE.entradasRealizadas)}
                  </p>
                  <div className="mt-2">
                    <DeltaTag pct={RESUMO_FIXTURE.entradasDeltaPct} />
                  </div>
                </div>
                <div className="rounded-[24px] bg-card p-5 dark:shadow-none">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-danger-soft text-danger">
                    <ArrowDownRight className="h-4 w-4" />
                  </span>
                  <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">
                    Saídas
                  </p>
                  <p className="mt-1 whitespace-nowrap text-[30px] font-bold tabular-nums leading-none text-foreground">
                    {fmtBRL(RESUMO_FIXTURE.saidasRealizadas)}
                  </p>
                  <div className="mt-2">
                    <DeltaTag pct={RESUMO_FIXTURE.saidasDeltaPct} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ============ BENTO — linha 2: fluxo de caixa + receber/pagar ============ */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <div className="rounded-[28px] bg-card p-6 dark:shadow-none md:p-7">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[20px] font-semibold text-foreground md:text-[22px]">
                      Fluxo de caixa
                    </p>
                    <p className="text-sm text-text-secondary">
                      Realizado (linha sólida) e projetado (linha tracejada) —{" "}
                      {period === "mes" ? "este mês" : "mês passado"}.
                    </p>
                  </div>
                  <div className="inline-flex rounded-full border border-border bg-background p-1">
                    {(["realizado", "projetado"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setChartMode(m)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium capitalize transition-colors ${
                          chartMode === m
                            ? "bg-brand text-brand-foreground"
                            : "text-text-secondary hover:text-foreground"
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 h-64 md:h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={series} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="fc-fill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} />
                          <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.5} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
                        axisLine={false}
                        tickLine={false}
                        width={44}
                        tickFormatter={(v: number) => `${Math.round(v / 1000)}k`}
                      />
                      <RTooltip
                        content={<CashTooltip />}
                        cursor={{ stroke: "var(--brand)", strokeOpacity: 0.3 }}
                      />
                      <Area
                        type="monotone"
                        dataKey={chartMode === "realizado" ? "saldoRealizado" : "saldoProjetado"}
                        stroke="none"
                        fill="url(#fc-fill)"
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey={chartMode === "realizado" ? "saldoRealizado" : "saldoProjetado"}
                        stroke="var(--brand)"
                        strokeWidth={3}
                        strokeDasharray={chartMode === "projetado" ? "6 5" : undefined}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-5 lg:col-span-4">
              <ReceivableCard
                label="A receber"
                tone="success"
                total={RESUMO_FIXTURE.aReceber.total}
                quantidade={RESUMO_FIXTURE.aReceber.quantidade}
                proximo={RESUMO_FIXTURE.aReceber.proximoVencimento}
                onVerTodos={() => onSelectSubTab("financeiro", "a-receber")}
              />
              <ReceivableCard
                label="A pagar"
                tone="warning"
                total={RESUMO_FIXTURE.aPagar.total}
                quantidade={RESUMO_FIXTURE.aPagar.quantidade}
                proximo={RESUMO_FIXTURE.aPagar.proximoVencimento}
                onVerTodos={() => onSelectSubTab("financeiro", "a-pagar")}
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function ReceivableCard({
  label,
  tone,
  total,
  quantidade,
  proximo,
  onVerTodos,
}: {
  label: string;
  tone: "success" | "warning";
  total: number;
  quantidade: number;
  proximo: string;
  onVerTodos: () => void;
}) {
  return (
    <div className="rounded-[22px] bg-card p-5 dark:shadow-none">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{label}</p>
        <span
          className={`h-2 w-2 rounded-full ${tone === "success" ? "bg-success" : "bg-warning"}`}
        />
      </div>
      <p className="mt-1.5 whitespace-nowrap text-[26px] font-bold tabular-nums leading-none text-foreground">
        {fmtBRL(total)}
      </p>
      <p className="mt-1.5 text-xs text-text-secondary">
        {quantidade} lançamento{quantidade === 1 ? "" : "s"} · próximo {proximo}
      </p>
      <button
        onClick={onVerTodos}
        className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Ver todos <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
