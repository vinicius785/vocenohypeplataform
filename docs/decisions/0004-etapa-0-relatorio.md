# 0004 · Demo operacional — Relatório da Etapa 0 (auditoria técnica, sem produto)

**Data:** 2026-10-04 · **Escopo:** somente auditar, testar pontos técnicos e documentar. Nenhum código de produto, tabela ou componente definitivo foi criado; o fluxo real de campanhas não foi tocado. Complementa [`0004-demo-operacional.md`](./0004-demo-operacional.md) (plano validado).

> **Estado: a implementação da Demo está BLOQUEADA antes do primeiro uso real** até que a migration `20261004000000_restrict_internal_data_to_internal_members.sql` esteja aplicada **e verificada** no banco vivo (item 7). Esta Etapa 0 não contorna essa ausência em código.

## Como cada afirmação foi obtida

| Rótulo                   | Significa                                                                                             |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| **TESTADO**              | executado contra o projeto Supabase real (somente leitura, ou envio a tópico descartável)             |
| **LIDO**                 | confirmado lendo código/migrations do repositório                                                     |
| **NÃO VERIFICÁVEL AQUI** | exige SQL no banco vivo; o ambiente só alcança o PostgREST (`public`). Há script de verificação no §A |

Declaração de uso: o `.env` local contém `SUPABASE_SERVICE_ROLE_KEY` (o `CLAUDE.md` diz que falta — está desatualizado). Usei essa chave **só para leitura** (`select … limit 1` em 109 tabelas, 2 funções puras com UUID zerado) e para um broadcast HTTP a um tópico aleatório descartável. Nada foi gravado em tabela.

---

## 1. `realtime.send` / sinal em tempo real

**TESTADO** (script descartável fora do repositório; re-executado hoje):

| Teste                                                                   | Resultado                                                          |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Cliente **anônimo** (só chave pública) assina canal público             | `SUBSCRIBED`                                                       |
| Anônimo → anônimo por broadcast                                         | entregue, **29 ms**                                                |
| Servidor (service-role) → anônimo por HTTP `/realtime/v1/api/broadcast` | **202**, entregue em **113 ms**                                    |
| Chave pública também consegue disparar por HTTP                         | **202** e entregue (**qualquer um com a chave pode forjar sinal**) |
| Canal **privado** com chave pública (Realtime Authorization)            | `CHANNEL_ERROR` (recusado)                                         |
| `postgres_changes` para anônimo                                         | não entrega (RLS) — já era sabido, confirmado por leitura          |

**NÃO VERIFICÁVEL AQUI:** se a **função SQL** `realtime.send(...)` existe/é executável no banco (o `/pg` do projeto devolve 404; o PostgREST só expõe `public`). Teste pronto no §A (bloco 1, dentro de transação revertida).

**Conclusão — `realtime.send` não é pré-requisito.** Há caminho verificado para os dois sentidos:

- **Cliente → Time**: as funções públicas da Demo gravam em `campanha_influenciadores`; os stores do time **já** assinam `postgres_changes`. Nada novo.
- **Time → Cliente**: (a) o navegador do time envia **um broadcast** no tópico da demo depois de gravar (verificado: 29 ms), pelo mesmo ponto único onde o store já grava; e/ou (b) `realtime.send` por gatilho, se o §A provar que existe. Em ambos, o provider da demo faz **um** `reload()` com debounce; polling de 20 s (aba visível) fica de rede de segurança.
- **Desenho do sinal:** payload **sem dado** (só "mudou"). Como qualquer um com a chave pública pode forjar sinal, o pior caso é um `reload()` extra. O tópico não é o token: usa `realtime_key` aleatória própria da sessão (coluna legível só pelo time e pelo servidor).

## 2. Inventário de consumidores de `clientes` e `campanha_tarefas` (o que faria a Demo aparecer em telas reais)

**LIDO.** Há **três** vetores, não um:

**(a) `useClientes()` / store de clientes** — 19 arquivos usam o hook; 29 importam `clientes-store`:
AppShell, InicioDashboard, ClientesSection, CampanhasSection, FinanceiroSection, MovimentacoesTab, AdvancedFilterBar, MoveTaskDialog, ChatV2Composer, use-chat-v2-data, InfluencerBancoV2Page, use-time-data, PublishSidebar, ClienteFormSheet, ClienteFiltersBar, ClienteDetailPage, task-directory, financeiro-entries, clientes-store.

