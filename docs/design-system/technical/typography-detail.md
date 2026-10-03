> **Referência técnica secundária** — dados brutos da engenharia reversa do Início. Não é contrato: o contrato está em `../DESIGN-SYSTEM.md`.

# Tipografia do Início

Fontes: `src/styles.css`, `src/lib/design-tokens.ts` (`TYPOGRAPHY`), `src/components/InicioDashboard.tsx`, `src/components/inicio/*`, `src/components/shared/EmptyState.tsx`.

## 1. Família tipográfica

**Não há `font-family` customizada** em `src/styles.css`, em `src/routes/__root.tsx` ou em arquivos públicos (nenhum `@font-face`, `--font-*` ou link de Google Fonts encontrado). O produto usa **a pilha padrão do Tailwind v4 (`font-sans`)** — a fonte do sistema (`ui-sans-serif, system-ui, …`). Consequência: a aparência exata varia por sistema operacional; o "padrão" vem de tamanho/peso/tracking, não da fonte.

## 2. Escala REAL usada pelo Início

Contagem de ocorrências em `InicioDashboard.tsx` + `components/inicio/*`:

| Tamanho | Ocorrências | Observação |
|---|---|---|
| `text-xs` (12px) | 23 | corpo de listas/menus, ações de rodapé |
| `text-sm` (14px) | 12 | títulos de item, corpo principal |
| `text-[11px]` | 16 | metadados (data, "N min · local", contadores) |
| `text-[10px]` | 3 | timestamps de comentário, rótulo de indicador |
| `text-[9px]` | 1 | selo "Sub" (subtarefa) |
| `text-base` / `text-lg` | 2 / 2 | título de destaque do Mural; valores do card Financeiro |
| `text-xl` | 2 | número dos indicadores do cabeçalho; inicial do avatar |
| `text-2xl` / `md:text-[26px]` | 1 / 1 | saudação |
| `text-4xl` | 1 | temperatura |

Pesos: `font-medium` 19, `font-semibold` 13, `font-normal` 1 — **não há `font-bold` no Início**. Tracking: `tracking-tight` 2 (saudação, temperatura), `tracking-wide` 3, `tracking-wider` 1 (rótulos em caixa-alta).

## 3. Níveis (como o Início os usa de fato)

| Nível | Classes reais | Cor | Uso no Início |
|---|---|---|---|
| **Saudação** (equivalente a H1) | `text-2xl font-semibold tracking-tight md:text-[26px]` | `text-foreground` | "Bom dia, {nome}" |
| **Subtítulo do cabeçalho** | `mt-0.5 text-sm` | `text-muted-foreground` | data por extenso |
| **Temperatura** | `text-4xl font-semibold tracking-tight` | `text-foreground` | clima |
| **Título de card** (equivalente a H2) | `TYPOGRAPHY.cardTitle` = `text-[15px] font-semibold break-words` | herda `text-foreground` | `CardHeader` ("Meu trabalho", "Agenda"…). **Único token de `TYPOGRAPHY` que o Início usa.** |
| **Número de indicador** | `text-xl font-semibold tabular-nums` (valor com `padStart(2,"0")`) | `text-foreground`; `text-muted-foreground/50` se 0; `text-danger` se "Atrasadas" > 0; `text-brand` se ativo | faixa do cabeçalho |
| **Rótulo de indicador** | `text-[10px] font-medium uppercase tracking-wider whitespace-nowrap` | `text-muted-foreground` | "HOJE", "AMANHÃ"… |
| **Valor de card (Financeiro)** | `text-lg font-semibold` | `text-foreground` | "Vencido a receber/pagar" |
| **Rótulo de valor** | `text-[11px]` | `text-muted-foreground` | sob/sobre os valores |
| **Título de item de lista** | `text-sm` (tarefas) · `text-xs font-medium` (comentários, leads) | `text-foreground` | linhas |
| **Item de destaque (próxima reunião)** | hora `text-sm font-semibold tabular-nums` (`text-brand`), título `text-sm font-medium` | | Agenda |
| **Metadado** | `text-[11px]` (`text-[10px]` em timestamps) | `text-muted-foreground` | duração/local, datas |
| **Ação de rodapé** ("Ver todas", "Ir para…") | `text-xs font-medium` | `text-brand` + `hover:underline` | rodapés de card |
| **Ação de cabeçalho de card** ("Ver tudo", "Limpar") | `text-xs font-medium` | `text-muted-foreground hover:text-foreground` | `CardHeader.action` |
| **Aba "pill"** (`Tab`) | `text-xs font-medium` | ativa: `text-brand` sobre `bg-brand-subtle`; inativa: `text-muted-foreground` | "Hoje/Atrasadas/Semana" |
| **Título do estado vazio (compacto)** | `text-sm font-medium` | `text-foreground` | `EmptyState compact` |
| **Rótulo de grupo da sidebar** | `text-[10px] font-medium uppercase tracking-wider` | `text-muted-foreground/70` | "GERAL", "OPERAÇÃO"… |

