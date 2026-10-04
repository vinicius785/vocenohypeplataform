# 0004 · Demo operacional (campanha demo Time ↔ Cliente)

**Status:** PLANO VALIDADO (2026-10-04) · **Etapa 0 concluída** — resultados e correções em [`0004-etapa-0-relatorio.md`](./0004-etapa-0-relatorio.md). Nenhum código de produto foi escrito. **Implementação BLOQUEADA antes do primeiro uso real** até a migration `20261004` ser aplicada e verificada. Aguardando validação para a Etapa 1.

> **Correções da Etapa 0 a este plano** (o texto abaixo é o original; onde conflita, vale esta lista):
>
> 1. **D2 ajustado pelo usuário:** **não** existe "Selecionar substituto" e **não** se cria `Influ.substituidoPorId`. Substituição = fluxo atual (recusado → curadoria → enviar outro → reenviar ao cliente). A Demo não introduz regra de negócio nova.
> 2. **Gatilhos de e-mail:** `email_flows_*`/`enroll_email_flow` foram removidos em `20260826210000` e as tabelas não existem no banco vivo — **não há guarda a fazer nelas**. E-mail sai só por `sendEmail` (gargalo único): guarda ali (destinatário de demo recusado) + seletores sem a Demo + dados sem e-mail real.
> 3. **Marcador da Demo** vai em `clientes.data.demoSessionId` (o store do cliente só carrega `data`); coluna `is_demo` deixa de ser a fonte.
> 4. **Filtro no store, não no hook** (`createTableArrayStore.set` apaga por diferença; `useSyncExternalStore` exige snapshot estável). Há **três** vetores de vazamento: `useClientes`, carga global dos `campanha_*` (`initCampanhaScopedSync`) e o sino do `AppShell`.
> 5. **`campanha_entregas`** é espelho **não usado e desatualizado** (212 × 228 entregas); fonte da verdade = `campanha_influenciadores.data`.
> 6. **`realtime.send` não é pré-requisito:** broadcast do navegador do time e HTTP do servidor foram testados; `realtime.send` por gatilho fica opcional (a verificar no SQL).
> 7. **D8 virou pré-requisito:** a migration `20261004` precisa estar aplicada e verificada antes do primeiro uso real; o banco vivo está atrás do repositório (migration de 03/out também pendente).
> 8. **`/portal-v2`:** 58 ocorrências em código de aplicação (41 URLs + 17 chaves/comentários), 68 em rotas, 19 em testes.

Objetivo: a partir de um lead do CRM, criar uma **campanha real em ambiente isolado**, operável ao vivo pelo Time (experiência normal da campanha) e pelo Cliente (Portal do Cliente real, por link), sobre o **mesmo estado**. A Demo é uma camada de **contexto, isolamento, dados fictícios, estados, permissões e sincronização** sobre o domínio existente — não uma segunda implementação dele.

---

## 1. Auditoria (Fase 0) — o que existe hoje