**(b) Carga global dos `campanha_*` — achado novo, o mais sensível.** `initCampanhaScopedSync()` (`_authenticated/route.tsx`) baixa a tabela **inteira** de `campanha_influenciadores`, `campanha_tarefas`, `campanha_documentos`, `campanha_cronograma` (todas as campanhas) para o cache de **todo** membro do time, com Realtime e _resync_ periódico. Quem lê "tudo": `getAllCampanhaInflus` (Banco de Influenciadores V2 / participações), `getAllCampanhaTarefas` (AppShell, InicioDashboard, use-time-data, task-aggregation, task-directory). Ou seja: filtrar só `useClientes()` **não basta** — tarefas e participações da Demo vazariam para Time, Início e Banco de Influenciadores.

**(c) Realtime/notificações do AppShell** — o sino assina `campanha_tarefas` (INSERT, tag `Cliente` → "Nova solicitação") e `campanha_influenciadores` (UPDATE → avisos de aprovação). Reagem a **qualquer** campanha e resolvem o nome via `useClientes()`; com a Demo oculta, apareceria "Nova solicitação" **sem empresa** (e um _toast_).

**Servidor — `.from("clientes")`: 15 usos em 7 arquivos; `.from("campanha_tarefas")`: 3 diretos.**

| Uso                                                                                                                     | Tipo                               | Precisa excluir a Demo?                                              |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------- |
| `cliente-link:42` `findClienteByToken` (varre **todos** os clientes comparando `publicToken`)                           | varredura                          | **Sim**                                                              |
| `campanha-nps-influenciador:56` `findCampanhaNomeEPeriodo`                                                              | varredura por `campanhaId`         | **Sim**                                                              |
| `inscricao-campanha:31` `findCampanhaBySignupToken`                                                                     | varredura por `signupToken`        | **Sim**                                                              |
| `email-campaigns:460` `listClientesForPicker` (cliente com e-mail → destinatário)                                       | listagem                           | **Sim**                                                              |
| `cliente-link:67` `findClienteByOrganizationId`; `portal-auth:639/675/704`; `cliente-link:1189/1225` (NPS de relatório) | por id/org                         | Não (a Demo usa funções próprias; a org é `suspended` e sem membros) |
| `organization-invites:277/338`                                                                                          | por id                             | Não, mas convite deve **recusar** org de demo                        |
| `clientes.functions:60/89/107`                                                                                          | criar/desativar token              | Não                                                                  |
| `AppShell:1546`, `cliente-link:1110`, `portal-auth:570` (`campanha_tarefas`)                                            | leitura global / insert de demanda | AppShell **sim**; demais não (demanda não existe na Demo)            |
| `move-task.ts` (`loadCampanhaTarefas/save…`)                                                                            | mover tarefa entre campanhas       | **Sim** (destino/origem demo)                                        |

**Efeito colateral lateral:** `performance_events` (ledger de desempenho do time) é gravado no navegador por `recordPerformanceEvent` (TaskBoard, MeetingSummaryDialog). Concluir tarefa de campanha Demo contaria para o desempenho de uma pessoa real.

**Risco estrutural encontrado em `createTableArrayStore`:** `set(updater)` **apaga do banco** todo item que estava no cache e não está no array resultante, e o `init` seleciona só a coluna `data`. Logo:

1. o marcador de Demo precisa estar **dentro de `data`** (`demoSessionId`), não só em coluna `is_demo` (o cliente nunca vê colunas);
2. o filtro **não pode** ficar em `useClientes()` (devolver array novo quebra `useSyncExternalStore` e, pior, um `set` com a lista filtrada **apagaria a Demo**). Tem de ficar **no store**: `get()` devolve a visão sem demo (snapshot memoizado por referência do cache) e `set()` preserva as linhas ocultas;
3. `ClienteFormSheet` reconstrói o objeto campo a campo (linha 370 copia `publicToken`) e perderia o marcador — por isso a Demo não é editável por esse formulário (D1: oculta das listas).

## 3. Mapa de todos os caminhos de upload

**LIDO.**