`line-height`: o Início **não** define `leading-*` na maioria dos textos (herda o line-height do Tailwind associado ao `text-*`: `xs 1.333`, `sm 1.429`, `base 1.5`, `xl 1.4`, `2xl 1.333`, `4xl 1.111`). Exceções: temperatura/condição usam `leading-tight`.

## 4. Tokens tipográficos existentes (`src/lib/design-tokens.ts` → `TYPOGRAPHY`)

| Token | Classes | Usado pelo Início? |
|---|---|---|
| `display` | `text-3xl font-bold tracking-tight md:text-5xl break-words` | não |
| `pageTitle` | `text-2xl font-bold tracking-tight md:text-4xl break-words` | não |
| `pageHeading` | `text-[36px] font-bold leading-[1.05] tracking-tight md:text-[42px] break-words` | **não** (token criado depois, a partir dos módulos) |
| `sectionTitle` | `text-xl font-semibold tracking-tight md:text-2xl break-words` | não (`EmptyState` não-compacto usa) |
| `cardTitle` | `text-[15px] font-semibold break-words` | **sim** (`CardHeader`) |
| `body` | `text-sm font-normal leading-relaxed md:text-base break-words` | não |
| `bodySecondary` | `text-sm text-text-secondary break-words` | não |
| `label` | `text-xs font-semibold text-text-secondary uppercase tracking-wide md:text-[13px] break-words` | não |
| `caption` | `text-xs text-text-secondary break-words` | não |
| `numberLarge` / `numberMedium` | `text-3xl…md:text-4xl` / `text-xl…md:text-2xl` (`tabular-nums`) | não |

## 5. Regra global de h1–h4 (`src/styles.css`)

Atualmente (após a auditoria anterior): `@layer base { h1,h2,h3,h4 { font-weight: 600; letter-spacing: -0.02em } }` — utilitários do Tailwind vencem. **Histórico:** até esse ajuste, a regra era `font-weight: 300` **fora de camada**, vencendo qualquer classe. O Início **nunca foi afetado**: não usa `<h1>`–`<h4>` (saudação e títulos de card são `<p>`).

## 6. Onde a plataforma usa tipografia diferente do Início

- **Título de página:** 9 módulos (Clientes, Campanhas, Projetos, Comercial, Financeiro, Metas, Time, Problemas, Reuniões via `PageHeader`) usam `text-[36px] md:text-[42px] font-bold`; o Início usa saudação `text-2xl md:text-[26px] font-semibold`. Diferença: ~10–16px e um peso.
- **Texto secundário:** o Início usa `text-muted-foreground` (44 usos) e quase não usa `text-text-secondary` (1 uso); no repositório, `text-text-secondary` aparece em **138 arquivos** e `text-muted-foreground` em **226**.
- **Micro-texto:** em toda a plataforma há 578 usos de `text-[11px]`, 239 de `text-[10px]` e 26 de `text-[9px]` — o Início também os usa (é parte do seu padrão), mas o uso de `[9px]` é raro nele (1) e comum em outras telas.
- **Escala de KPI:** o Início usa `text-xl` (indicadores) e `text-lg` (valores de card); `SummaryPrimaryMetric` usa `text-[32px] md:text-[36px]`; Financeiro/Metas usam `text-4xl md:text-5xl`.
