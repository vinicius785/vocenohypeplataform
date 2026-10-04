# Performance

Medições reais do build (não estimativas) e o que ainda pesa. Relatório anterior: [`2026-09-codebase-optimization-report.md`](./2026-09-codebase-optimization-report.md).

## Como medir (reprodutível)
Carga inicial = **fechamento de imports estáticos** a partir do chunk de entrada do build (`bun run build` → `.vercel/output/static/assets`), contando bytes brutos e gzip. Chunks carregados por `import()` dinâmico não entram. Não mede tempo de rede nem de execução; mede o que o navegador precisa **baixar antes** de mostrar a tela.

## Resultado da rodada 2026-10-03
| Cenário | Antes | Depois | Variação |
|---|---|---|---|
| Entrada comum a toda rota (inclui login `/`) | 1.552 KB · 454 KB gz · 78 arquivos | 798 KB · 240 KB gz · 38 arquivos | **−49% / −47%** |
| Landing do app (`/time` → Início) | 2.684 KB · 814 KB gz | 1.521 KB · 480 KB gz | **−43% / −41%** |
| Landing sem Início (shell + `/time`) | 2.522 KB · 752 KB gz | 1.409 KB · 440 KB gz | −44% / −41% |
| JS total emitido (todas as rotas) | 5.120 KB · 251 arquivos | 5.236 KB · 283 arquivos | +2% (mais chunks, carregados sob demanda) |

### O que causou cada ganho
1. **Modelo de influenciadores extraído para `lib/influencer-model.ts`.** `lib/projetos.ts` (store carregada no `beforeLoad` de toda página autenticada) importava valores de `InfluencerBoard.tsx` (≈7.100 linhas de UI), então a UI inteira — e, por ela, o recharts (≈360 KB) — entrava no bundle inicial. Agora o board é um chunk próprio (≈128 KB) carregado só em Campanhas/Projetos. O chunk `projetos` caiu de 168 KB para 12 KB.
2. **`TaskDialog` lazy no `TaskModalStack`** e **pessoas/motivos de tarefa extraídos para `tasks/task-people.tsx`**: o workspace de tarefas (editor rico, ≈600 KB) saiu do shell; só carrega ao abrir uma tarefa.
3. **Jogos (Termo/Zip) lazy** no card "Pausa rápida": o dicionário do Termo (128 KB de fonte) não viaja mais com a Início. _(Os jogos foram removidos do app depois desta medição; o ganho passou a ser definitivo.)_
4. Inicialização do `_authenticated`: MFA + perfil + ambiente em **paralelo** (antes 3 idas ao servidor em fila antes de qualquer tela). Ganho esperado ≈ 2 round-trips; não medido em ms (sem acesso a rede de produção).
5. Cronômetro do shell só "tica" quando há timer rodando (antes: 1 re-render/s mesmo ocioso).

Tentativa **descartada**: `manualChunks` para isolar recharts/tiptap. O Rolldown manteve esses chunks na importação estática da entrada (código compartilhado ficou dentro deles) e não houve ganho; revertido. A solução correta foi cortar a dependência na origem (item 1).

## O que ainda pesa
| Item | Tamanho | Observação |
|---|---|---|
| `index` (entrada) | 415 KB | router + UI base + supabase; compartilhado por todas as rotas |
| `task-directory` | 231 KB | agrega stores e engines que o shell carrega; candidato a divisão |
| `dist-*` (client Supabase etc.) | 199 KB | necessário |
| TaskBoard (lazy) | 558 KB | só ao abrir tarefa |
| recharts (lazy) | 364 KB | só em telas com gráfico |
| 16 stores carregadas **antes de qualquer tela** | tamanho dos dados | `_authenticated/route.tsx` baixa clientes, projetos, reuniões, financeiro (todo o histórico), banco de influenciadores, tarefas de campanha/projeto… por inteiro. Cresce com os dados. **Maior risco de escalabilidade** (P1) |

## Polling e tempo real (inventário)
- Realtime: ~26 canais `.channel(...)` (chat, leads, campanha_influenciadores, stores de lista…).
- Polling: Comercial 15 s (além do realtime em `leads`), Início 15 s e 30 s, diretório do time 30 s, chat 20 s, portal 20 s, NPS pendente 60 s, Problemas 60 s. Alguns duplicam o realtime — candidatos a consolidar.
- `select("*")`: 53 ocorrências; as tabelas de lista usam `select("data")` (JSONB inteiro) por linha.

## Próximos passos de maior valor
1. **Carga lazy por módulo das stores pesadas** (financeiro, banco de influenciadores, AEO, metas): exige auditar quem lê cada store de forma síncrona (contrato `get()` após `init()` no `beforeLoad`). Ganho cresce com o volume de dados.
2. Dividir `task-directory`/`index` por rota.
3. Remover polling redundante onde já há realtime.
