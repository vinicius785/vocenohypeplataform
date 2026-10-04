# Auditoria técnica e otimização — Plataforma VNH

Data: 2026-09-18 (sessão única). Escopo real executado vs. o pedido original
(seções 1-22): o pedido pedia uma auditoria completa de TODA a plataforma
(autenticação, 18 módulos de produto, backend, banco, jobs). Dado o tamanho
real do código-fonte (**133.109 linhas** em `src/`, arquivos individuais de
até 6.653 linhas), uma revisão manual linha-a-linha de cada módulo não é
algo que se possa fazer com segurança numa única sessão sem risco real de
quebrar alguma coisa por pressa. Este relatório documenta o que foi **de
fato executado e verificado** nesta rodada, e separa claramente o que fica
para revisão humana — exatamente como pedido na seção 21 ("não remover
código apenas pelo nome", "confirmar uso com busca global").

## 1. Estado inicial (baseline)

- Gerenciador de pacotes: **bun** (`bun.lock`, `bunfig.toml`).
- Scripts existentes antes desta rodada: `dev`, `build`, `build:dev`,
  `preview`, `lint`, `format`, `test`, `release`. **Não existia** script
  `typecheck` nem `lint:fix` — adicionados nesta rodada.
- `git status` no início: só uma alteração pendente de uma tarefa anterior
  (`src/lib/financeiro-entries.ts`, correção de pagamentos de influenciador
  não aparecendo no Financeiro) — preservada integralmente, incluída nesta
  entrega.
- `bunx tsc --noEmit`: **limpo** (0 erros) já no início.
- `bun run test`: 280 testes, 1 falha — **pré-existente, não relacionada a
  nada desta auditoria** (ver seção 3).
- `bun run build`: passava, ~3.8s, saída via Vercel adapter
  (`.vercel/output/`, gitignored).
- **`bun run lint` no repositório inteiro estava efetivamente quebrado**:
  travava ou terminava com `ENOENT` ao tentar analisar arquivos dentro de
  `.vercel/output/` (artefato de build, não ignorado pela config do
  ESLint) — nunca tinha rodado até o fim. Isso explica por que o projeto
  acumulou **2.235 violações de formatação (`prettier/prettier`)** sem
  ninguém perceber: o lint nunca chegou a rodar sobre o repo todo pra
  reportar isso.

## 2. Mapa da arquitetura (resumo)

- **Roteamento**: TanStack Start baseado em arquivo (`src/routes/`), a
  maior parte do app é uma SPA client-side dentro de
  `_authenticated/time.tsx` (seções trocadas por `?section=`), com
  `_authenticated/projeto.$id.tsx` como única rota aninhada de verdade.
  Rotas públicas: `/`, `/inscricao/$token`, `/portal/$token`,
  `/api/public/leads`, `/api/cron/*`.
- **Backend**: server functions (`*.functions.ts`, TanStack Start),
  `client.server.ts` (service-role) só importado dinamicamente ou em
  arquivos `*.server.ts`. Sem Edge Functions Supabase; agendamento via
  Vercel Cron (`vercel.json`, 3 rotas do Hypito + `email-flows`).
- **Banco**: `supabase/migrations/*.sql`, aditivas, JSONB por linha
  (`data jsonb`) em quase toda tabela de domínio — **nenhuma migration foi
  tocada ou removida nesta rodada**.
- **Tempo real**: um canal Supabase Realtime por domínio
  (`rt-chat-messages`, `rt-financeiro-campanha_influenciadores`, etc.),
  padrão "recarrega tudo daquela tabela" em vez de patch incremental por
  linha, com cache em memória + pub-sub local (`subscribeX`).
- **Design system**: `src/components/ui/*` = camada shadcn/ui, tratada
  como gerada/substituível (confirmado pelo próprio `CLAUDE.md`).

## 3. Erros pré-existentes (não corrigidos nem escondidos)

- `src/lib/comercial-metrics.test.ts` — teste `"classifica cada motivo de
  gravidade corretamente"` depende de `Date.now()` sem congelar o relógio;
  o cenário "hoje" usa `Date.now() + 2h`, e dependendo do fuso/hora real
  de quando o teste roda, cai no bucket "próximos dias" em vez de "hoje".
  **Confirmado que já falhava antes de qualquer mudança desta sessão**
  (reproduzido em `git stash` sobre o `main` original). Não foi corrigido
  aqui — mexer na janela de "hoje" é uma decisão de regra de negócio do
  Comercial, fora do escopo de uma limpeza de código morto.

## 4. O que foi executado nesta rodada

### 4.1 ESLint — corrigido de vez (Etapa 5/8 do pedido)

- `.vercel` adicionado aos `ignores` do `eslint.config.js` — é isso que
  causava o travamento/erro no lint completo.
- `@typescript-eslint/no-unused-vars` **reativado** (estava `"off"` desde
  o scaffold inicial do Lovable) como `"warn"` — nunca quebra o build,
  mas agora aparece. Prefixo `_` continua liberado pra parâmetros
  intencionalmente ignorados (convenção já usada no projeto).
- Scripts novos: `"typecheck": "tsc --noEmit"`, `"lint:fix": "eslint . --fix"`.
- **Resultado**: `bun run lint` agora roda até o fim (antes nunca
  terminava de verdade) e termina com **0 erros**.

### 4.2 Formatação — 2.235 violações corrigidas (Etapa 5)

`eslint --fix` (só regras de formatação/prettier, determinístico, nunca
muda comportamento) rodado no repositório inteiro. Maior concentração em
`src/integrations/supabase/types.ts` (arquivo gerado pelo Supabase CLI,
nunca tinha passado pelo prettier do projeto) — conferido manualmente que
o diff é 100% espaçamento/aspas/ponto-e-vírgula, nenhum tipo mudou.
Também tocou alguns arquivos igualmente "gerados/não editar direto"
(`auth-attacher.ts`, `auth-middleware.ts`, `client.server.ts`) pelo mesmo
motivo — mesma garantia de diff puramente cosmético.

### 4.3 Código morto REALMENTE removido (Categoria A) — Etapa 2/3

Cada item abaixo foi confirmado com `bunx knip` **e** busca global manual
(`grep` por nome do arquivo/símbolo em todo o repo, incluindo comentários e
configs) antes de remover — nunca só por causa da ferramenta.

**Componentes/arquivos sem nenhum importador real:**
- `src/components/AccordionGallery.tsx` + `.css`
- `src/components/DriftWall.tsx` + `.css`
- `src/components/FlowingMenu.tsx` — o próprio código-fonte já tinha 3
  comentários em outros arquivos dizendo "substitui a linha FlowingMenu",
  confirmando que já tinha sido substituído de propósito e só não foi
  apagado.
- `src/components/Popover.tsx` (componente customizado próprio, distinto
  do `ui/popover.tsx` do shadcn) — zero importadores.
- `src/components/StepIndicator.tsx`
- `src/components/comercial/ComercialHeader.tsx` e
  `ComercialOverviewView.tsx` — um comentário em `ComercialSection.tsx`
  já dizia "mesmos `computeComercialKpis` que `ComercialOverviewView`
  **usava**" (passado), confirmando substituição.
- `src/components/financeiro/IndicatorCard.tsx` — duplicata exata de um
  componente local homônimo dentro de `ComercialOverviewView.tsx`; um
  comentário em `src/components/shared/MetricCard.tsx` já registrava essa
  duplicação como achado de uma auditoria anterior, nunca resolvido.
- `src/lib/releases.functions.ts` — substituído por `platform-releases.ts`.
- `scripts/test-roadmap-engine.ts` — script avulso de teste manual, fora
  de `*.test.ts`, nunca referenciado por `package.json` nem CI.
- 15 primitivos shadcn nunca adotados: `aspect-ratio`, `carousel`,
  `context-menu`, `form`, `hover-card`, `input-otp`, `menubar`,
  `navigation-menu`, `pagination`, `progress`, `resizable`,
  `scroll-area`, `sidebar`, `toggle`, `toggle-group` (`src/components/ui/`).

**Não removido apesar do knip sinalizar** (falso positivo confirmado):
`public/sw.js` — knip acusou como "arquivo não usado" porque é carregado
via `navigator.serviceWorker.register("/sw.js")` (string, runtime), não
por import de módulo. Mantido, exatamente o tipo de caso que a seção 2 do
pedido pede pra proteger.

**Funções/variáveis locais mortas** (import não usado, função nunca
chamada dentro do próprio arquivo — confirmado por escopo, não por nome):
~54 ocorrências corrigidas em 24 arquivos (lista completa no diff), entre
elas: ícones importados e nunca usados, tipos duplicados, uma dupla
`ALLOWED_UPLOAD_CONTENT_TYPES`/`assertAllowedUploadContentType` em
`inscricao-campanha.functions.ts` deixada para trás pela própria
reestruturação do mídia kit desta sessão, e uma função `toggleTimer` +
parâmetro `onToggleTimer` em `TaskBoard.tsx` que ficaram órfãos junto com
os ícones `Play`/`Pause` (o controle de play/pause do timer já não existe
mais na interface).

**Deixado de propósito, documentado (Categoria B — ver seção 6):** 4
funções/componentes locais não usados dentro de
`src/components/influenciadores/InfluencerBoard.tsx` (`hasRedeMetrics`,
`DemographicChart`, `EntregaAnexosPopup`, `ProfileSectionCard`) — arquivo
de 6.653 linhas, alto risco de deslocar chaves/JSX ao remover blocos
grandes às pressas. Ficam como aviso de lint (não quebram o build), com
uma suspeita concreta pra investigar depois: `DemographicChart`/
`hasRedeMetrics` têm nomes idênticos a funções que **existem e são
realmente usadas** em `src/components/portal/portal-widgets.tsx` — pode
ser uma duplicação real entre o board interno e o portal do cliente que
vale a pena consolidar numa rodada dedicada.

### 4.4 Dependências removidas (17) — Etapa 9

Cada uma confirmada como **verdadeiramente sem uso** — ou porque zero
arquivo a importava, ou porque só era usada pelo próprio arquivo/scaffold
já removido acima (checado individualmente, inclusive resolvendo
subpaths como `motion/react`, que uma busca ingênua por `"motion"`
sozinha não pegaria):

| Pacote | Motivo |
|---|---|
| `motion` | só usado por `Popover.tsx`/`StepIndicator.tsx` (removidos) |
| `gsap` | só usado por `AccordionGallery.tsx`/`FlowingMenu.tsx` (removidos) |
| `embla-carousel-react` | só `ui/carousel.tsx` (removido) |
| `react-hook-form` + `@hookform/resolvers` | só `ui/form.tsx` (removido) |
| `input-otp` | só `ui/input-otp.tsx` (removido) |
| `react-resizable-panels` | só `ui/resizable.tsx` (removido) |
| `@radix-ui/react-aspect-ratio` | só `ui/aspect-ratio.tsx` (removido) |
| `@radix-ui/react-context-menu` | só `ui/context-menu.tsx` (removido) |
| `@radix-ui/react-hover-card` | só `ui/hover-card.tsx` (removido) |
| `@radix-ui/react-menubar` | só `ui/menubar.tsx` (removido) |
| `@radix-ui/react-navigation-menu` | só `ui/navigation-menu.tsx` (removido) |
| `@radix-ui/react-progress` | só `ui/progress.tsx` (removido) |
| `@radix-ui/react-scroll-area` | só `ui/scroll-area.tsx` (removido) |
| `@radix-ui/react-toggle` | só `ui/toggle.tsx` (removido) |
| `@radix-ui/react-toggle-group` | só `ui/toggle-group.tsx` (removido) |
| `@tanstack/router-plugin` | não referenciado em `vite.config.ts` nem em lugar nenhum |

`bun install` rodado depois — **17 pacotes removidos**, lockfile
atualizado. `node_modules` não foi inspecionado por dependências
transitivas órfãs (fora do escopo — o bun já resolve isso no lockfile).

### 4.5 Correções pontuais de segurança/correção de código (Etapa 4/7)

- `src/lib/csv.ts`: BOM (`﻿`) estava escrito como caractere literal
  invisível dentro de uma regex (`no-irregular-whitespace`) — trocado por
  `﻿` explícito, mesmo comportamento (testado manualmente:
  `parseCsv("﻿a,b,c\n1,2,3")` continua removendo o BOM
  corretamente). Duas classes de caracteres `[\/\-]` simplificadas pra
  `[/-]` (escapes desnecessários, mesmo resultado — testado
  `parseFlexibleDate` com `/` e `-`).
- `src/components/Grainient.tsx`: dois `expr ? a() : b();` usados só pelo
  efeito colateral (proibido por `no-unused-expressions`) trocados por
  `if/else` equivalente — comportamento idêntico, só forma.

## 5. O que NÃO foi feito (fora do escopo desta rodada, por decisão explícita de segurança)

Consistente com a seção 21 do pedido ("não usar redução de linhas como
única métrica", "não reescrever a aplicação do zero"):

- **222 exports e 108 tipos sinalizados como "possivelmente não usados"
  pelo knip NÃO foram tocados.** É um volume grande demais pra revisar
  individualmente com segurança numa sessão só, e uma fração real desses
  são falsos positivos esperados neste projeto: primitivos do design
  system mantidos por completude de API (`DialogPortal`, `SelectGroup`,
  `CommandShortcut` etc.), tipos de domínio compartilhados
  (`hypito-messages.ts`, `projetos.ts`, `performance-engine.ts`) e
  utilitários usados só dentro de testes ou via padrões que o knip não
  segue com 100% de confiança nesta base de código (muito import
  dinâmico `await import(...)` em toda função server-side). Ficam **como
  estão**, documentados como Categoria B para revisão humana dedicada.
- **Nenhum módulo de produto foi revisado linha a linha** (Clientes,
  Campanhas, Projetos, Reuniões, Comercial, Metas, Configurações, Portal
  do cliente, notificações, relatórios) além do que apareceu naturalmente
  nos achados de lint/knip acima. Isso inclui as Etapas 6, 7, 10, 11, 12,
  13, 14 do pedido (regras de negócio centralizadas, performance de
  frontend/backend, Chat/tempo real/Hypito, uploads, N+1 queries) — nada
  disso foi auditado nesta rodada.
- **Nenhuma duplicação de componente foi consolidada** além da remoção
  do `IndicatorCard.tsx` órfão (Etapa 5) — coisas como múltiplos
  seletores de responsável/data/status, uploaders, visualizadores de PDF
  etc. citados no pedido não foram mapeados.
- **Nenhuma correção de acessibilidade** (Etapa 16) foi feita.
- **Nenhuma dependência foi promovida entre `dependencies`/`devDependencies`**
  além da remoção do `@tanstack/router-plugin` (que saiu inteiro, não
  mudou de categoria).
- **Nenhum `any`/cast inseguro foi revisado** (Etapa 7).

## 6. Itens que precisam de decisão humana

1. **`hasRedeMetrics`/`DemographicChart` duplicados entre
   `InfluencerBoard.tsx` (não usados) e `portal-widgets.tsx` (usados)** —
   candidato real a consolidação (Categoria C, duplicação), mas requer
   entender se o board interno e o portal do cliente precisam de versões
   diferentes por alguma regra de permissão/dado que não é óbvia só lendo
   os nomes.
2. **`EntregaAnexosPopup`/`ProfileSectionCard`** (`InfluencerBoard.tsx`,
   não usados) — confirmar se são leftovers de uma versão anterior do
   drawer (esta sessão reestruturou esse arquivo pesadamente em rodadas
   recentes) antes de apagar o corpo das funções.
3. **222 exports + 108 tipos "possivelmente não usados"** (lista completa
   em `/tmp/knip_output.txt` gerado nesta sessão, não commitado) —
   recomendo uma rodada dedicada só a isso, arquivo por arquivo, com
   `grep` de confirmação em cada um antes de remover.
4. **Teste `comercial-metrics.test.ts` flaky por fuso/hora** (seção 3) —
   decisão de negócio sobre a janela exata de "hoje" no Comercial, não
   uma limpeza de código.
5. **Auditoria dos módulos de produto listados no pedido** (Financeiro,
   Chat/Hypito tempo real, uploads, backend/N+1, CSS/design tokens,
   acessibilidade, tratamento de erros) — nenhum foi coberto nesta rodada
   além do que apareceu de graça via lint/knip. Recomendo tratar cada
   Etapa do pedido original (6 a 17) como uma entrega própria, do mesmo
   jeito que "Bloqueada", "Chat", "Hypito" e "Inscrição de influenciadores"
   já foram tratados como rodadas dedicadas nesta mesma sessão.

## 7. Resultado final da verificação

| Checagem | Antes | Depois |
|---|---|---|
| `bunx tsc --noEmit` | limpo | limpo |
| `bun run lint` | nunca terminava (erro em `.vercel`) | **0 erros**, 102 avisos (pré-existentes + 4 deixados de propósito, documentados acima) |
| `bun run test` | 279/280 (1 falha pré-existente, não relacionada) | 279/280 (mesma falha, confirmada não-relacionada) |
| `bun run build` | passava, ~3.8s | passa, ~424ms–3.8s (variação normal de cache) |
| Dependências | 91 (72 deps + 19 devDeps) | 74 (55 deps + 19 devDeps) — **17 removidas** |
| Arquivos removidos | — | 27 |
| Tamanho do bundle inicial (`AppShell` chunk) | 632,30 kB | 632,32 kB (~igual — os arquivos removidos já não entravam no bundle, tree-shaking já os excluía; o ganho aqui é menos dependência/manutenção, não bytes) |

Nenhuma funcionalidade, rota, permissão, dado ou regra de negócio foi
alterada. Nenhuma migration, arquivo de storage ou dado de produção foi
tocado.
