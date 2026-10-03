# Design System da Plataforma

> **Contrato operacional.** Consulte, aplique, audite. Só regras; evidências estão em [`AUDIT-FINDINGS.md`](./AUDIT-FINDINGS.md), motivos em [`DECISIONS.md`](./DECISIONS.md).
> `PRECISA DE DECISÃO → P#` marca o que ainda depende de intervenção humana (4 itens, em `DECISIONS.md`). Tudo o mais está fechado.
> Específico da home: [`INICIO-REFERENCE.md`](./INICIO-REFERENCE.md).

## 1. Princípios

**Visual.** Hierarquia por tipografia e espaço, não por cor. Cor só para ação, seleção e estado. Superfícies planas (sem sombra). Densidade alta e ritmo constante. O Início é a origem da linguagem, não o molde: saudação, clima e blocos de dashboard não são padrão.

**Arquitetura de UX (valem tanto quanto o visual).**
1. **Página única por contexto.** O conteúdo de um mesmo contexto vive numa página, com hierarquia clara e, quando há ≥3 seções, navegação por âncora. Nunca página → aba → subaba → filtro → modal para uma única tarefa.
2. **Abas só para visões diferentes da mesma tarefa**, nunca para esconder conteúdo.
3. **Contexto uma vez.** Período, mês, cliente, projeto ou outro escopo global é definido num único lugar da página (abaixo do cabeçalho) e não se repete dentro de filtros.
4. **Filtros: um só mecanismo** — Busca + botão "Filtros" + filtros ativos (chips) + ordenação. Sem barra por dimensão e sem filtro dentro de filtro.
5. **Ação perto do que modifica.** Uma ação primária por contexto; destrutivas atrás de menu e de confirmação.
6. **Um fluxo de rolagem.** Rola a página. Scroll interno só em tabelas, listas muito extensas e áreas de trabalho (Kanban, chat, editor). Nunca scroll dentro de scroll.
7. **Mesma função, mesmo componente.** Dois módulos com KPI, filtro, cabeçalho, estado ou lista usam o mesmo padrão.

## 2. App Shell

| Parte | Regra |
|---|---|
| Shell | Altura da viewport; a página não rola, só o Main |
| Sidebar | 256px (recolhida 68px) a partir de `md`; drawer + backdrop abaixo. Navegação **global** (Geral · Operação · Gestão · Comunicação; rodapé Configurações e Problemas). Funcionalidade interna de módulo nunca vira item |
| Item de navegação | 36px, `rounded-md`, `text-sm`; ativo: fundo `muted` + barra `brand`; sem permissão: esmaecido + cadeado |
| Topbar | 64px: menu, busca global e, à direita, timer ativo, tema, notificações. Sem título e sem breadcrumb |
| Main | Única fonte de padding de página: `p-4` → `md:p-8` |
| PageContainer | 1280px padrão · 1600px largo (Kanban/tabelas) · total (Chat); só centraliza |

## 3. Arquitetura de página

**Página de módulo (1º nível), nesta ordem:**
1. **Cabeçalho** (`PageHeader`): título + descrição à esquerda; ação primária (e secundárias) à direita.
2. **Contexto** global da página (período, mês…), uma vez.
3. **KPIs**, só se decidem algo (ver §8.3).
4. **Busca + Filtros** (listagens).
5. **Conteúdo** (cards/lista/tabela).

**Página de detalhe:** link de retorno · identidade (título + contexto) · KPIs curtos · seções **na mesma página** com navegação por âncora fixa no topo.

**Espaçamento:** entre blocos 24px → 32px (`md`); entre cards 16px → 24px (`md`).

## 4. Tipografia

Família: **pilha do sistema** (`font-sans`); `font-mono` somente para código, identificadores e valores técnicos. Nenhuma fonte é carregada.

