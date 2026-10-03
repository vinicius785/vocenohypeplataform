# Início — referência específica

> **Não é regra obrigatória para outros módulos.** Descreve o que é próprio da página Início (dashboard pessoal). Os padrões reutilizáveis que dela se originaram estão em [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md). Dados brutos de engenharia reversa: [`technical/`](./technical/).

Arquivos: `src/components/InicioDashboard.tsx`, `src/components/inicio/*`, `src/components/shared/HomeHeaderShell.tsx`.

## 1. Estrutura da página

```
INÍCIO  (PageContainer standard, space-y-6 md:space-y-8)
├── Cabeçalho (bloco único, rounded-2xl)
│   ├── saudação + data  ·  clima  ·  "Personalizar"
│   └── faixa de 4 indicadores: Hoje · Amanhã · Próximos 7 dias · Atrasadas
├── Meu trabalho (2/3)  +  Agenda (1/3)
├── Mural de novidades (largura total)
├── Comentários atribuídos (2/3)  +  Lembretes (1/3)
├── Pausa rápida (largura total, só com jogos habilitados)
└── Financeiro  +  Comercial  (1/2 + 1/2, cada um só com permissão)
```

## 2. Cabeçalho do Início

- Identidade: avatar `h-14/16 rounded-full` + saudação (`text-2xl md:text-[26px] font-semibold tracking-tight`, "Bom dia/Boa tarde/Boa noite, {nome}") + data por extenso (`text-sm`, secundária).
- Clima: ícone + temperatura (`text-4xl`) + condição; some inteiro se indisponível; ambientação por canvas (`WeatherHeaderEffect`) restrita ao cabeçalho, respeitando `prefers-reduced-motion`; nunca exibe localização.
- "Personalizar início" (`ManageCardsMenu`): ligar/desligar cards, reordenar, restaurar padrão, ligar/desligar clima. Popover no desktop, folha inferior no mobile. Preferências em localStorage + servidor; cards de Financeiro/Comercial revalidados contra permissão.
- Faixa de indicadores: 4 células, `grid-cols-2` (mobile 2×2) / `md:grid-cols-4`, divisores `border-border/60`; número `text-xl font-semibold tabular-nums` com 2 dígitos; zero em cinza; "Atrasadas" em `text-danger` só se > 0; cada célula **filtra e rola até "Meu trabalho"**.

## 3. Blocos de conteúdo

| Bloco | Papel | Conteúdo | Ação | Vazio | Muitos dados |
|---|---|---|---|---|---|
| **Meu trabalho** | o que fazer agora | tarefas atribuídas: prioridade, título, status, projeto, prazo | abrir tarefa; abas pill Hoje/Atrasadas/Semana | "Nada por aqui. Bom trabalho." | 6 itens + "Ver todas (N)" expande inline |
| **Agenda** | o dia | reuniões de hoje; a próxima em destaque (`bg-brand-subtle border-brand/30`); passadas `opacity-50` | abrir resumo; "Ver tudo" → Reuniões | "Nenhuma reunião hoje." | lista simples |
| **Mural de novidades** | comunicação interna | artigo em destaque (capa + categoria + título) + anteriores | ler (Dialog `max-w-4xl`), dispensar | bloco não aparece | lista `divide-y` |
| **Comentários atribuídos** | quem me chamou | menções (autor, trecho, tempo); ponto `bg-brand` = não lido | abrir origem, dispensar, "Limpar todos" (confirmação) | estado vazio compacto | 3 itens + "Ver todos (N)" |
| **Lembretes** | pessoais/privados | título + vencimento; ponto `bg-danger` se vencido | concluir, criar, "Ver todos" | estado vazio com ação de criar | lista curta + vista completa |
| **Pausa rápida** | respiro entre tarefas | 2 mini-jogos (ZIP, Termo) | jogar | — | — |
| **Financeiro** | alerta de vencidos | "Vencido a receber" / "Vencido a pagar" (tiles de valor) | "Ir para Financeiro" | R$ 0 | — |
| **Comercial** | leads novos | nome, empresa, valor | "Ir para Comercial" | "Nenhum lead novo no momento." | lista limitada |

## 4. Regras próprias do dashboard (não generalizar)

1. KPI do cabeçalho filtra o card "Meu trabalho" (comportamento específico de dashboard).
2. Abas pill dentro do `CardHeader` filtram **conteúdo do card**, não navegam.
3. Listas longas expandem inline em vez de paginar ou rolar (limites 6 e 3).
4. Cards opcionais por permissão e por preferência pessoal.
5. Clima e saudação por horário (fuso America/Sao_Paulo) são exclusivos da home.
6. Dispensar (X) em Mural e Comentários é persistente por usuário.

## 5. Componentes exclusivos do Início

`HeaderIndicatorCell`, `Tab` (pill), `PriorityFlag`, `MuralNovidades`, `ManageCardsMenu`, `RemindersCard`, `ReminderFormDialog`, `RemindersFullView`, `QuickBreakCard`, `WeatherHeaderEffect`. (`Card`/`CardHeader` nasceram aqui mas são tratados como padrão reutilizável — ver `DESIGN-SYSTEM.md` §9 e `DECISIONS.md` C7.)