| Origem                                                                                 | Bucket / caminho                   | Quem escreve                        | Observação                                                        |
| -------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| Time — anexos de entrega (`InfluencerBoard` ~5431–5488)                                | `entrega-anexos/${uid}/…`          | navegador (RLS: insert por `owner`) | URL assinada de **1 ano** gravada em `EntregaAnexo.url` (no JSON) |
| Time — relatório mensal (`relatorio-mensal.ts`)                                        | `relatorios-mensais/${uid}/…`      | navegador                           | guarda `storagePath`; URL de 1 h é gerada no servidor             |
| Portal por token — briefing do influenciador                                           | `…/portal/${token}/…`              | servidor (service-role)             |                                                                   |
| Portal V2 — briefing                                                                   | `…/portal-app/${organizationId}/…` | servidor (service-role)             |                                                                   |
| Inscrição pública de influenciador                                                     | `…/inscricao/…`                    | servidor                            | media kit PDF/JPG/PNG                                             |
| Portal V2 — avatar                                                                     | bucket `avatars`                   | navegador (sessão)                  | fora da Demo (Configurações oculta)                               |
| Outros (`task-attachments`, `financeiro-anexos`, `aeo-evidencias`, `chat-attachments`) | —                                  | time                                | fora do escopo da Demo                                            |

**Implicação para a Demo (D4):** `buildClienteLinkData` **só** sabe assinar relatório por `storagePath` no bucket `relatorios-mensais`. Arquivos estáticos do repositório exigiriam ramificar essa função; o caminho aditivo é a criação da Demo (service-role) **copiar** os PDFs/imagens de exemplo para um prefixo `demo/<sessionId>/…` e gravar `storagePath`/`url` normais — sem tocar `buildClienteLinkData`. O visualizador V2 faz `fetch(url)` e `downloadCrossOriginFile`, que funcionam com URL assinada. Esses prefixos ficam sob as policies abertas do §7 — mais um motivo para a migration ser pré-requisito.

## 4. `campanha_entregas` — confirmação

**TESTADO + LIDO.** É um **espelho não utilizado e desatualizado**: **212** linhas contra **228** entregas dentro de `campanha_influenciadores.data.entregas[]`; **nenhum** `from("campanha_entregas")` em `src/`; `campanha_entrega_versoes`/`_eventos` idem. **Fonte da verdade = `campanha_influenciadores.data`.**

Como o estado é persistido hoje (tudo no JSON do influenciador): `Entrega.stage` (`ROTEIRO_PRODUCAO → ROTEIRO_APROVACAO → PRODUCAO | ROTEIRO_AJUSTES → CONTEUDO_APROVACAO → PUBLICACAO | CONTEUDO_AJUSTES → PUBLICADA`), motivos em `roteiroReprovacao`/`conteudoReprovacao`, versões em `anexos[].versao`, histórico em `Influ.activityEvents` (ator `cliente|equipe`) e `Influ.activity`. A Demo **não usa** `campanha_entregas`.

## 5. Gatilhos e efeitos colaterais (criar cliente, influenciador, entrega, aprovação, conteúdo, roteiro)

**LIDO nas migrations. Correção importante ao plano:** os gatilhos de e-mail `email_flows_*` e `enroll_email_flow` foram **removidos** por `20260826210000_email_campaigns_v2.sql`, e as tabelas `email_flows`/`email_flow_enrollments` **não existem** no banco vivo (**TESTADO**, `PGRST205`). O plano original previa guardar `email_flows_clientes_trigger` — **item obsoleto**. E-mail hoje é por **campanha de e-mail com destinatários escolhidos** (`email_campaign_recipients`, origem `cliente|lead|banco_influenciador|manual`), enviado pelo cron.