| Nível | Regra | Cor |
|---|---|---|
| **Page title** | `text-2xl md:text-[26px] font-semibold tracking-tight` | `foreground` |
| **Título de dialog/drawer; empty state grande** | `text-xl md:text-2xl font-semibold tracking-tight` | `foreground` |
| **Section / Card title** | `text-[15px] font-semibold` | `foreground` |
| **Body** | `text-sm`, 400–500; texto corrido `text-sm md:text-base leading-relaxed` | `foreground` |
| **Secondary** | `text-sm` / `text-xs` | `text-secondary` |
| **Metadata** | `text-[11px]` | `text-secondary` |
| **Label de campo** | `text-sm font-medium` | `foreground` |
| **Label em caixa-alta** (cabeçalho de coluna, KPI) | `text-[11px] font-medium uppercase tracking-wide` | `text-secondary` |
| **KPI** | valor `text-lg sm:text-xl md:text-2xl font-semibold tabular-nums` (nunca truncado: valor monetário não pode ficar cortado); **lead** `text-3xl md:text-4xl font-bold tabular-nums` | `foreground` |
| **Button** | `text-sm font-medium` (`sm`: `text-xs`) | |

Tamanhos permitidos: 11 · 12 · 14 · 15 (só título de card/seção) · 16 (input no mobile) · 18 · 20 · 24 · 26 (só page title) · 30/36 (só KPI lead). **Proibidos:** `text-[9px]`, `text-[10px]` (exceto micro-rótulo caixa-alta dentro de faixa de KPI compacta), `text-[13px]` e qualquer outro tamanho arbitrário.
Pesos: 600 títulos e valores · 500 rótulos e itens · 400 corpo · 700 só KPI lead. `font-light` e `font-bold` fora desses casos são proibidos.
Line-height: padrão do tamanho; `leading-relaxed` só em texto corrido; `leading-tight` em números ≥ `text-3xl`.
Números alinhados usam `tabular-nums`. Texto truncado leva `title`.
Elemento de título: tokens tipográficos; quando não é `h1–h4`, leva `role="heading"` + `aria-level`; `h1–h4` herdam peso 600.

## 5. Cores

Sempre token semântico, nunca paleta direta (`amber-500`, `emerald-500`…).

| Papel | Token |
|---|---|
| Página | `background` |
| Surface (card) | `card` |
| Texto principal | `foreground` |
| **Texto secundário** | **`text-secondary`**. `muted-foreground` só para ícone e elemento decorativo — **nunca** para texto, **nunca** com opacidade em texto |
| Borda | `border` (campos: `input`); `/60` card, `/70` divisor de lista |
| Neutro de interação | `muted` |
| Ação / seleção | `brand`, `brand-hover`, `brand-subtle`, `brand-foreground` |
| Feedback | `success`, `warning`, `danger`, `info` (+ `-soft`, `-soft-foreground`, `-border`); destrutivo `destructive` |
| Foco | `ring` |

Texto em `brand` sobre fundo claro: `PRECISA DE DECISÃO → P2`.

**Estado → cor (por significado).** Todo status declara uma destas categorias:

| Categoria | Token | Significa |
|---|---|---|
| Neutro | `muted` | não iniciado, aberto, rascunho, arquivado, cancelado; **aguardando terceiro** (sem ação do usuário) |
| Em andamento | `info` | em execução ativa |
| Atenção | `warning` | exige ação ou retrabalho em breve (ajustes, bloqueio, vence hoje, em atenção) |
| Risco | `danger` | atrasado, vencido, recusado, em risco |
| Positivo | `success` | aprovado, publicado, concluído |

Mapeamento fechado dos vocabulários principais:

| Vocabulário | Neutro | Em andamento | Atenção | Risco | Positivo |
|---|---|---|---|---|---|
| Tarefa | Aberto · Em aprovação · Arquivado | Em andamento | Em ajustes · Bloqueada | — | Aprovado · Concluído |
| Entrega | Roteiro em produção · Roteiro em aprovação · Conteúdo em aprovação | Produção · Publicação | Ajustes (roteiro/conteúdo) | — | Publicada |
| Perfil de influenciador | Inscrito · Enviado ao cliente | Em curadoria | — | Recusado | Aprovado |
| Saúde (indicador/objetivo) | Não iniciado · Cancelado | — | Atenção | Em risco · Atrasado | Saudável* · Concluído |
| Prazo | Sem prazo · No prazo · Pausado | — | Vence hoje · Concluída com atraso | Atrasada | Concluída no prazo |
| Prioridade (ícone/texto, sem fundo) | Normal · Baixa | — | Alta | Urgente | — |

