# 0001 — `lib/` não importa valores de `components/`

**Data:** 2026-10-03 · **Status:** adotada (parcial)

## Contexto
Tipos e regras de domínio (influenciadores, entregas, tarefas) viviam dentro de arquivos de componente gigantes (`InfluencerBoard.tsx`, `TaskBoard.tsx`). Mais de 20 módulos de `lib/` — incluindo server functions — importavam deles. Efeitos medidos: a UI de 7.100 linhas e o recharts entravam no bundle **inicial** só porque a store `lib/projetos.ts` precisava de uma constante; havia ciclos `lib ↔ componente`; mexer no modelo exigia carregar a UI.

## Decisão
1. Tipos, constantes e normalizadores puros vivem em `lib/` (`lib/influencer-model.ts`) ou em módulos pequenos sem UI (`components/tasks/task-people.tsx`).
2. O componente grande **re-exporta** o modelo (`export *`), então os imports antigos continuam válidos; módulos novos importam do modelo.
3. `import type` de componente é tolerado (some no build) mas é dívida; **valores** não.

## Consequências
- `projetos` 168 KB → 12 KB; landing do app −43% (ver `performance/README.md`).
- Restam 19 imports de `lib/` para componentes (14 `import type`; 5 de valor: `campanhaStatus` ×3 e `clienteStatus`, de `campanha-ui`/`cliente-ui`, mais os tipos de `marketing-tasks`): mover essas regras para `lib/` é o próximo passo. Ciclos de import: 5 → 3.
- Ainda não há regra de lint que impeça regressão (o ESLint não distingue tipo de valor em `import { … }` sem `type`).