| Operação                                                      | Gatilhos de banco (pelas migrations)                                                                                                                                                                                                                     | Efeitos de aplicação                                                                               |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Criar **cliente**                                             | `validate_cliente_status` e `validate_campanha_status` (BEFORE INSERT/UPDATE: cliente `negotiating/active/closed/archived`; campanha `negotiation/active/completed/archived`), `clientes_set_updated_at`, `clientes_enforce_archive_admin_only` (UPDATE) | `createClienteComOrganizacao` cria antes uma `organizations` (`client`, `active`) por service-role |
| Criar/alterar **influenciador** (`campanha_influenciadores`)  | `sync_scoped_table_data_id` (força `data.id = id`), `…_set_updated_at`, **`ensure_campanha_nps_influenciador`** (AFTER INSERT/UPDATE: status `APROVADO` ⇒ cria linha em `campanha_nps_influenciador` com **token público**)                              | —                                                                                                  |
| **Aprovar/recusar influenciador**                             | os mesmos                                                                                                                                                                                                                                                | grava `activityEvents`; **não** envia push                                                         |
| **Roteiro** / **conteúdo** / **entrega** (mudança de `stage`) | os mesmos de `campanha_influenciadores`                                                                                                                                                                                                                  | `notifyTeamEntregaResponse` ⇒ **Web Push a todos os admins** (nos dois portais)                    |
| Tarefa da campanha                                            | `…_set_updated_at`, `sync_scoped_table_data_id`                                                                                                                                                                                                          | `recordPerformanceEvent` (navegador)                                                               |

**Cron/saídas externas (todas auditadas):** e-mail só em `sendEmail` (`email-provider.server.ts`, Resend) — chamado pelo cron e por `client-access.functions`; push só em `deliverPush` (`push.functions.ts`); webhooks de saída só em `comercial.functions` (`lead.*`) e `blog-webhook`; Google Calendar só em reuniões; WhatsApp são **links `wa.me`** na interface, sem API. Crons registrados: `email-flows` e `google-calendar-sync` — nenhum toca campanha.

## 6. Onde as guardas da Demo precisam existir

**Banco**

- G1 `ensure_campanha_nps_influenciador`: `CREATE OR REPLACE` com saída antecipada se a campanha pertence a uma demo.
- G2 `demo_sessions`/`demo_events`: RLS só para interno (`is_internal_team_member`/`has_permission`); **escrita só service-role**; coluna `token` com `REVOKE SELECT`; índice único parcial "uma demo ativa por lead".
- G3 Marcador imutável: gatilho BEFORE UPDATE em `clientes` impede incluir/remover `data.demoSessionId` depois do insert.
- G4 `demo_apply_scenario`: `SECURITY DEFINER`, `EXECUTE` só `service_role`, **recusa** escrever em qualquer linha cujo `cliente_id/campanha_id` não seja o da sessão.
- G5 Organização da demo `type='client'`, `status='suspended'`, **sem membros**: `user_can_access_campanha` (exige org `active` + membro) e as policies "org members read own …" nunca a liberam. **LIDO.**

**Servidor**

- S1 **Ponto único** `resolveDemoContext(token)`: token ⇒ sessão ativa, não expirada, não revogada, não encerrada ⇒ `{cliente, campanha}`. Toda função pública da Demo passa por ele; mesma mensagem genérica para todas as falhas.
- S2 Rejeitar `campanhaId`/`influencerId` fora do contexto (`assertCampanhaInCliente`, `loadInfluRow` já escopam por `campanha_id`).
- S3 `notifyTeamEntregaResponse`: sair se demo (as funções da Demo nem a chamam).
- S4 **`sendEmail` é o gargalo único de e-mail**: recusar destinatário de demo (domínio reservado `.invalid`, RFC 2606) — cobre cron, convites e qualquer caminho futuro; `listClientesForPicker`/seletor de leads excluem a Demo; cliente e influenciadores da Demo **sem e-mail real**.
- S5 `client-access.functions` (convite) recusa organização de demo.
- S6 As 3 varreduras (`findClienteByToken`, `findCampanhaBySignupToken`, `findCampanhaNomeEPeriodo`) excluem a Demo; a Demo **não tem** `publicToken`/`signupToken`.
- S7 `recordPerformanceEvent`: ignorar tarefa de campanha demo (ou a Demo não expõe ferramenta de tarefas).
- S8 `checkRateLimit` nas funções públicas (resolve SC-03 só para a Demo).
- S9 Ator fixo "Cliente (demonstração)" nas atividades — **não** o `supabase.auth.getUser()` de quem abre o link (um membro do time com sessão apareceria como cliente).

**Front (time)**

- F1 Store de clientes: visão sem demo + preservar linhas ocultas no `set` (§2).
- F2 Stores `campanha_*`: excluir ids de campanha demo em `fetchAll`, nos handlers de Realtime, no _resync_ e em `getAll*` — o conjunto de ids vem de `demo_sessions` (leitura interna) e é carregado **antes** do `init`.
- F3 AppShell (sino): ignorar eventos de campanha demo. F4 Sem link de inscrição/`signupToken` para demo.