| #   | Área                  | Como é hoje (verificado no código)                                                                                                                                                                                                                                                                                                                                                               | Papel na Demo                                                |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| 1   | CRM                   | `ComercialSection`, `comercial/LeadDrawer` (cockpit), `LeadCard`; motor `comercial-engine`; webhooks de saída só em `comercial.functions` (`lead.created/won`)                                                                                                                                                                                                                                   | Ponto de entrada                                             |
| 2   | Lead                  | tabela `leads` (colunas + `extra` JSONB). Vínculo lead→cliente hoje: `crmLeadId` no cliente (`convertLead.ts`)                                                                                                                                                                                                                                                                                   | Demo guarda `lead_id` em tabela própria; **o lead não muda** |
| 3   | Campanhas             | **dentro do cliente**: `clientes.data.campanhas[]` (`Campaign`, JSONB). Demais tabelas apontam por `campanha_id` **texto, sem FK**                                                                                                                                                                                                                                                               | A Demo é 1 cliente + 1 campanha                              |
| 4   | Estrutura da campanha | `campanha_influenciadores` (cada linha = `Influ` JSON, com **`entregas[]`**, comentários e atividade), `campanha_entrega_versoes/eventos`, `campanha_tarefas`, `campanha_documentos`, `campanha_cronograma`, `campaign_cycles`, `campanha_nps*`; `campanha_entregas` existe e está no Realtime (**uso a confirmar na Etapa 0**)                                                                  | Reaproveitado integralmente                                  |
| 5   | Portal do Time        | `/time?section=campanhas` → `CampanhasSection`; detalhe abre por estado local `openId` (+ handoff por `sessionStorage` já usado por menções)                                                                                                                                                                                                                                                     | Abrir campanha Demo = mesmo detalhe                          |
| 6   | Portal do Cliente     | 3 gerações. **V2** (`features/client-portal-v2`): exige sessão; consome `usePortalSessionData()` (contexto com `ClienteLinkData`, `reload`, polling 20 s e canal Realtime). Só **6 arquivos** chamam server functions `*Session`. Hrefs `/portal-v2` fixos em **56 ocorrências** (16 arquivos, incluindo testes). **Token** (`/portal/$token`): sem login, service-role, mesmo `ClienteLinkData` | Demo reutiliza a **UI do V2** com acesso por token           |
| 7   | Influenciadores       | `InfluStatus`: `INSCRITO → EM_CURADORIA → ENVIADO_AO_CLIENTE → APROVADO \| RECUSADO` (`campanha-status.ts`). **Não existe "substituto"**: substituir = o time envia outro da curadoria                                                                                                                                                                                                           | Máquina de estados já existe                                 |
| 8   | Aprovações            | funções **puras** `applyInfluApproval`, `reopenInfluApprovalByCliente`, `applyEntregaApproval` (`campanha-aprovacao.ts`), usadas pelos dois portais                                                                                                                                                                                                                                              | Reuso direto                                                 |
| 9   | Roteiros              | são **estágios da `Entrega`**: `ROTEIRO_PRODUCAO → ROTEIRO_APROVACAO → (PRODUCAO \| ROTEIRO_AJUSTES)`; ação do time em `entrega-engine.ts`; arquivo = `EntregaAnexo` (com `versao`)                                                                                                                                                                                                              | Reuso direto                                                 |
| 10  | Conteúdos             | `CONTEUDO_APROVACAO → (PUBLICACAO \| CONTEUDO_AJUSTES) → PUBLICADA`                                                                                                                                                                                                                                                                                                                              | Reuso direto                                                 |
| 11  | Comentários           | `Influ.comments` (equipe) e `Influ.clienteComments`; motivo de reprovação em `roteiroReprovacao`/`conteudoReprovacao`; cliente comenta via `addInfluClienteComentario`                                                                                                                                                                                                                           | Reuso                                                        |
| 12  | Tarefas               | `campanha_tarefas` (JSON), lidas também por agregadores globais                                                                                                                                                                                                                                                                                                                                  | Exige filtro anti-vazamento                                  |
| 13  | Relatórios            | `Campaign.relatoriosMensais` + bucket **privado** `relatorios-mensais` (URL assinada gerada no servidor); NPS mensal                                                                                                                                                                                                                                                                             | Reuso (arquivo de exemplo)                                   |
| 14  | Métricas              | `PostMetrics` por entrega: `views, likes, comments, shares, saves, reach`; `profileMetrics` por influenciador; resultados derivados em `derive.ts`. **Não existem** impressões, cliques, conversões                                                                                                                                                                                              | Só o que existe (ver decisão D3)                             |
| 15  | Recursos              | `ClientCampaignResources`, `campanha_documentos`                                                                                                                                                                                                                                                                                                                                                 | Reuso                                                        |
| 16  | Autenticação          | Supabase Auth; equipe = org interna; cliente = org `client`; links por token com service-role                                                                                                                                                                                                                                                                                                    | Demo = token (sem sessão)                                    |
| 17  | Permissões            | `has_permission(...)`, `SECTION_PERMISSION`; papéis de cliente (`client_viewer` somente leitura)                                                                                                                                                                                                                                                                                                 | Criar demo: permissão `comercial`                            |
| 18  | RLS                   | tabelas de domínio `TO authenticated` + permissão; **contas de cliente ainda enxergam dado interno** até aplicar a migration `20261004` (**pendente**)                                                                                                                                                                                                                                           | Por isso a Demo **não usa sessão** de cliente                |
| 19  | Realtime              | campanhas/clientes/tarefas estão na publicação; stores do time assinam `postgres_changes`; **cliente anônimo não recebe** `postgres_changes` (RLS) → hoje é polling                                                                                                                                                                                                                              | Broadcast como sinal                                         |
| 20  | Modelos               | JSONB em `data`; `organizations.type ∈ {internal, client}`, `status ∈ {active, suspended}`                                                                                                                                                                                                                                                                                                       | Org demo = `client` + `suspended`                            |
| 21  | Componentes           | `CampanhaDetail`, `InfluencerBoard`, `PortalV2Shell` e páginas V2, `Dialog/Sheet/Popover/Badge/Tooltip`, `useConfirm`, `TimelineList`                                                                                                                                                                                                                                                            | Reuso                                                        |
| 22  | Design System         | `docs/design-system/DESIGN-SYSTEM.md`; referência Início                                                                                                                                                                                                                                                                                                                                         | Obedecer; sem estilos novos                                  |
| 23  | Histórico             | **já existe**: `Influ.activityEvents` (`perfil_enviado/aprovado/recusado`, `roteiro_*`, `conteudo_*`, `comentario_*`, ator `cliente`\|`equipe`) + `Influ.activity` (log de texto do time)                                                                                                                                                                                                        | **Linha do tempo = leitura sobre isso**                      |
| 24  | Integrações externas  | e-mail (Resend: convite de cliente + cron), **Web Push** (`notifyTeamEntregaResponse` avisa admins quando o cliente aprova/reprova), webhooks de saída (só lead), Google Calendar (reuniões). **Gatilhos de banco:** `email_flows_clientes_trigger` (inscreve o cliente em fluxo de e-mail ao inserir!) e `campanha_influenciadores_ensure_nps`                                                  | Bloquear/guardar todos                                       |

**Achados que definem o desenho**

1. O domínio já tem as três máquinas de estado e o histórico estruturado — a Demo **não cria estados nem log novos** para as ações de domínio.
2. Inserir um `cliente` dispara e-mail real por gatilho do banco; inserir influenciador cria registro de NPS. Precisam de guarda **no banco**.
3. Dar uma **sessão Supabase** a quem abre o link (mesmo `client_viewer`) expõe, hoje, dados internos via RLS. Por isso o acesso do cliente é **por token + service-role escopado**, o mesmo padrão dos links públicos existentes.
4. O V2 é consumido por contexto: dá para reaproveitá-lo trocando só **a fonte de dados/ações** e **o prefixo de rota**.