\* "Saudável" é o estado normal: não ganha rótulo nem badge.
Outros vocabulários (oportunidade, campanha de e-mail, reunião, score, financeiro) aplicam as mesmas categorias, declaradas por módulo. Etapas de pipeline com muitas etapas: `PRECISA DE DECISÃO → P4`.
Cor nunca é o único canal: o status sempre traz texto e, quando cabe, ícone.

## 6. Layout e espaçamento

Escala: múltiplos de 4px. Degraus: `0.5 · 1 · 1.5 · 2 · 2.5 · 3 · 3.5 · 4 · 5 · 6 · 8`.

| Uso | Valor |
|---|---|
| Padding de página | `p-4` → `md:p-8` |
| Entre blocos | `space-y-6` → `md:space-y-8` |
| Grid de cards | 1 coluna → `lg`: 2/3 + 1/3 ou 1/2 + 1/2 |
| Gutter | `gap-4` → `md:gap-6` |
| Cabeçalho de card | `px-4 py-3.5` (`md:px-5`) |
| Linha de lista | `px-4 py-2.5` (`md:px-5`) |
| Corpo de card | `p-3`–`p-4` |
| Ícone ↔ texto | `gap-2` (`gap-1`/`gap-1.5` em pequenos) |
| Entre controles | `gap-2`–`gap-3` |
| Rótulo ↔ valor | `mt-0.5` |

Breakpoints: `sm 640 · md 768 · lg 1024 · xl 1280`; `md` separa mobile de desktop.

## 7. Superfícies e radius

| Superfície | Regra |
|---|---|
| **Página** | `background`. **Sem canvas cinza** |
| **Card** | superfície elevada neutra: `card` + borda `/60` (escuro: fundo mais escuro e sem borda), **`rounded-2xl`**, **sem sombra** |
| Input | `h-9`, `rounded-md`, borda `input`, `text-sm`, foco em anel |
| Popover / Dropdown | `popover`, `rounded-md`, borda, `shadow-md`; limita a altura à viewport |
| Modal | centralizado, ≤ viewport; tela cheia no mobile quando denso; `rounded-2xl` |
| Drawer | `sm:max-w-md`–`xl`; cabeçalho `px-6 py-5` + borda; rodapé fixo `px-6 py-4` + borda |
| Sombra | só em camadas flutuantes |

Radius: controle `rounded-md` · linha/tile interno `rounded-lg` · card e overlay `rounded-2xl` · pill `rounded-full`. Valores arbitrários (`[20px]`, `[22px]`, `[24px]`, `[28px]`) são proibidos.

## 8. Componentes oficiais

### 8.1 PageHeader
**Usar:** título de página de 1º nível. **Não usar:** dentro de card ou seção. **Estrutura:** título (§4) + descrição `text-sm text-secondary mt-1.5` | ações (`Button size="comfortable"`, uma `primary`). Busca/filtros/indicadores **não** ficam no cabeçalho. **Estados:** ação sem permissão some. **A11y:** título com `role="heading" aria-level={1}`. A home usa o bloco de identidade (`INICIO-REFERENCE.md`).

### 8.2 Card / CardHeader
**Usar:** bloco de conteúdo com título. **Não usar:** envolver um único campo; card dentro de card. **Estrutura:** `CardHeader` (ícone `h-4 w-4` secundário + título de card + ação opcional que pode quebrar de linha) → corpo (lista `divide-y`, grade de tiles ou EmptyState) → rodapé-link opcional (`border-t`, `text-xs font-medium text-brand`). **Variantes:** nenhuma de elevação. **Comportamento:** o card não é clicável; a interação fica nas linhas.