## 7. Migration RLS pendente — status e dependências

**Conteúdo (LIDO):** `20261004000000_restrict_internal_data_to_internal_members.sql` troca `USING (true)` por `is_internal_team_member(auth.uid()) OR is_admin(auth.uid())` em `pricing_settings`, `task_tags`, `aeo_prompts/respostas/rodadas`, `email_sends`, `email_unsubscribes`, `performance_events/settings`, `reunioes_disponibilidade`, `blog_likes/comments`, `shared_state` (inclusive o UPDATE aberto) e nas policies de storage de `entrega-anexos`, `financeiro-anexos`, `relatorios-mensais`, `aeo-evidencias`, `task-attachments`; fixa `search_path` em `enforce_cliente_archive_admin_only`; cria o índice parcial `organization_members_user_id_idx`. Rollback completo em `docs/security/rls-internal-only.md`.

**Status: NÃO APLICADA** (o próprio documento diz isso; a migration nunca foi executada). Evidência adicional **TESTADA** de que o banco vivo está **atrás do repositório**: as tabelas `bug_report_events/comments/attachments/diagnostics`, criadas por `20261003100000_central_de_problemas.sql`, **não existem** no banco vivo — ou seja, a migration de **03/out** também está pendente (inferência: o banco está, no máximo, em `20261002…`).

**Dependências (todas conferidas):**

- Tabelas referenciadas: as 13 **existem** no banco vivo (**TESTADO**).
- Funções: `is_internal_team_member` e `is_admin` **existem e executam** (**TESTADO**, chamadas puras com UUID zerado ⇒ `false`).
- `enforce_cliente_archive_admin_only` (vem de `20260930110000`): provável, pois migrations posteriores já estão vivas — **NÃO VERIFICÁVEL AQUI** (o `ALTER FUNCTION` falha se não existir, derrubando a migration inteira).
- **Risco de aplicação:** se o aplicador roda em ordem e a de **03/out** falhar, a de **04/out** não entra. Conferir `supabase_migrations.schema_migrations` (§A bloco 5).
- **Limite da migration:** só substitui policies pelo **nome**. Qualquer policy aberta com outro nome sobrevive — por isso o bloco 3 do §A lista as que sobram.

**Dependência real da Demo (achado honesto):** pelas migrations, `clientes` e `campanha_*` já exigem `has_permission(...)` e **não** estão entre as tabelas abertas; a Demo não usa sessão de cliente. Mesmo assim, **trato a migration como pré-requisito de segurança, como você determinou**: os arquivos da Demo vão para os mesmos buckets cujas policies hoje valem para qualquer `authenticated`, e `shared_state` hoje aceita UPDATE de qualquer logado.

## 8. Estratégia final do token `/demo/$token`

**Padrão atual (LIDO):** `Cliente.publicToken` fica **dentro do JSON** do cliente; a busca **carrega todos os clientes** e compara com `===` em JavaScript; sem expiração, sem registro de revogação (revogar = apagar o campo), sem rate limit (SC-03 pendente: `checkRateLimit` só protege login, MFA e convites). `signupToken` é `randomUUID` sem hífens. Há `noindex` e erros genéricos (`throwSafeDbError`).

**Veredito: reutilizar o _padrão de acesso_ (token → service-role escopado → `ClienteLinkData`), não o _armazenamento_.**

- 32 bytes aleatórios (`crypto.randomBytes`, base64url, ~43 caracteres), único; coluna em `demo_sessions` com `REVOKE SELECT` (o time recupera o link por função de servidor com checagem de permissão — assim o link pode ser copiado de novo).
- Busca por **índice único** (não varredura). Ordem de checagem: existe → `status='active'` → `access_revoked_at is null` → `token_expires_at > now()`. **Mesma resposta** ("Link inválido ou expirado.") para qualquer falha — sem oráculo.
- Validade 14 dias, **renovável** (nova data; ou novo token se foi revogado). Revogar não apaga a campanha.
- Página com `noindex, nofollow`, `Referrer-Policy: no-referrer` (token no caminho vaza por _referer_) e `Cache-Control: no-store` nas respostas.
- `checkRateLimit` com bucket por prefixo do token e um bucket global `demo-public`. Falha aberta é aceitável: o que protege é a entropia de 256 bits, o limite é piso anti-abuso.
- Sem cookie e sem sessão Supabase: o token vai em **todas** as chamadas, como no portal por token. Último acesso registrado em `last_client_access_at`.

