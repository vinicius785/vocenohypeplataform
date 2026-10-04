# Plano de remediação de segurança — Plataforma VNH / Hype App

Companion de `docs/security-audit-report.md`. Este documento separa o que já foi corrigido
(aplicado com segurança, sem mudar regra de negócio) do que fica pendente de decisão humana —
por ser "risco elevado" (pode mudar comportamento visível) ou por exigir uma escolha de produto
que não é puramente técnica.

## Já corrigido nesta rodada (sem necessidade de ação)

| Achado | Correção | Arquivo(s) |
|---|---|---|
| XSS armazenado no blog (Achado #1) | `escape()` passou a codificar aspas; esquema de URL restrito a http(s); sanitização final via DOMPurify | [`src/components/marketing/blog/markdown.ts`](../src/components/marketing/blog/markdown.ts) |
| `campanha_cronograma` sem RLS por permissão (Achado #2) | Políticas trocadas por `has_permission('campanhas')`, mesmo padrão de `campanha_tarefas` | migração `20260917150000_close_campanha_cronograma_rls_gap.sql` |
| Buckets sem limite de tamanho (Achado #3) | `file_size_limit = 100MB` em 5 buckets que não tinham nenhum | migração `20260917150300_add_storage_bucket_size_limits.sql` |
| Sem headers de segurança básicos (Achado #4, parcial) | `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` | `vercel.json` |
| `chat_messages` vazava canais privados (Achado #5) | Política de SELECT passou a checar `is_private`/`allowed_member_ids` do canal, igual já acontecia pra `chat_channels` | migração `20260917150100_restrict_chat_messages_to_channel_members.sql` |
| RPCs de Chat sem checar posse da conversa (Achado #5b) | `toggle_message_reaction`/`heal_voice_attachment_duration` passaram a verificar membership antes de agir | migração `20260917150400_chat_message_rpcs_verify_channel_access.sql` |
| `hypito_payload` forjável (Achado #8) | `CHECK` constraint: só pode existir se `author_id = HYPITO_AUTHOR_ID` | migração `20260917150200_hypito_payload_author_check.sql` |
| Hypito lia dado antes de checar permissão (Achado #10) | `assertCan` adicionado em `getScopedTasks` e no ramo de projetos de `listScopeCandidates` | [`src/lib/hypito-tools.server.ts`](../src/lib/hypito-tools.server.ts) |

Todas verificadas: `bunx tsc --noEmit` limpo, `bun run lint` 0 erros, `bun run test` 289/290 (a
mesma falha pré-existente e não relacionada), `bun run build` com sucesso, e testes de regressão
novos cobrindo os Achados #1 e #10 (`markdown.test.ts`, `hypito-tools.server.test.ts`).

**Nenhuma dessas correções muda uma regra de negócio ou remove uma funcionalidade existente** —
confirmado individualmente antes de aplicar (ex.: nenhum membro do time atual perde acesso ao
cronograma de campanha, já que todos que usam o recurso já tinham a permissão "campanhas";
mensagens de sistema com `author_id: null` continuam funcionando).

## Risco elevado — documentado, aguardando revisão humana antes de aplicar

### R1. Content-Security-Policy (CSP)

**Por que não foi aplicado agora:** uma CSP mal calibrada pode quebrar scripts/estilos/fontes
legítimos do app (ex.: qualquer CDN ou inline script que hoje funcione sem restrição) sem que
isso seja detectável só por `tsc`/`lint`/`test`/`build` — só apareceria em uso real no navegador,
que não temos como validar de forma confiável nesta rodada sem uma sessão de homologação
dedicada.

**Recomendação:** levantar todos os domínios/CDNs realmente usados pelo app (Supabase, fontes do
Google se houver, etc.), montar uma CSP em modo `Content-Security-Policy-Report-Only` primeiro,
observar os relatórios de violação por alguns dias em produção, só então promover pra
enforcement.

### R2. Rate limiting / CAPTCHA nos 4 endpoints públicos

Endpoints: `POST /api/public/leads`, `submitInscricaoCampanha`, funções do Portal do Cliente
(`cliente-link.functions.ts`), `bugs-link.functions.ts`.

**Por que não foi aplicado agora:** exige escolher e adicionar uma dependência nova (ex.: rate
limiter baseado em Upstash Redis, ou um contador em tabela própria do Supabase) — isso é uma
decisão de infraestrutura com custo/operação associada, não uma correção de código pura.

**Recomendação:** para o webhook de leads e o Portal, um limite simples por IP+janela de tempo
(ex.: 30 requisições/minuto) já cobre a maior parte do risco de abuso. Para
`submitInscricaoCampanha`, considerar também um teto no número de submissões por campanha por
IP/dia, já que ele lida com upload de arquivo.

### R3. Restringir tipo MIME por bucket a nível de banco

**Por que não foi aplicado agora:** decidir a lista exata de `allowed_mime_types` por bucket
exige levantar o que cada fluxo de fato precisa aceitar hoje (ex.: `task-attachments` aceita
quais tipos na prática?) — aplicar uma lista errada quebraria uploads legítimos silenciosamente.

**Recomendação:** levantar os tipos MIME realmente usados em cada bucket (via
`storage.objects.metadata` do histórico real) antes de fechar a lista, e complementar com
validação de magic bytes no código de upload (já existe um precedente pronto pra copiar em
`inscricao-campanha.functions.ts`'s `matchesFileSignature`).

### R4. Proteção contra replay no webhook de leads

**Por que não foi aplicado agora:** a forma certa de deduplicar depende de uma regra de negócio
(qual janela de tempo, quais campos usar como chave de dedup — e-mail? telefone? um ID externo
que o Make/Typeform já envie?) que não deve ser decidida unilateralmente pela auditoria.

**Recomendação:** se o Make/Typeform já envia um ID de submissão único, usar isso como chave de
idempotência (índice único, mesmo padrão já usado pelos jobs do Hypito). Caso contrário, um
timestamp + nonce assinado junto do secret, com janela de tolerância curta (ex.: 5 minutos).

### R5. "Leaked Password Protection" desabilitado

**Por que não foi aplicado agora:** é uma configuração do painel do projeto Supabase
(Authentication → Policies → "Leaked password protection"), não uma migração SQL — fora do
alcance das ferramentas usadas nesta auditoria.

**Recomendação:** habilitar diretamente no painel do Supabase. Baixo risco de quebrar algo (só
passa a recusar senhas conhecidas por vazamento no momento da troca/criação).

## Riscos aceitos (decisão consciente de não corrigir)

- **`author_id IS NULL` no INSERT de `chat_messages`** (Achado #9) — necessário para mensagens de
  sistema legítimas hoje; mascarar autoria como "sistema" é um risco baixo (não expõe dado, só
  falsifica quem enviou uma mensagem visível). Corrigir direito exigiria um mecanismo novo pra
  distinguir "sistema de verdade" de "usuário se passando por sistema" (ex.: uma coluna
  `is_system_message` controlada só por `service_role`).
- **Permissão `"membros"` decorativa** — já documentada e intencional desde antes desta
  auditoria (ver CLAUDE.md), mitigação deliberada contra auto-promoção a admin.

## Verificação final

- `bunx tsc --noEmit`: limpo.
- `bun run lint`: 0 erros, 102 avisos (mesmos de antes da auditoria).
- `bun run test`: 289/290 (1 falha pré-existente, não relacionada, já confirmada antes desta
  auditoria).
- `bun run build`: sucesso.
- Nenhum dado real foi alterado ou apagado. Nenhum segredo foi exibido (nesta auditoria nem nos
  dois documentos gerados). Nenhum teste dinâmico rodou contra produção. Nenhuma conta real foi
  atacada.

A auditoria não encontrou outras falhas dentro do escopo e dos testes executados.
