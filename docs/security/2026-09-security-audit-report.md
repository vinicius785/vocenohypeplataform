# Auditoria de segurança — Plataforma VNH / Hype App

**Data:** 2026-09-17
**Executor:** Claude Code (auditoria assistida), a pedido de Rodrigo (rodrigo@vocenohype.com.br)
**Escopo:** todo o repositório, o projeto Supabase conectado (`kehjxyzrolltsdaqzkww`) e a
configuração de deploy (`vercel.json`). Somente leitura de dados reais; nenhum teste dinâmico
foi executado contra produção; nenhuma conta real foi atacada; nenhum dado real foi alterado ou
apagado como parte da investigação (só as correções descritas neste relatório, todas aditivas ou
de restrição de acesso, nunca de exclusão de dado).

**Referências usadas como critério:** OWASP Top 10:2025, OWASP API Security Top 10:2023, OWASP
ASVS, OWASP Cheat Sheet Series, NIST SSDF.

---

## 1. Baseline (Etapa 1)

Antes de qualquer mudança:

- `git status` — limpo, nada pendente de sessões anteriores.
- `bunx tsc --noEmit` — limpo.
- `bun run test` — 279/280 (1 falha pré-existente e não relacionada, `comercial-metrics.test.ts`,
  já confirmada antes desta auditoria como um teste com fixture de data sem congelamento de
  relógio — não é uma falha de segurança nem foi introduzida por este trabalho).
- `bun run lint` — 0 erros, 102 avisos (mesmos avisos já conhecidos de `react-refresh` e
  `exhaustive-deps`, nenhum deles de segurança).

## 2. Arquitetura e modelo de ameaças (Etapa 2)

### 2.1 O que a plataforma realmente é

O pedido descreve a plataforma como "SaaS multiworkspace". Isso **não corresponde ao que o
código implementa hoje**: não existe nenhuma coluna `workspace_id`, nenhuma política RLS, nenhum
middleware que particione dado por workspace/tenant. `DEFAULT_WORKSPACE_ID = "default"` em
`hypito.ts` é um valor fixo, não uma chave de isolamento. **Reportar isso com precisão em vez de
fingir que existe um limite multi-tenant testável é mais útil do que testar algo que não existe.**

Os limites de isolamento que **de fato** existem e foram auditados:

1. **Isolamento por permissão de módulo** entre membros do time (RLS baseada em
   `has_permission(auth.uid(), '<módulo>')`/`is_admin()`).
2. **Isolamento do Portal do Cliente** — cada cliente só acessa seus próprios dados via um token
   opaco (`publicToken`), nunca por sessão/cookie.
3. Nenhum isolamento por "workspace" no sentido do pedido — não existe hoje, e não foi
   inventado/simulado só para satisfazer a seção 5 do pedido.

### 2.2 Atores considerados

Usuário anônimo (internet pública) · influenciador respondendo a um link de inscrição · cliente
usando o Portal (token) · membro comum do time · gestor/admin · sessão comprometida (JWT roubado
via XSS) · integração externa comprometida (webhook) · arquivo malicioso (upload) · mensagem de
Chat maliciosa · instrução maliciosa endereçada ao Hypito.

### 2.3 Ativos e fronteiras principais

- Dados financeiros (`financeiro_lancamentos`), dados de clientes/campanhas, dados de
  influenciadores (incluindo mídia kit/arquivos), mensagens de Chat (incluindo canais privados),
  ações do Hypito (podem mutar tarefas/lembretes), credenciais/segredos (vault, webhook secrets),
  Storage (6 buckets, todos privados).
- Entradas públicas/anônimas: `POST /api/public/leads` (gated por secret), `submitInscricaoCampanha`
  (gated por token de campanha), `cliente-link.functions.ts` (gated por token do Portal),
  `bugs-link.functions.ts`.
- Autenticação: Supabase Auth (JWT), sessão guardada em IndexedDB (não httpOnly-cookie).

## 3. Autenticação (Etapa 3)

- `requireSupabaseAuth` valida assinatura/expiração do JWT via `supabase.auth.getClaims()` —
  correto, mas **não confirma que o usuário ainda existe/está ativo** a cada request; é só
  validade criptográfica do token.