---

## 2. Arquitetura proposta (Fase 1)

### A. Modelo de dados (migration aditiva, nada destrutivo)

- **`demo_sessions`** (raiz do agregado): `id`, `lead_id` (→ `leads`, `on delete set null`), `cliente_id` (único), `campanha_id` (único), `organization_id`, `scenario`, `seed_version`, `status` (`active`\|`closed`), `token` (único), `token_expires_at`, `access_revoked_at`, `closed_at`, `last_client_access_at`, `created_by`, timestamps. Uma demo **ativa** por lead (índice único parcial).
- **`demo_events`**: só **ciclo de vida** (`criada`, `reiniciada`, `encerrada`, `acesso revogado/renovado`, `cliente abriu o link`). Eventos de domínio **não** são duplicados.
- **`clientes.is_demo boolean not null default false`** (+ índice parcial) e gatilho que impede alterar o valor depois do insert.
- Guardas nos gatilhos existentes: `email_flows_clientes_trigger` e `campanha_influenciadores_ensure_nps` **ignoram demo**.
- Função **`demo_apply_scenario(session_id, payload jsonb)`** (`SECURITY DEFINER`, só service-role): apaga e recria todas as linhas da demo **numa transação** — serve a _criar_ e a _reiniciar_.
- Gatilho de **sinal** em `campanha_influenciadores`/`campanha_tarefas`/`campanha_documentos`: se a campanha é de uma demo, chama `realtime.send` num tópico `demo:<chave>` (payload sem dado). _(disponibilidade a confirmar na Etapa 0.)_

### B. Relação Demo ↔ Lead ↔ Campanha

`lead` ← `demo_sessions.lead_id` · `demo_sessions` → 1 `cliente` (`is_demo`) → 1 `campanha` (dentro de `clientes.data.campanhas[]`) → linhas `campanha_*` por `campanha_id`. O lead **não é alterado**; o card da Demo no CRM consulta `getDemoDoLead(leadId)`.

### C. Isolamento

1. **Dados próprios**: cliente, organização (`type='client'`, `status='suspended'` — nunca resolve como ambiente ativo de ninguém) e campanha **criados só para a demo**, com ids novos. Nenhuma linha real é tocada.
2. **Backend, não frontend**: as funções públicas da demo recebem **só o token**; o servidor deriva sessão → cliente → campanha e rejeita qualquer `campanhaId/influencerId` fora dela (`loadInfluRow` já escopa por `campanha_id`). O front nunca diz "isto é demo".
3. **Time vê a demo sem poluir o produto**: `useClientes()`/`clientesStore.get()` passam a **excluir** `is_demo` (22 usos em 19 arquivos herdam sozinhos); um `useClientesComDemo()` é usado só pelo detalhe da campanha e pelo card da Demo. Consultas de servidor em `clientes` (15 usos em 7 arquivos) ganham `is_demo = false` (inventário na Etapa 0). Tarefas/NPS/financeiro da demo não entram em agregados.
4. **Efeitos externos bloqueados por construção e por guarda** (ver §J-segurança).

### D. Permissões Time × Cliente

- **Time**: criar/gerenciar demo exige permissão `comercial` (checada no servidor); operar a campanha = permissões normais de `campanhas`.
- **Cliente (demo)**: somente o que um cliente do portal pode — **responder influenciador, responder entrega (roteiro/conteúdo), comentar, ver métricas/relatórios**. Fora da demo e escondidos: CRM, custos, outras campanhas/clientes, NPS, demandas, bugs, artigos, Configurações → Acessos, conta/segurança. Cada função repete a checagem no servidor (como `assertCanMutate`).

### E. Sincronização em tempo real

- **Cliente → Time**: as funções da demo escrevem em `campanha_influenciadores`; os stores do time **já** assinam `postgres_changes` → atualiza sozinho. Sem código novo.
- **Time → Cliente**: o gatilho de sinal envia um _broadcast_ `demo:<chave>` (sem payload sensível); o provider da demo faz **um** `reload()` (debounce). Rede de segurança: o polling de 20 s do provider atual (só aba visível). Sem `setInterval` novo, um único listener por aba.

### F. Dados fictícios

`lib/demo/cenario-campanha-completa.ts` — função **pura e determinística** `buildDemoScenario({ sessionId, now })`, sem dado nos componentes. Datas relativas a `now` (a demo sempre parece atual). Conteúdo: cliente _Praia Bonita Resorts_ (nome vem do lead), campanha _Verão 2026_, briefing, **7 influenciadores** (2 aguardando, 2 aprovados, 1 reprovado + **2 na curadoria** para servir de substitutos), entregas com roteiros (2 aguardando, 1 aprovado, 1 com ajuste) e conteúdos (2 aguardando, 2 aprovados, 1 com ajuste), métricas por entrega publicada, 5–6 tarefas em estados variados **sem responsável real**, cronograma, documentos e 1 relatório mensal. Anexos de exemplo: arquivos estáticos do repositório (decisão D4).

### G. Reiniciar

`demo_apply_scenario` com o **mesmo** `sessionId` ⇒ mesmos ids, mesmo token; apaga alterações (estados, comentários, versões, anexos enviados na demo, tarefas) e recria o cenário inicial; registra `reiniciada`. A sessão e o link continuam válidos. Confirmação com `useConfirm`.

### H. Histórico