## 9. Estratégia final do Portal V2

**LIDO.** `/portal-v2`: 145 ocorrências em 54 arquivos — **68** nos arquivos de rota, **19** em testes, **58** no código de aplicação (**41** URLs/navegação + **17** chaves de cache/`localStorage`/comentários). _(O plano dizia 56; a contagem por critério diferente dá 58. Não muda a conclusão.)_

**Classificação do V2**
| Dependência | Onde | Na Demo |
|---|---|---|
| **Já consome contexto** (`usePortalSessionData`) | `InicioV2`, `CampanhasV2`, `CampanhaDetailV2`, `ArquivosV2`, `RelatoriosV2`, `ClientCampaign*`, `ClientInfluencer*`, `NotificationsPopover`, `derive.ts` (puro) | **sem mudança** |
| Caminhos `/portal-v2` fixos | 14 arquivos (`PortalV2Shell`, `CampanhasV2`, `ArquivosV2`, `RelatoriosV2`, `InicioV2`, `CampanhaDetailV2`, `ClientCampaignProgressList/Deliverables/Header`, `ClientSidebarProfile`, `ClientSettingsLayout`, `derive.ts`, `nps-guard.ts`) | via `PortalPaths` |
| Server functions `*Session` direto | `ClientInfluencerStatusActions`, `ClientInfluencerDeliverables`, `ClientInfluencerComments`, `ClientCampaignResources`, `RelatoriosV2`, `PendingNpsGate`; **loader** da rota e **provider** (`getPortalDataForSession`) | via `PortalApi` |
| **Sessão Supabase** direta | `PortalV2Shell` (`getSession`, `getUser`, `resolveUserEnvironment`), `InicioV2`, `ClientSidebarProfile`, 7 telas/hooks de Configurações | via `identity` + `capabilities` (Configurações some) |
| **Realtime** | provider assina `postgres_changes` (não chega a anônimo) | `source` com broadcast + polling |
| IDs reais | só `campanhaId`/`influencerId` vindos do **dado**; nenhum id de organização na UI | nenhuma mudança |

**Abstrações aditivas exatas** (o padrão é o comportamento atual: o V2 real não muda um byte)

```ts
// features/client-portal-v2/runtime/portal-runtime.tsx (novo)
type PortalPaths = {
  inicio(): string;
  campanhas(): string;
  relatorios(search?): string;
  arquivos(search?): string;
  campanha(id: string, search?: Record<string, string | undefined>): string;
  isActive(pathname: string, item: "inicio" | "campanhas" | "relatorios" | "arquivos"): boolean;
  configuracoes: (() => string) | null; // null ⇒ item some
};
type PortalApi = { respondInflu; reopenInflu; respondEntrega; addComentario; freshRelatorioUrl };
type PortalCapabilities = { settings; nps; switchEnvironment; profileMenu; demands; bugReport };
type PortalIdentity = { name: string; secondary: string; email: string };
type PortalRuntime = {
  paths: PortalPaths;
  api: PortalApi;
  capabilities: PortalCapabilities;
  identity: PortalIdentity;
  banner?: ReactNode;
};
// Provider de dados ganha `source: { load(); subscribe(onSignal); pollMs }` (padrão = o atual).
```

- O contexto tem **default = runtime real**, então cada arquivo migra isoladamente e os testes existentes seguem verdes. `derive.ts` ganha parâmetro `paths` com default `/portal-v2` (os 5 `href` testados continuam iguais).
- Rotas: `routes/demo.$token/` (≈9 arquivos de ~10 linhas) montam **as mesmas páginas**; `useParams({ from })` fica na rota, não na página.
- Navegação: `navigate({ href })` aceita caminho relativo e **não** recarrega o documento — **LIDO** em `router-core` (`router.js:252` resolve `href` interno; `:463–464` só força documento com _scheme_ ou `reloadDocument`). Confirmar por execução no 1º dia da Etapa 4.
- Demo **não monta**: NPS mensal, troca de ambiente, Configurações, avatar, demandas, bug report. Ator fixo "Cliente (demonstração)" (S9).

