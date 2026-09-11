/**
 * Fixture isolada do conceito visual do Resumo Financeiro — mesmos
 * FORMATOS e ordens de grandeza da tela real (ver `VisaoGeralTab.tsx`/
 * `PosicaoFinanceira.tsx`), mas dados fictícios, sem nenhuma leitura de
 * `@/lib/financeiro-entries` ou de qualquer store real. Nenhum botão
 * aqui aciona `createManualEntry`/`saveSaldoInicial`/etc — troca de
 * estado é só local (`useState` na página), nunca mutation real.
 */

export type CashPoint = {
  label: string;
  entradaRealizada: number;
  saidaRealizada: number;
  entradaProjetada: number;
  saidaProjetada: number;
};

export const CASH_FLOW_SERIES: CashPoint[] = [
  {
    label: "01 set",
    entradaRealizada: 4200,
    saidaRealizada: 1800,
    entradaProjetada: 0,
    saidaProjetada: 0,
  },
  {
    label: "05 set",
    entradaRealizada: 0,
    saidaRealizada: 3200,
    entradaProjetada: 0,
    saidaProjetada: 0,
  },
  {
    label: "09 set",
    entradaRealizada: 12500,
    saidaRealizada: 0,
    entradaProjetada: 0,
    saidaProjetada: 0,
  },
  {
    label: "13 set",
    entradaRealizada: 0,
    saidaRealizada: 2100,
    entradaProjetada: 0,
    saidaProjetada: 0,
  },
  {
    label: "17 set",
    entradaRealizada: 0,
    saidaRealizada: 0,
    entradaProjetada: 8300,
    saidaProjetada: 1340,
  },
  {
    label: "21 set",
    entradaRealizada: 0,
    saidaRealizada: 0,
    entradaProjetada: 5100,
    saidaProjetada: 2500,
  },
  {
    label: "25 set",
    entradaRealizada: 0,
    saidaRealizada: 0,
    entradaProjetada: 28500,
    saidaProjetada: 5000,
  },
  {
    label: "30 set",
    entradaRealizada: 0,
    saidaRealizada: 0,
    entradaProjetada: 0,
    saidaProjetada: 700,
  },
];

export const RESUMO_FIXTURE = {
  periodoLabel: "Setembro de 2026",
  entradasRealizadas: 16700,
  entradasDeltaPct: 12,
  saidasRealizadas: 7100,
  saidasDeltaPct: -8,
  resultadoRealizado: 9600,
  saldoConfigurado: {
    valor: 42380,
    contexto: "Hoje, considerando tudo recebido e pago",
  },
  saldoProjetado: 68840,
  horizonteProjecao: "Até o fim do mês",
  aReceber: {
    total: 28500,
    quantidade: 1,
    proximoVencimento: "14/09",
  },
  aPagar: {
    total: 10840,
    quantidade: 6,
    proximoVencimento: "15/09",
  },
  requerAtencao: [
    {
      tipo: "receber" as const,
      titulo: "PoupaTempo RJ",
      prazo: "vence em 5 dias",
      valor: 28500,
    },
    {
      tipo: "pagar" as const,
      titulo: "2 pagamentos a influenciadores",
      prazo: "vencem nos próximos 7 dias",
      valor: 5100,
    },
  ],
};