### 8.3 KPI
**Usar:** número que muda uma decisão. **Não usar:** contagem decorativa; estado normal ("saudável") como destaque; mais de 5 números por bloco.
**Átomo:** rótulo caixa-alta + valor + complemento opcional (`text-[11px] text-secondary`).
**Variantes (mesmo componente):**
- **Strip** — 2–5 células iguais, separadas por divisor, no padrão de card; valor `text-xl md:text-2xl`. Para vários números de mesmo peso.
- **Lead** — 1 número dominante (`text-3xl md:text-4xl`) + até 3 de apoio em linha, sem card. Para quando um número responde a página (saldo, progresso médio).
**Posição:** logo abaixo do cabeçalho/contexto, antes do conteúdo. Nunca no cabeçalho.
**Zero:** continua visível, em tom esmaecido de texto (nunca omitido). **Atenção/erro:** `danger` só quando há valor real (> 0); sem alvo de atenção, tom neutro.
**Clicável** apenas se aplica filtro ou rola na mesma página.

### 8.4 Search
Campo `h-9` com ícone, placeholder dizendo onde busca; sempre visível, nunca dentro de "Filtros".

### 8.5 Filtros
**Estrutura:** `[Search] [Filtros ▾ (contador)] [Ordenar]` → linha de chips dos filtros ativos (removíveis, neutros) + "Limpar filtros". **Dentro do popover:** dimensões em campos (status, cliente, categoria…), aplicação imediata, sem botão "Aplicar". **Fora do popover:** o contexto global (período). **Tipo de dado** (ex.: Entradas/Saídas), quando é a divisão primária da lista, é um SegmentedControl acima da busca, não um filtro. **Não usar:** barra por dimensão; filtro aninhado.

### 8.6 SegmentedControl
**Usar:** alternar visões ou divisões primárias de uma **mesma** tarefa na página (2–5 opções), inclusive no cabeçalho de card (`size="sm"`). **Não usar:** para navegar entre contextos diferentes; para esconder conteúdo do mesmo contexto. **Estados:** ativo `background` + sombra leve; `role="radio"`/`aria-checked`. Rola dentro do próprio container se não couber.

### 8.7 Tabs
**Usar:** painéis distintos **dentro de overlay** (dialog/drawer) quando a tarefa tem etapas paralelas. **Não usar:** como navegação de página. Seções de página de detalhe usam âncoras fixas no topo.

### 8.8 Badge
`secondary`/`outline` neutros; semânticos suaves (`success`, `warning`, `danger`, `info`, `brand`) com fundo suave e texto do mesmo tom, nunca sólidos. Um selo por informação; não repetir o que o texto já diz. Status seguem §5.

### 8.9 EmptyState
Props: `icon`, `title`, `description?`, `primaryAction?`, `secondaryAction?`, `compact`. Compacto em card: `px-4 py-6`, ícone circular `h-10 w-10`, título `text-sm font-medium`. Diz **o que** está vazio e, quando houver, **o que fazer**.

### 8.10 Modal (Dialog) e confirmação
**Usar:** formulário curto, leitura, confirmação. **Não usar:** para navegação nem tarefas longas (use Drawer ou página). **Confirmação** é sempre o componente de confirmação: título "Excluir X?", mensagem do que se perde, botão "Excluir X" destrutivo; nunca confirmação nativa do navegador.

### 8.11 Drawer (Sheet)
**Usar:** criar/editar com 3+ campos, painéis de detalhe. Largura `sm:max-w-md`–`xl`; título + descrição; rodapé fixo com **Cancelar** e a ação primária; fechar com Esc; alterações não salvas pedem confirmação. Criação com o mínimo; detalhes opcionais recolhidos.

### 8.12 Select
`PRECISA DE DECISÃO → P1`. Até lá, não criar um terceiro estilo.

### 8.13 Table
**Usar:** dados comparáveis em colunas. **Estrutura:** primitivos de tabela do sistema (nunca `<table>` cru); cabeçalho em label caixa-alta; células `text-sm`/`text-xs`; ações por linha em menu; ordenação/seleção/paginação via o componente de tabela quando necessárias. **Scroll:** horizontal **dentro** do container da tabela. Comportamento no mobile: `PRECISA DE DECISÃO → P3`. **Lista** (não tabela) quando há uma coluna dominante: linha clicável com `divide-y`.