Narrativa = **leitura** (`buildDemoTimeline`, pura): junta `activityEvents` (estruturados) + `activity` (texto do time) de cada influenciador da campanha + `demo_events`, ordena e formata nas frases pedidas ("Cliente reprovou Beatriz Costa", "Time reenviou roteiro #03"…). Nada de log por clique. Onde uma ação do time **não** gravar evento hoje, a Etapa 5 corrige reaproveitando `logInfluActivity` (sem lógica nova).

### I. Expiração e revogação

Token de 32 bytes aleatórios (base64url), único, expira em **14 dias** (renovável). _Revogar acesso_ invalida o token (link morre; campanha e histórico seguem para o time) e _Gerar novo link_ cria outro. _Encerrar_ fecha a sessão (cliente bloqueado; time vê tudo, somente leitura). Coluna `token` com `REVOKE SELECT` para `authenticated`; o time obtém o link por função de servidor. Funções públicas com `checkRateLimit` (pendência SC-03 do baseline, resolvida aqui para a demo).

### J. Reuso (sem segunda implementação de campanha)

`CampanhasSection/CampanhaDetail`, `InfluencerBoard`, `entrega-engine`, `campanha-aprovacao` (puras), `loadInfluRow/saveInfluRow`, `PortalV2Shell` + páginas V2, `Dialog`, `Sheet`, `Popover`, `Badge`, `Tooltip`, `useConfirm`, `TimelineList`, `checkRateLimit`.

**Segurança — efeitos externos**
| Risco | Controle |
|---|---|
| Push aos admins (`notifyTeamEntregaResponse`) | funções da demo **não a chamam**; a função ganha guarda `if (cliente.is_demo) return` (defesa em profundidade) |
| E-mail por gatilho (`email_flows_clientes_trigger`) / convite (`client-access.functions`) | gatilho ignora demo (migration); convite recusa organização de demo |
| NPS automático por gatilho | gatilho ignora demo |
| Webhooks de saída | só `lead.*` em `comercial.functions`; a demo **não passa por `upsertLead`** |
| Google Calendar | reuniões, fora do fluxo de campanha |
| Storage | demo usa arquivos estáticos; uploads na demo ficam sob prefixo da campanha e são removidos ao reiniciar/encerrar |

### K. Componentes novos (somente o necessário)

| Peça                                                                                                                                            | Onde                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `DemoCreateDialog` (modal compacto) e `LeadDemoCard` (status, Abrir campanha, Copiar link, menu `•••`)                                          | CRM — `comercial/`          |
| `CampaignDemoControl` (chip discreto + popover: status, link, abrir como cliente, atividade recente, reiniciar, encerrar) e `DemoActivitySheet` | detalhe da campanha         |
| `DemoChip` (selo "Ambiente de demonstração")                                                                                                    | time e portal               |
| Rotas `routes/demo.$token/*` (~8 arquivos finos que montam as páginas V2)                                                                       | cliente                     |
| `PortalPaths` (prefixo de rota) e `PortalApi` (ações/dados) no V2 — **abstrações aditivas**, padrão = comportamento atual                       | `features/client-portal-v2` |
| `demo.functions.ts` (time e públicas), `demo-estados.ts` (tabela de transições), `demo-timeline.ts`, `lib/demo/cenario-*.ts`                    | `lib/`                      |
| Migration `…_demo_operacional.sql`                                                                                                              | `supabase/migrations/`      |

### L. Fluxos de estado (mapeados nas máquinas existentes — nada novo)

| Item          | Estado pedido        | Estado real                                                                                                  | Quem muda      | Guarda                                      |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------ | -------------- | ------------------------------------------- |
| Influenciador | pending              | `ENVIADO_AO_CLIENTE`                                                                                         | Time           | vem de `EM_CURADORIA`                       |
|               | approved             | `APROVADO`                                                                                                   | Cliente        | só se `ENVIADO_AO_CLIENTE`                  |
|               | rejected             | `RECUSADO` (+ motivo)                                                                                        | Cliente        | só se `ENVIADO_AO_CLIENTE`                  |
|               | replacement_selected | _(sem campo novo — D2)_ outro influenciador da curadoria é movido para `ENVIADO_AO_CLIENTE` pelo fluxo atual | Time           | vem de `EM_CURADORIA`                       |
|               | resubmitted          | `ENVIADO_AO_CLIENTE` de novo (`perfil_enviado`)                                                              | Time           | vem da curadoria                            |
| Roteiro       | pending              | `ROTEIRO_APROVACAO`                                                                                          | Time envia     | roteiro "pronto" (`dataRecebimentoRoteiro`) |
|               | approved             | `PRODUCAO`                                                                                                   | Cliente        | só em `ROTEIRO_APROVACAO`                   |
|               | adjustment_requested | `ROTEIRO_AJUSTES` (+ motivo)                                                                                 | Cliente        | só em `ROTEIRO_APROVACAO`                   |
|               | resubmitted          | `ROTEIRO_APROVACAO` (nova `versao`)                                                                          | Time           | só em `ROTEIRO_AJUSTES`                     |
| Conteúdo      | idem                 | `CONTEUDO_APROVACAO` → `PUBLICACAO` \| `CONTEUDO_AJUSTES` → `CONTEUDO_APROVACAO`                             | Cliente / Time | idem                                        |

As transições incoerentes já são barradas pelas funções puras (`applyEntregaApproval` exige o estágio certo); a demo adiciona a guarda de status do influenciador e **testa a tabela inteira**.