## 10. Arquivos prováveis por etapa

| Etapa             | Novos                                                                                                                                                                    | Alterados                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Fundação        | migration `…_demo_operacional.sql`; `lib/demo/{cenario-campanha-completa,demo-estados,demo-timeline,tipos}.ts`; `lib/demo.server.ts`; `lib/demo.functions.ts` (+ testes) | `integrations/supabase/types.ts` (gerado)                                                                                                                                                                                                                                                                                                                                                                                                            |
| 2 Isolamento      | —                                                                                                                                                                        | `lib/table-array-store.ts`, `lib/clientes-store.ts`, `lib/scoped-table-store.ts`, `lib/campanha-scoped-store.ts`, `components/AppShell.tsx`, `lib/move-task.ts`, `lib/performance-events-store.ts`, `lib/email-provider.server.ts`, `lib/email-campaigns.functions.ts`, `lib/cliente-link.functions.ts`, `lib/inscricao-campanha.functions.ts`, `lib/campanha-nps-influenciador*.functions.ts`, `lib/client-access.functions.ts`, migration (G1, G3) |
| 3 CRM             | `comercial/{DemoCreateDialog,LeadDemoCard}.tsx`                                                                                                                          | `comercial/LeadDrawer.tsx`, `ComercialSection.tsx`                                                                                                                                                                                                                                                                                                                                                                                                   |
| 4 Cliente         | `features/client-portal-v2/runtime/*`, `routes/demo.$token/**`, `lib/demo-public.functions.ts`                                                                           | os 14 arquivos V2 acima; `components/portal/portal-session-context.tsx`; `routeTree.gen.ts` (gerado)                                                                                                                                                                                                                                                                                                                                                 |
| 5 Sinal/narrativa | `CampaignDemoControl`, `DemoActivitySheet`, `DemoChip`                                                                                                                   | `CampanhasSection`/detalhe da campanha                                                                                                                                                                                                                                                                                                                                                                                                               |
| 6–7               | cenários, testes, runbook                                                                                                                                                | pontuais                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 11. Riscos (atualizados)

1. **Filtro no lugar errado apaga a Demo** (`set()` por diferença) — filtro só no store, com teste de "não apaga linha oculta".
2. **Três vetores de vazamento**, não um (§2); esquecer a carga global dos `campanha_*` expõe tarefas/participações.
3. **Banco vivo atrás do repositório** (migrations de 03 e 04/out pendentes) — qualquer guarda em SQL só vale depois de aplicada.
4. **Aplicação em cadeia**: falha na migration de 03/out bloqueia a de 04/out.
5. **Sinal forjável** na chave pública — aceito por desenho (payload vazio).
6. **Refactor do V2** toca portal de produção — mitigado por default = atual, migração arquivo a arquivo e testes existentes.
7. **Ator real no histórico** se alguém do time abrir o link com sessão ativa (S9).
8. **Demo com e-mail real** (campanha de e-mail por seletor) — S4 + dados sem e-mail real.
9. **Arquivos de exemplo** em buckets compartilhados — prefixo `demo/`, limpeza no reset.
10. **`CLAUDE.md` e `.env` divergem**: o `CLAUDE.md` diz que falta `SUPABASE_SERVICE_ROLE_KEY` e que não existe a variável `LEADS_WEBHOOK_SECRET`; o `.env` local tem as duas. Conferir qual está certo (a variável pode ser resto de configuração antiga).
11. Sem jsdom: UI testada por marcação estática; fluxo ao vivo, por roteiro manual em navegador.

## 12. Dependências a resolver antes de implementar

1. **Você aplicar** a migration `20261004…` (e esclarecer o estado da de `20261003100000`) **e** rodar o §A e me devolver o resultado.
2. **Resultado do §A** — define: `realtime.send` (existe?), gatilhos vivos em `clientes`/`campanha_*`, policies abertas restantes, `pg_net`, publicação Realtime, `schema_migrations`.
3. **Aprovar** o filtro **no store** (+ marcador em `data`) como a única mudança no núcleo de `clientes-store`/`scoped-table-store`.
4. **Aprovar** a abstração `PortalRuntime` (14 arquivos V2, padrão idêntico ao atual).
5. **Decidir** push aos admins para eventos da Demo (sugestão: **suprimir** — o time já está operando a demo).
6. **Decidir** onde ficam os arquivos de exemplo: cópia para `demo/<sessionId>/` nos buckets existentes (recomendado) ou ramificar `buildClienteLinkData`.
7. Migrations são aplicadas à mão no SQL Editor do Supabase (confirmado: o push não as aplica).