### 8.14 Alert
Mensagem persistente no fluxo: componente `Alert` (`default`, `destructive`, `success`, `warning`, `info`), `role="alert"`, tom semântico suave, ícone + texto. Feedback transitório de uma ação: toast.

### 8.15 Loading / Error
| Situação | Padrão |
|---|---|
| Página/seção com layout conhecido | Skeleton no formato do conteúdo |
| Página/seção sem forma definida | Spinner centralizado |
| Ação do usuário | Botão em carregamento (desabilitado) |
| Carga pequena inline | Spinner pequeno ao lado do rótulo |
| Erro de seção/card | `Alert variant="destructive"` dentro do bloco, com mensagem objetiva |
| Erro de ação | Toast de erro (ou Alert no formulário) |
| Dado opcional que falha | Omite o bloco; não bloqueia a página |

## 9. Estados

| Estado | Padrão |
|---|---|
| Hover | linha: fundo `muted` suave; navegação `muted/60`; botão por variante; ação de cabeçalho → `foreground`; de rodapé → sublinhado |
| Active / selected | `brand-subtle` + `brand` (pill/segmento) ou `muted` (navegação); destaque de item: borda `brand/30` + `brand-subtle` |
| Focus | anel `ring` 2px (campos 1px); linhas clicáveis com anel interno |
| Disabled | opacidade 50% + cursor bloqueado; sem permissão: esmaecido + cadeado |
| Loading / Empty / Error | §8.15 e §8.9 |
| Success | toast ou mudança otimista do item; sem banner persistente |
| Warning | texto/ponto semântico ligado a dado real; nunca decorativo |

## 10. Responsividade

1. Mobile-first: grids de 1 coluna → `lg`. Sidebar em drawer abaixo de `md`.
2. Informação secundária de linha some em vez de quebrar a linha.
3. Barras de controle fazem `flex-wrap`; segmentos largos rolam dentro do container.
4. Diálogos densos viram tela cheia; popovers limitam a altura à viewport.
5. A página nunca tem scroll horizontal; só tabelas largas rolam, dentro do próprio container.
6. Ação do cabeçalho de card pode quebrar de linha; ação primária de página permanece visível.

## 11. Acessibilidade

1. Botão só de ícone tem nome acessível. 2. Foco visível em todo controle. 3. Linha/card clicável: `role="button"`, `tabIndex={0}`, Enter e Espaço. 4. Navegação ativa com `aria-current`; segmentos com `role="radio"`; títulos não-`h*` com `role="heading"`. 5. Overlays prendem o foco e fecham com Esc; com o drawer da sidebar aberto, o resto fica `inert`. 6. Erros com `role="alert"`; estados dinâmicos com `aria-live="polite"`. 7. `prefers-reduced-motion` respeitado. 8. Cor nunca é o único canal. 9. Alvo de toque 44px nas ações principais.
**Contraste:** texto de corpo ≥ 4.5:1 sobre sua superfície nos dois temas. `text-secondary` atende; `muted-foreground` e texto com opacidade **não** atendem em todas as superfícies claras — por isso não são tokens de texto (§5).

---

# Regra para auditoria da plataforma

Toda tela/módulo é comparado **contra este documento**. Para cada item, a pergunta é "qual regra daqui esta tela deveria seguir?". Itens `PRECISA DE DECISÃO` usam o padrão vigente e registram o desvio até a decisão.

Ordem: **1 Arquitetura** (shell, página única, profundidade) · **2 Layout** · **3 Tipografia** · **4 Espaçamento** · **5 Cores** (tokens, estado→cor) · **6 Superfícies** · **7 Componentes** (reutiliza §8; não reimplementa) · **8 Estados** · **9 Responsividade** · **10 Acessibilidade** · **11 Consistência com os demais módulos**.

A auditoria **não copia a página Início**: aplica este Design System. O que é específico do Início não é critério para outros módulos.