### M. Riscos técnicos

1. **Refactor do V2** (`PortalPaths`/`PortalApi`) toca o portal real: mitigado por ser aditivo (padrão idêntico), com os testes existentes (`derive.test.ts`, `nps-guard.test.ts`) e novos.
2. **Esconder a demo** mexe no store de clientes (núcleo): a mudança é num ponto só (`useClientes`/`get`); exige varrer os 15 usos de servidor e agregadores de `campanha_tarefas`.
3. **Realtime anônimo**: `realtime.send` pode não estar disponível → fallback de polling curto (5 s, só aba visível, só demo ativa).
4. **Gatilhos de e-mail/NPS**: se a migration não for aplicada antes da primeira demo, um cliente de demo poderia disparar fluxo real. A criação **recusa** se a guarda não existir (checagem de versão do esquema).
5. **Migration precisa ser aplicada** por você (SQL Editor do Supabase) — como a `20261004`; sem ela a Demo não liga.
6. **Anexos de exemplo** e PDF de relatório: precisam de arquivos estáticos e de caminho compatível com a URL assinada.
7. **Uploads feitos durante a demo** vão para o bucket real (em prefixo da campanha) — limpeza no reset/encerramento.
8. **Reset atômico** depende de a função SQL ser a única escrita (por isso `demo_apply_scenario`).
9. **Sem jsdom no projeto**: testes de UI são de marcação estática; fluxo ao vivo é verificado em navegador com roteiro manual.
10. **Dado de demonstração realista** ≠ dado real: nenhum nome real de influenciador/cliente do banco é reutilizado.

### N. Testes

Os 24 cenários pedidos, por camada:

- **Puros (Vitest)**: tabela de transições (todas as válidas e as inválidas), gerador de cenário (contagens e estados pedidos, determinismo, ids estáveis), `buildDemoTimeline` (frases), guarda de escopo, expiração.
- **Funções de servidor com Supabase simulado** (padrão de `portal-auth.functions.test.ts`): criar, vincular ao lead, link, acesso do cliente, cada resposta (aprovar/reprovar influenciador, ajuste/aprovação de roteiro e conteúdo), reiniciar, revogar, encerrar, **isolamento** (id de campanha real é rejeitado), **efeitos externos** (push/e-mail/webhook nunca chamados), permissões (cliente não alcança CRM/custos/outras campanhas; time sem `comercial` não cria).
- **SQL (roteiro de verificação documentado)**: gatilhos de e-mail/NPS ignoram demo; `is_demo` imutável; `REVOKE` do token; `demo_apply_scenario` atômico.
- **UI (marcação estática)**: card da Demo, diálogo de criação, selo, atividade.
- **Navegador**: roteiro completo da aceitação (CRM → link → cliente → time), dois navegadores, sem escrever em dado real.

---

## 3. Decisões que preciso validar

| #   | Decisão                                                                                                                                                                                                                         | Recomendação                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| D1  | A demo **não aparece** nas listas de Clientes/Campanhas/Financeiro; só abre pelo lead (ou por um filtro explícito)                                                                                                              | **Ocultar**                                                                                                                  |
| D2  | ~~Criar "Selecionar substituto"~~ **AJUSTADO pelo usuário:** não criar nada. Reusar o fluxo atual (recusado → curadoria → selecionar outro → reenviar ao cliente). A Demo não introduz regra de negócio nova                    | **Fluxo existente**                                                                                                          |
| D3  | Métricas: usar só o que existe (alcance, visualizações, curtidas, comentários, compartilhamentos, salvamentos + engajamento derivado). **Impressões, cliques e conversões não existem no produto** e não vou inventar estrutura | **Só o existente**                                                                                                           |
| D4  | Roteiros/conteúdos hoje são **arquivos** (não texto). Para a demo, enviar PDFs/imagens de exemplo versionados no repositório                                                                                                    | **Estáticos no repo**                                                                                                        |
| D5  | Expiração padrão do link                                                                                                                                                                                                        | **14 dias**, renovável                                                                                                       |
| D6  | Quem cria: `comercial` + admins                                                                                                                                                                                                 | **Sim**                                                                                                                      |
| D7  | Sinal em tempo real por `realtime.send` (com fallback de polling)                                                                                                                                                               | **Sim**, validado na Etapa 0                                                                                                 |
| D8  | Migration RLS `20261004`                                                                                                                                                                                                        | **Pré-requisito de segurança** (decisão do usuário): aplicar e verificar antes do primeiro uso real; sem contornar em código |

## 4. Etapas (cada uma fecha com typecheck, lint, testes, regressão, responsividade e Design System)

0. **Spike sem produto**: `realtime.send`, inventário de consumidores de `clientes`/`campanha_tarefas`, caminhos de upload, `campanha_entregas`.
1. **Fundação**: migration, `demo-estados`, cenário, `demo.functions` (criar/reiniciar/encerrar/revogar/link) + testes.
2. **Isolamento no time**: ocultar demo nas listas e agregadores, guardas de efeitos externos, selo na campanha.
3. **Entrada no CRM**: diálogo de criação, card da Demo, menu `•••`.
4. **Cliente**: `PortalPaths`/`PortalApi` (sem mudar o portal real) → rotas `/demo/$token`, shell de demo, funções públicas.
5. **Sincronização e narrativa**: sinal, provider, linha do tempo e atividade.
6. **Fluxos completos**: influenciador (com substituto), roteiro, conteúdo, métricas e relatório.
7. **Endurecimento**: rate limit, expiração, revogação, documentação (runbook) e roteiro de aceitação.