- Sessão fica em IndexedDB (não `localStorage` puro — decisão deliberada, workaround de um bug
  de PWA no iOS), mas tem o mesmo risco estrutural de `localStorage`: legível por qualquer JS na
  página (amplifica o impacto de um XSS, ver Achado #1).
- Fluxo de "esqueci minha senha" não usa e-mail automático: cria um registro interno e notifica
  admins — **deliberadamente não confirma/nega se o e-mail existe** (comentário no código já
  documenta isso como proteção contra enumeração de contas). Sem rate limit nesse endpoint (ver
  Achado #6, baixo risco — o pior caso é spam de notificação a admins, não vazamento de dado).
- Reset de senha real é sempre feito por um admin (`resetMemberPassword`, `supabaseAdmin`).

## 4. Autorização e isolamento multi-tenant (Etapa 4)

Verificação exaustiva das políticas RLS reais (SQL, não a documentação do CLAUDE.md) contra
todas as tabelas de domínio:

- Confirmado: `financeiro_lancamentos`, `leads`, `banco_influenciadores`, `reunioes`, `projetos`,
  `projeto_influenciadores`, `campanha_influenciadores`, `campanha_tarefas`, `campanha_documentos`,
  `marketing_tasks`, `clientes`, `projeto_tarefas`, `marketing_standalone_tasks`, `metas` — todas
  corretamente restritas por `has_permission`/`is_admin`.
- **Achado #2 (Alta, corrigido):** `campanha_cronograma` continuava com `USING (true)` — não foi
  coberto por nenhuma das duas passagens anteriores de fechamento de RLS. Qualquer membro
  autenticado, mesmo sem a permissão "campanhas", podia ler/escrever o cronograma de qualquer
  campanha via chamada direta à API REST do Supabase.
- Permissão `"membros"` decorativa é **intencional e documentada** (ver CLAUDE.md) — não é um
  achado novo, é uma mitigação de design já existente contra auto-promoção a admin.

## 5. APIs e validação de entrada (Etapa 5)

- Toda função pública/anônima usa Zod para validar forma dos campos.
- `submitInscricaoCampanha`: array de anexos sem limite de quantidade (só de tamanho por item) —
  ver Achado #7.
- Nenhuma validação de conteúdo por assinatura de bytes (magic bytes) em nenhum ponto de upload
  do app (a única exceção pré-existente era o mídia kit de inscrição, adicionado em uma entrega
  anterior desta mesma sessão) — client sempre confia no `Content-Type` reportado pelo navegador.

## 6. Frontend, XSS, CSRF, headers (Etapa 6)

- **Achado #1 (Alta, corrigido):** `renderMarkdownLite` (`src/components/marketing/blog/markdown.ts`)
  não escapava aspas duplas e não validava o esquema de URL em links Markdown. Conteúdo de blog
  escrito por qualquer membro do time é renderizado sem sanitização adicional para **clientes
  externos** no Portal (`portal.$token/inicio.tsx`) via `dangerouslySetInnerHTML`. Um Markdown
  como `[x]("onmouseover="alert(document.cookie))` ou um link `javascript:` quebrava o atributo
  `href` ou executava ao ser clicado — XSS armazenado com alcance externo.
- Não há CSRF a mitigar nas rotas server-function (usam bearer JWT, não cookie de sessão
  ambient) — modelo correto para esse tipo de app.
- **Achado #4 (Média, corrigido parcialmente):** nenhum header de segurança configurado em
  nenhum lugar do repositório (`vercel.json`, `vite.config.ts`, `src/server.ts`, `src/start.ts`).
  Adicionamos `X-Content-Type-Options`, `X-Frame-Options` e `Referrer-Policy` (seguros, sem risco
  de quebrar nada). **CSP foi deliberadamente NÃO adicionado** nesta rodada — ver Etapa "risco
  elevado" abaixo.

## 7. Arquivos e Storage (Etapa 7)

- Todos os 6 buckets são privados (`public = false`).
- **Achado #3 (Média, corrigido):** só `entrega-anexos` tinha `file_size_limit` no banco; os
  outros 5 (`financeiro-anexos`, `relatorios-mensais`, `aeo-evidencias`, `task-attachments`,
  `chat-attachments`) não tinham nenhum teto de tamanho a nível de banco, e nenhum código de
  upload valida tamanho no cliente — um usuário autenticado podia subir arquivos de tamanho
  arbitrário chamando a API de Storage diretamente.
- Nenhum bucket tem `allowed_mime_types` a nível de banco, e todo ponto de upload confia só no
  `Content-Type` reportado pelo navegador — **não corrigido nesta rodada** (ver seção de riscos
  aceitos/deferidos), porque restringir tipos MIME de verdade é uma decisão de produto (quais
  extensões cada fluxo realmente precisa aceitar) que merece revisão antes de aplicar.
- Nomes de arquivo: sanitizados corretamente em praticamente todo ponto de upload (`[^\w.-]`
  removido) — sem risco de path traversal.

## 8. Chat e tempo real (Etapa 8)

- **Achado #5 (Alta, corrigido):** a política de SELECT de `chat_messages` só restringia DMs
  (`convo_id LIKE 'dm:%'`). Para qualquer canal (incluindo canais privados com
  `allowed_member_ids` restrito), a política reduzia a `true` — qualquer usuário autenticado
  podia ler o conteúdo de qualquer canal privado via API REST/Realtime direta, mesmo que a UI do
  app nunca mostrasse esse canal pra ele. A metadados do canal (`chat_channels`) já estava
  corretamente protegida; só as mensagens em si não estavam.
- **Achado #5b (Alta, corrigido — encontrado de forma independente via o advisor de segurança do
  próprio Supabase, não pelos agentes de investigação):** duas funções `SECURITY DEFINER`
  (`toggle_message_reaction`, `heal_voice_attachment_duration`) rodam com privilégio elevado
  (ignoram RLS por definição) e só checavam "está autenticado" — nenhuma checava se o usuário
  pertencia à conversa da mensagem que estava reagindo/editando. Mesmo depois de corrigir a
  política de SELECT acima, essas duas RPCs continuariam vazando a possibilidade de interagir com
  mensagens de canais privados alheios, porque `SECURITY DEFINER` ignora RLS por natureza.
  Corrigidas para verificar posse da conversa antes de agir, espelhando a mesma lógica da
  política de SELECT.
- **Achado #8 (Baixa, não corrigido — risco aceito):** `hypito_payload` não tinha nenhuma
  restrição ligando-o a `author_id = HYPITO_AUTHOR_ID`; qualquer usuário podia inserir uma
  mensagem própria com um `hypito_payload` forjado (card de confirmação falso). **Corrigido** com
  uma `CHECK` constraint no banco.
- **Achado #9 (Baixa, risco aceito, não corrigido):** a política de INSERT permite
  `author_id IS NULL` — usado deliberadamente por mensagens de sistema no código atual
  (`src/lib/chat-store.ts`, `input.system: true`). Um cliente malicioso pode inserir uma mensagem
  própria com `author_id: null` pra mascarar a autoria como "sistema". Não corrigido porque
  apertar essa regra quebraria a funcionalidade real de mensagens de sistema — corrigir direito
  exigiria separar "mensagem de sistema legítima" de "usuário mascarando autoria" com um
  mecanismo novo (fora do escopo de uma correção segura e pontual).

## 9. Hypito / IA (Etapa 9)

Investigação dedicada ao Hypito como categoria de ameaça nova (pedido, seção 14):

- **Confirmado: não existe integração com LLM em lugar nenhum** (`grep` por
  anthropic/openai/generateText/chat.completions/ai-sdk em todos os arquivos `hypito-*.ts`
  retornou zero, com um comentário no próprio código confirmando a ausência deliberada). Todo o
  "entendimento de linguagem natural" do Hypito é parsing determinístico
  (regex/keyword/edit-distance) em `hypito-nlu.ts`/`hypito-extract.ts`. **Prompt injection não é
  uma categoria de risco aplicável a esta implementação** — não há nada que interprete texto como
  instrução com autoridade.
- Toda ação mutável passa por um fluxo de duas etapas (`hypito_pending_actions`:
  pendente → confirmada), com a permissão **revalidada na confirmação** contra a sessão real
  (`requesterId` vem sempre de `requireSupabaseAuth`, nunca do payload) — nunca confia em nada
  que já tenha sido validado antes.
- `confirmPendingAction` faz a transição pendente→confirmada com um único UPDATE condicional
  atômico (`.eq("status", "pending")`) — sem race de dupla confirmação.
- Nomes extraídos de texto livre (responsável, campanha/projeto) nunca são usados como IDs
  diretamente — sempre passam por uma resolução contra os registros reais
  (`resolvePersonByName`/`resolveCampaign`/`resolveProject`), cada uma já gated por `assertCan`.
- **Achado #10 (Baixa, corrigido):** `getScopedTasks` e o ramo de projetos de
  `listScopeCandidates` liam dados antes de checar permissão — não exploráveis no fluxo de
  chamada atual (só são chamados depois que o escopo já foi resolvido com permissão checada),
  mas não eram defensivos por si mesmos. Corrigido para checar `assertCan` internamente, e
  cobertos por testes de regressão negativos (`hypito-tools.server.test.ts`).

## 10. Portal do Cliente e páginas públicas (Etapa 10)

- `cliente-link.functions.ts`: praticamente toda função que recebe um `campanhaId`/`influencerId`
  estrangeiro revalida a posse contra a cadeia do cliente resolvido pelo token
  (`assertCampanhaDoCliente`) — nenhum IDOR encontrado.
- Token de acesso: 32 hex chars (`crypto.randomUUID()` sem hífens), com checagem de tamanho
  mínimo antes de consultar o banco — entropia adequada, mas **sem rate limit** contra tentativas
  de adivinhação (ver Achado #6).
- **Achado #6 (Média, não corrigido — decisão de produto):** nenhum dos 4 endpoints/funções
  públicos (`leads.ts`, `submitInscricaoCampanha`, funções do Portal, `bugs-link.functions.ts`)
  tem rate limiting ou CAPTCHA. Adicionar rate limiting de verdade (Upstash/Vercel Edge Config ou
  equivalente) é uma dependência nova e uma decisão de infraestrutura — não aplicado sem revisão
  prévia, listado como recomendação prioritária no plano de remediação.

## 11. Financeiro (Etapa 11)

`financeiro_lancamentos` já está corretamente restrito por `has_permission(..., 'financeiro')`
desde a remediação de 2026-08-30 (confirmado contra o SQL real, não só a documentação). Nenhum
achado novo nesta área.

## 12. Webhooks e jobs (Etapa 12)

- Webhook de leads e os 4 crons comparam segredo com `timingSafeEqual` (constante no tempo) de
  forma consistente — sem risco de timing attack.
- **Achado #7 (Baixa/Média, não corrigido — decisão de produto):** o webhook de leads não tem
  proteção contra replay (sem timestamp/nonce) — uma requisição capturada com o secret válido
  pode ser reenviada indefinidamente, criando leads duplicados. Corrigir isso da forma certa
  exige decidir uma janela de deduplicação (por e-mail/telefone/tempo) que é uma regra de negócio,
  não só uma correção técnica — documentado no plano de remediação para decisão humana.

## 13. Dependências e cadeia de suprimentos (Etapa 13)

`bun audit`: 22 vulnerabilidades (14 altas, 6 médias, 2 baixas), **todas em dependências de
build/dev** (eslint, vite, vitest, babel, postcss) — nenhuma em código que roda em produção.
Recomenda-se um `bun update` de rotina, sem urgência de segurança real.

## 14. Segredos e privacidade (Etapa 14)

- Nenhum segredo hardcoded encontrado em nenhum arquivo versionado, nem no histórico do git.
- `.env`/`.env.local` corretamente ignorados pelo git, nunca commitados.
- Advisor do próprio Supabase confirmou: `vault_secret`, `vault_totp_secrets`,
  `vault_totp_attempts`, `webhook_settings`, `email_provider_settings`,
  `google_calendar_connections`, `google_oauth_states` têm RLS habilitado **sem nenhuma
  política** — isso é o comportamento seguro por padrão (nega tudo pra `authenticated`/`anon`),
  consistente com o desenho documentado de "só acessível via `service_role`".
- Achado informativo: "Leaked Password Protection" (checagem contra HaveIBeenPwned) está
  desabilitada nas configurações de Auth do projeto Supabase — não é algo que se corrija por
  migração SQL; é uma configuração do painel do projeto (Authentication → Policies). Recomendado
  no plano de remediação.

## 15. Resumo de achados por severidade

| # | Severidade | Achado | Status |
|---|---|---|---|
| 1 | **Alta** | XSS armazenado em `renderMarkdownLite` (blog → Portal do cliente) | **Corrigido** |
| 5 | **Alta** | `chat_messages` RLS não restringia canais privados (só DMs) | **Corrigido** |
| 5b | **Alta** | RPCs `SECURITY DEFINER` de Chat sem checagem de posse de conversa | **Corrigido** |
| 2 | **Alta** | `campanha_cronograma` sem RLS por permissão (aberto a qualquer autenticado) | **Corrigido** |
| 3 | Média | 5 de 6 buckets de Storage sem `file_size_limit` | **Corrigido** |
| 4 | Média | Nenhum header de segurança configurado | **Corrigido parcialmente** (sem CSP) |
| 6 | Média | Sem rate limiting/CAPTCHA em 4 endpoints públicos | Documentado, não corrigido |
| 7 | Baixa/Média | Webhook de leads sem proteção contra replay | Documentado, não corrigido |
| 8 | Baixa | `hypito_payload` forjável sem `CHECK` contra `author_id` | **Corrigido** |
| 9 | Baixa | `author_id IS NULL` permite mascarar autoria como "sistema" | Risco aceito |
| 10 | Baixa | 2 funções do Hypito liam dado antes de checar permissão (não exploráveis hoje) | **Corrigido** |
| — | Informativa | Nenhum tipo MIME restringido a nível de banco em nenhum bucket | Documentado |
| — | Informativa | "Leaked Password Protection" desabilitado no Auth do Supabase | Documentado |
| — | Informativa | 22 vulnerabilidades em dependências de build/dev (não runtime) | Documentado |
| — | Informativa | Sessão em IndexedDB (mesmo risco estrutural de `localStorage` sob XSS) | Documentado |

Detalhes de reprodução, evidência e passos de correção para cada item: ver
`docs/security-remediation-plan.md`.

## 16. Testes de regressão criados

- `src/components/marketing/blog/markdown.test.ts` — casos positivos (formatação normal continua
  funcionando) e negativos (quebra de atributo via aspas, esquemas `javascript:`/`data:`, tag
  `<script>` direta) para o Achado #1.
- `src/lib/hypito-tools.server.test.ts` — casos negativos confirmando que `getScopedTasks` e
  `listScopeCandidates` negam acesso sem a permissão correspondente, sem nunca chamar o banco
  (Achado #10).

`bun run test`: 289/290 (a mesma falha pré-existente e não relacionada de antes da auditoria).
`bunx tsc --noEmit`: limpo. `bun run lint`: 0 erros. `bun run build`: sucesso.

## 17. O que NÃO foi coberto nesta auditoria (documentado, não esquecido)

- Teste dinâmico contra um ambiente de homologação real (não configurado neste projeto) — toda a
  verificação foi estática (leitura de código, SQL real via MCP do Supabase, advisor de
  segurança do Supabase) mais testes unitários locais.
- CSP (Content-Security-Policy) — decisão de risco elevado, ver plano de remediação.
- Rate limiting real nos 4 endpoints públicos — decisão de infraestrutura/produto, ver plano de
  remediação.
- Restrição de tipo MIME a nível de banco em todos os buckets — decisão de produto sobre quais
  extensões cada fluxo deve aceitar, ver plano de remediação.
- Proteção contra replay no webhook de leads — decisão de regra de negócio (janela de dedup), ver
  plano de remediação.
- Revisão completa de todos os outros ~15 nomes de tabela citados como "ainda abertos" pelo
  agente de investigação (`workspace_settings`, `email_flows`, `bug_reports`, etc.) além de
  `campanha_cronograma` — só `campanha_cronograma` foi confirmado como sensível e corrigido; os
  demais precisam de uma revisão individual de sensibilidade antes de qualquer mudança (alguns,
  como `workspace_settings`, já são intencionalmente de leitura pública).
- Testes de penetração manuais reais contra o Chat/Realtime em produção — a correção foi validada
  por leitura da definição SQL da política resultante, não por uma sessão real tentando ler um
  canal privado alheio (exigiria duas contas de teste reais e uma sessão de homologação, fora do
  escopo desta rodada).
- Auditoria completa de LGPD/mapeamento de dado pessoal fim-a-fim.

A auditoria não encontrou outras falhas dentro do escopo e dos testes executados.