---

## A. Script de verificação (somente leitura) — SQL Editor do Supabase

Execute **bloco por bloco** e me envie as saídas. Nenhum bloco altera dado; o bloco 1b faz `ROLLBACK`.

```sql
-- 0) versão e extensões
select version();
select extname from pg_extension
where extname in ('pg_net','pg_cron','pgcrypto','supabase_vault','pg_stat_statements') order by 1;

-- 1) existe realtime.send / broadcast_changes?
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'realtime' and p.proname in ('send','broadcast_changes') order by 2;

-- 1b) teste funcional (revertido — nada é entregue nem gravado)
begin;
select realtime.send('{"ok":true}'::jsonb, 'changed', 'demo-etapa0-teste', false);
rollback;

-- 1c) policies de Realtime Authorization (canal privado)
select policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'realtime' and tablename = 'messages';

-- 2) gatilhos VIVOS nas tabelas que a Demo toca
select c.relname as tabela, t.tgname, p.proname as funcao, pg_get_triggerdef(t.oid) as definicao
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc p on p.oid = t.tgfoid
where n.nspname = 'public' and not t.tgisinternal
  and c.relname in ('clientes','leads','campanha_influenciadores','campanha_tarefas',
                    'campanha_documentos','campanha_cronograma','campanha_nps_influenciador',
                    'campaign_cycles','profiles')
order by 1, 2;

-- 2b) os gatilhos de e-mail antigos devem ter SUMIDO (esperado: 0 linhas)
select tgname from pg_trigger where tgname like 'email_flows_%';
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('enroll_email_flow','email_flows_clientes_trigger','email_flows_leads_trigger');

-- 3) policies ainda "abertas" (a migration só troca por nome — o que sobrar aparece aqui)
select schemaname, tablename, policyname, cmd, roles::text, qual, with_check
from pg_policies
where schemaname in ('public','storage') and (qual = 'true' or with_check = 'true')
order by 1, 2, 3;

-- 3b) policies de clientes e campanha_* (conferir que nenhuma é "using (true)")
select tablename, policyname, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('clientes','campanha_influenciadores','campanha_tarefas',
                    'campanha_documentos','campanha_cronograma','campaign_cycles')
order by 1, 2;

-- 4) a migration 20261004 está aplicada? (3 sinais)
select policyname, qual from pg_policies
where schemaname = 'public' and tablename = 'shared_state';          -- deve citar is_internal_team_member
select indexname from pg_indexes where indexname = 'organization_members_user_id_idx';   -- deve existir
select proname, proconfig from pg_proc
where proname = 'enforce_cliente_archive_admin_only';                -- proconfig deve ter search_path

-- 5) quais migrations estão aplicadas
select version from supabase_migrations.schema_migrations order by version desc limit 15;

-- 6) funções de que a migration depende
select proname, pg_get_function_identity_arguments(oid) as args
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('is_internal_team_member','is_admin','has_permission','user_can_access_campanha');

-- 7) tabelas na publicação Realtime
select schemaname, tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 2;

-- 8) buckets e policies de storage
select id, public from storage.buckets order by 1;
select policyname, cmd, roles::text, qual
from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1;

-- 9) colunas de clientes
select column_name, data_type, is_nullable
from information_schema.columns where table_schema = 'public' and table_name = 'clientes' order by ordinal_position;

-- 10) QUEM PERDERIA ACESSO com a migration — esperado: 0 linhas (mesma consulta de docs/security/rls-internal-only.md)
select p.id, p.email
from public.profiles p
where not exists (select 1 from public.user_roles r where r.user_id = p.id and r.role = 'admin')
  and not exists (
    select 1 from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = p.id and om.status = 'active' and o.status = 'active' and o.type = 'internal')
  and not exists (
    select 1 from public.organization_members om
    join public.organizations o on o.id = om.organization_id
    where om.user_id = p.id and o.type = 'client');
```