---

## 5. Etapa 1 — Fundação (código pronto; **migration NÃO aplicada** e **nenhuma demo criada**)

**Bloqueio mantido:** a Demo não liga sem a `20261004` aplicada e verificada. Isso é imposto **em código**, não por convenção: `demo_prerequisites()` (criada na migration `20261005`) reporta, pelo catálogo do banco, se a `20261004` está aplicada e se as guardas existem; `createDemo`/`restartDemo` **recusam** com mensagem clara enquanto qualquer pré-requisito faltar (e também se a função nem existir). Nada contorna a ausência da migration.

### O que existe

| Peça                                                                                                     | Arquivo                                                   |
| -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Migration aditiva (`demo_sessions`, `demo_events`, guardas, `demo_apply_scenario`, `demo_prerequisites`) | `supabase/migrations/20261005000000_demo_operacional.sql` |
| Tipos, erros seguros                                                                                     | `src/lib/demo/demo-types.ts`                              |
| Token (32 bytes), validade de 14 dias, estado de acesso                                                  | `src/lib/demo/demo-token.ts`                              |
| Tabela de transições mapeada nas máquinas **existentes** (D2: sem "substituto")                          | `src/lib/demo/demo-estados.ts`                            |
| Cenário "campanha completa" — puro e determinístico                                                      | `src/lib/demo/cenario-campanha-completa.ts`               |
| Arquivos de exemplo (PDF/PNG gerados pelo código, deterministas)                                         | `src/lib/demo/demo-assets.server.ts`                      |
| Regras do ciclo de vida (criar, reiniciar, encerrar, revogar, renovar, resolver acesso)                  | `src/lib/demo/demo-service.ts`                            |
| Persistência (service-role) + compensação                                                                | `src/lib/demo/demo-service.server.ts`                     |
| Autorização (`comercial`)                                                                                | `src/lib/demo/demo-permission.ts`                         |
| Funções de servidor do **time**                                                                          | `src/lib/demo.functions.ts`                               |

Fora desta etapa (de propósito): ocultar a Demo nas telas do time (Etapa 2), UI do CRM (3), rotas `/demo/$token` e `PortalRuntime` (4), sinal em tempo real e linha do tempo (5).

### Defaults adotados onde não houve decisão explícita (revisáveis)

- Marcador em `clientes.data.demoSessionId`, não em coluna `is_demo`.
- Arquivos de exemplo **gerados por código** (PDF/PNG simples, sem dado real), publicados em `demo/<sessão>/` nos buckets existentes; D4 previa arquivos desenhados — troca-se sem mudar o contrato (`renderDemoAsset`).
- Gerenciar demo (criar, reiniciar, encerrar, revogar, renovar, copiar link) exige `comercial` (admins incluídos).
- Link recuperável pelo time (`getDemoLink`); a coluna `token` não tem `SELECT` para `authenticated`.
- Cliente e influenciadores da demo **sem e-mail/telefone**; campanha `semFaturamento` e sem `pagamento`: mesmo que a Demo vazasse para um agregado, não geraria receita nem custo.
- Nada de `realtime.send` por gatilho nesta etapa (a Etapa 5 usa o broadcast verificado na Etapa 0).

### Como foi verificado (e o que NÃO foi)

- **Testes automatizados (Vitest):** transições × funções reais do produto; token e expiração (fronteiras, fail-closed); cenário (contagens, determinismo, ids, isolamento, ausência de dado real/financeiro, coerência de estado, funciona com `applyInfluApproval`/`applyEntregaApproval`); renderizadores de PDF/PNG (xref, CRC, tamanho do stream); ciclo de vida completo com porta em memória (inclui "tudo ou nada", reinício sem apagar antes de aplicar, token revogado nunca revive, falhas indistinguíveis para o cliente, auditoria best-effort); adaptador Supabase com cliente falso (ordem da compensação, escopo do prefixo de storage, erro sem vazar detalhe); permissão (fail-closed); **teste estático da migration** ligando SQL e TypeScript (colunas, tipos de evento, parâmetros da RPC, tabelas limpas no reinício, `token` fora do `GRANT`, REVOKEs, RLS só interna, índice parcial, guarda do NPS = função original + 1 condição). Os testes estáticos foram **provados capazes de falhar** (6 mutações do SQL, todas detectadas).
- **Parser do Postgres (libpg-query 18):** o SQL e os corpos plpgsql da migration são sintaticamente válidos. O parser **não** resolve campos de `NEW`/`OLD`, tipos nem privilégios.
- **NÃO verificado:** execução no Postgres (não há instância aqui). Antes de usar: aplicar a `20261004`, depois a `20261005`, e rodar o roteiro abaixo.

### Roteiro de verificação da `20261005` (SQL Editor — tudo dentro de transação **revertida**)

```sql
-- A) pré-requisitos (todos devem ser true depois de aplicar a 20261004 e a 20261005)
select public.demo_prerequisites();

-- B) fumaça: cria sessão, aplica um cenário mínimo, confere guardas — e DESFAZ tudo
begin;
insert into public.organizations (id, name, type, status)
values ('aaaaaaaa-0000-4000-8000-000000000001', '__teste_demo', 'client', 'suspended');
insert into public.demo_sessions (id, cliente_id, campanha_id, organization_id, token, token_expires_at)
values ('aaaaaaaa-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000003',
        'aaaaaaaa-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001',
        repeat('T', 43), now() + interval '1 day');

select public.demo_apply_scenario('aaaaaaaa-0000-4000-8000-000000000002', jsonb_build_object(
  'cliente', jsonb_build_object(
    'id', 'aaaaaaaa-0000-4000-8000-000000000003', 'empresa', 'Teste', 'status', 'active',
    'demoSessionId', 'aaaaaaaa-0000-4000-8000-000000000002',
    'campanhas', jsonb_build_array(jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000004', 'nome', 'C'))),
  'influenciadores', jsonb_build_array(jsonb_build_object(
    'id', 'aaaaaaaa-0000-4000-8000-000000000005',
    'data', jsonb_build_object('nome', 'Fulano', 'status', 'APROVADO',
                               'entregas', '[]'::jsonb, 'redes', '[]'::jsonb)))));

-- esperado: influs = 1, clientes = 1, nps_deve_ser_0 = 0  (a guarda ignorou a campanha de demo)
select (select count(*) from public.campanha_influenciadores where campanha_id = 'aaaaaaaa-0000-4000-8000-000000000004') as influs,
       (select count(*) from public.clientes where id = 'aaaaaaaa-0000-4000-8000-000000000003') as clientes,
       (select count(*) from public.campanha_nps_influenciador where campanha_id = 'aaaaaaaa-0000-4000-8000-000000000004') as nps_deve_ser_0;

-- reiniciar com o mesmo id não duplica (continua influs = 1)
select public.demo_apply_scenario('aaaaaaaa-0000-4000-8000-000000000002', jsonb_build_object(
  'cliente', jsonb_build_object(
    'id', 'aaaaaaaa-0000-4000-8000-000000000003', 'empresa', 'Teste', 'status', 'active',
    'demoSessionId', 'aaaaaaaa-0000-4000-8000-000000000002',
    'campanhas', jsonb_build_array(jsonb_build_object('id', 'aaaaaaaa-0000-4000-8000-000000000004', 'nome', 'C'))),
  'influenciadores', jsonb_build_array(jsonb_build_object(
    'id', 'aaaaaaaa-0000-4000-8000-000000000005',
    'data', jsonb_build_object('nome', 'Fulano', 'status', 'APROVADO', 'entregas', '[]'::jsonb, 'redes', '[]'::jsonb)))));
select count(*) as influs_depois_do_reinicio from public.campanha_influenciadores
where campanha_id = 'aaaaaaaa-0000-4000-8000-000000000004';

-- o marcador do cliente não pode ser removido (esperado: NOTICE "ok: O marcador…")
do $$ begin begin
  update public.clientes set data = data - 'demoSessionId' where id = 'aaaaaaaa-0000-4000-8000-000000000003';
  raise exception 'FALHOU: o marcador foi alterado';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: %', sqlerrm;
end; end $$;

-- cliente marcado como demo SEM sessão correspondente é recusado (esperado: NOTICE "ok: Cliente de demonstração…")
do $$ begin begin
  insert into public.clientes (id, organization_id, data)
  values ('aaaaaaaa-0000-4000-8000-0000000000ff', 'aaaaaaaa-0000-4000-8000-000000000001', '{"demoSessionId":"x"}');
  raise exception 'FALHOU: aceitou marcador sem sessão';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: %', sqlerrm;
end; end $$;

-- payload de OUTRA sessão/campanha é recusado (esperado: NOTICE "ok: O cliente do cenário…")
do $$ begin begin
  perform public.demo_apply_scenario('aaaaaaaa-0000-4000-8000-000000000002',
    '{"cliente":{"id":"bbbbbbbb-0000-4000-8000-000000000001","demoSessionId":"x","campanhas":[]}}'::jsonb);
  raise exception 'FALHOU: aceitou cliente de outra sessão';
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
  raise notice 'ok: %', sqlerrm;
end; end $$;

-- o token não é legível por contas autenticadas (esperado: NOTICE "ok: token protegido")
set local role authenticated;
do $$ begin begin
  perform token from public.demo_sessions limit 1;
  raise exception 'FALHOU: token legível';
exception when insufficient_privilege then raise notice 'ok: token protegido';
end; end $$;
reset role;
rollback;   -- nada do teste permanece
```

### Rollback da migration `20261005`

Só depois de encerrar e **apagar** quaisquer demos já criadas (`delete from public.clientes where data ? 'demoSessionId'`, mais as organizações e linhas `campanha_*` delas). A ordem importa: restaurar a função do NPS **antes** de remover `demo_sessions`.

```sql
drop trigger if exists clientes_demo_marker_guard on public.clientes;
drop function if exists public.clientes_demo_marker_guard();

-- função original (20261001120000)
create or replace function public.ensure_campanha_nps_influenciador()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if NEW.data->>'status' = 'APROVADO' then
    insert into public.campanha_nps_influenciador (campanha_id, influenciador_id, token)
    values (NEW.campanha_id, NEW.id, encode(gen_random_bytes(16), 'hex'))
    on conflict (campanha_id, influenciador_id) do nothing;
  end if;
  return NEW;
end;
$$;

drop function if exists public.demo_apply_scenario(uuid, jsonb);
drop function if exists public.demo_prerequisites();
drop table if exists public.demo_events;
drop table if exists public.demo_sessions;
drop function if exists public.demo_sessions_guard();
```

---

## 6. Etapa 2 — Isolamento no time (código pronto; nada commitado; nenhuma Demo existe no banco)

A Demo passa a ficar **fora de tudo que o time lê em conjunto** e continua abrindo pelo detalhe da campanha. Fonte única do "isto é demo?": o marcador `clientes.data.demoSessionId` (e, daí, o conjunto de `campanhas[]` desses clientes) — sem segunda consulta e sem janela de falha de rede.

### O que mudou (vetor → correção)

| Vetor (Etapa 0)                                                                                | Correção                                                                                                                                                                                                                                        | Onde                                                           |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `useClientes()` e 19 consumidores (listas, KPIs, Financeiro, Início, chat, tarefas…)           | o store esconde: `get()` só tem clientes reais; `getAll()`/`useClientesComDemo()` incluem a Demo                                                                                                                                                | `table-array-store.ts` (opção `isHidden`), `clientes-store.ts` |
| `set()` apagaria a Demo se o `updater` fosse montado a partir de `get()`                       | o `updater` continua recebendo a lista **completa**; `set()` **nunca apaga** item oculto                                                                                                                                                        | `table-array-store.ts`                                         |
| Carga global dos `campanha_*` (tarefas, participações, Banco de Influenciadores, Time, Início) | `getAllCampanhaInflus`/`getAllCampanhaTarefas` excluem as campanhas de demo (mesma referência do mapa quando não há demo); acesso por campanha segue intacto                                                                                    | `campanha-scoped-store.ts`, `demo/demo-visibility.ts`          |
| Assinantes que agregam                                                                         | `on*Change` também avisa quando o conjunto de campanhas de demo muda                                                                                                                                                                            | `campanha-scoped-store.ts`                                     |
| Sino do `AppShell` (aprovações do cliente, "Nova solicitação", métricas pendentes, toasts)     | ignora eventos e linhas de campanha de demo                                                                                                                                                                                                     | `AppShell.tsx`                                                 |
| `performance_events` (tarefa concluída na demo contaria para uma pessoa)                       | `recordPerformanceEvent` ignora tarefa/subtarefa de campanha de demo                                                                                                                                                                            | `performance-events-store.ts`                                  |
| Web Push aos admins (`notifyTeamEntregaResponse`)                                              | a função recebe o cliente e retorna se for demo (cobre os dois portais)                                                                                                                                                                         | `cliente-link.functions.ts`, `portal-auth.functions.ts`        |
| E-mail                                                                                         | `sendEmail` (gargalo único) recusa destinatário `.invalid` antes de ler config ou chamar o provedor; seletor de destinatários exclui a Demo                                                                                                     | `email-provider.server.ts`, `email-campaigns.functions.ts`     |
| Tokens públicos de produção                                                                    | as 3 varreduras (`publicToken`, `signupToken`, link de NPS) pulam a Demo                                                                                                                                                                        | `demo/demo-scans.ts` + 3 `*.functions.ts`                      |
| Convite de acesso                                                                              | recusa a organização de uma demo                                                                                                                                                                                                                | `organization-invites.functions.ts`, `demo/demo-guards.ts`     |
| Detalhe da campanha                                                                            | abre a Demo por `openId` (handoff do lead, Etapa 3), com o selo "Ambiente de demonstração"; "Link do cliente" e "Página de inscrição" já ficam desativados (não há `publicToken`); **Arquivar/Excluir desativados** (o ciclo de vida é da Demo) | `CampanhasSection.tsx`, `components/demo/DemoChip.tsx`         |

### Como foi verificado

- **Suíte:** typecheck, lint (0 erros; 98 avisos, os mesmos de antes), 1031+ testes, build de produção.
- **Testes novos desta etapa:** o store com Supabase simulado (itens ocultos: leitura, edição, nunca apagar, Realtime, estabilidade do snapshot) e o caminho **sem** `isHidden` (regressão); agregados e assinantes do store de campanha; ledger de desempenho; push; `sendEmail`; varreduras de token; seletor de e-mail; guarda de convite; selo.
- **Mutação:** 12 regressões plausíveis introduzidas de propósito (filtros removidos, guardas removidas, memo quebrado…); **todas** reprovadas pelos testes; arquivos restaurados.
- **Navegador (página temporária, já removida):** com um cliente real e uma Demo em memória, a lista mostra **1 campanha** (KPIs 1/1) e nenhum vestígio da Demo; o atalho do lead abre o detalhe com o selo ao lado do status; "Link do cliente" e "Página de inscrição" aparecem desativados. Sem erros de console (o aviso de hidratação de `<html class="dark">` já existia).

### Limites conhecidos (não são bugs desta etapa)

- A Demo continua **legível** por qualquer membro com permissão em `clientes`/`campanhas` (RLS) e chega ao cache deles; está **oculta nas telas**, não inacessível. É o desejado: o time precisa operá-la.
- Notificações e agregados dependem de o cliente de demo já estar no cache; uma ação do cliente que chegue antes dessa linha seria o único caso de borda (a Demo nasce no servidor, bem antes do primeiro acesso do cliente).
- Não há botão de "Encerrar/Reiniciar" na tela ainda (Etapa 5); por ora só pelas funções de servidor.
- Rodar a UI contra o banco vivo continua impossível: as migrations `20261004`/`20261005` não estão aplicadas, então nenhuma Demo pode ser criada.
