# Integração Instagram (métricas do influenciador)

API **Instagram com Instagram Login**, somente leitura. Permissões: `instagram_business_basic` e `instagram_business_manage_insights`. Sem publicação, mensagens ou comentários. Contas **profissionais** (Business/Criador) apenas.

## Fluxo
1. Equipe (permissão `influenciadores`) abre o influenciador no Banco → card **Instagram** → **Gerar link de conexão** (válido por 7 dias; só o hash do token fica no banco).
2. O influenciador abre `/conectar-instagram/<token>` (público, sem login, `noindex`), lê o que será acessado e clica **Conectar com o Instagram**.
3. O servidor grava o hash do `state` e envia ao `instagram.com/oauth/authorize` (scope das duas permissões).
4. Redirect em `GET /api/instagram/oauth-callback`: valida `state`/link (uso único, expiração), troca o `code`, exige as duas permissões, obtém token longo (60 dias), lê perfil e métricas e grava a conexão com o **token criptografado (AES-256-GCM, chave derivada de `INSTAGRAM_APP_SECRET`)**. Redireciona para `/conectar-instagram/resultado?status=…` (sem token na URL).
5. A equipe vê @, estado, métricas de 30 dias e público (percentuais); **Atualizar métricas** renova o token se faltarem ≤ 14 dias; **Desconectar** apaga token e métricas.
6. Renovação diária por cron externo: `GET /api/cron/instagram-refresh` com `Authorization: Bearer $CRON_SECRET` (não está no `vercel.json`: o plano já usa as vagas de cron).

## Configuração (variáveis de ambiente, nunca no código)
| Variável | O que é |
|---|---|
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | ID e segredo do **produto Instagram** (painel Meta → Instagram → Configuração da API) |
| `META_APP_SECRET` | segredo do app Meta; chave dos hashes de identidade e segundo segredo aceito no callback de exclusão |
| `APP_URL` | origem pública; o redirect é `${APP_URL}/api/instagram/oauth-callback` |

No painel da Meta: cadastrar exatamente o redirect acima em "URIs de redirecionamento OAuth válidos", a URL de exclusão (`/api/webhooks/meta-data-deletion` ou `/exclusao-de-dados`) e as URLs de Política e Termos. Aplicar a migration `20261014000000_instagram_connections.sql`.

## Dados
`instagram_connect_links` (hash do token do link e do state) e `instagram_connections` (uma por influenciador, FK `ON DELETE CASCADE` para `banco_influenciadores`; excluir o influenciador apaga a conexão). RLS ligada **sem policies**: só o servidor acessa; o navegador recebe `PublicConnection` (nunca token, ID do Instagram nem hashes).

## Limitações
- Só contas profissionais; demografia exige ≥ 100 seguidores.
- Acesso a contas de terceiros exige **acesso avançado** (revisão do app) e pode exigir verificação da empresa na Meta.
- As métricas não alimentam o portal do cliente nem o `profileMetrics` por campanha (que continua manual).
- Não testado contra a API real (sem credenciais): a validação cobre cliente com `fetch` simulado, fluxo, criptografia e exclusão.

## Material para a revisão da Meta (rascunho, usar só com o fluxo publicado e testado)
**user: instagram_business_basic** — "Our agency platform lets an influencer connect their own Instagram professional account through a one-time link. We read the account's basic profile (username, account type, followers, media count) to identify the account and show our campaign team the influencer's size. We never publish, edit, or access private messages."
**instagram_business_manage_insights** — "We read 30-day account insights (reach, views, interactions, engaged accounts) and aggregated follower demographics (gender, age, country, city percentages) so our team can plan and evaluate influencer campaigns. Data is read-only, visible only to authorized staff, stored with the access token encrypted, and deleted on disconnect or on a Meta data-deletion request."
**Screencast (roteiro)**: (1) equipe abre o influenciador → Gerar link; (2) influenciador abre o link e lê a página; (3) clica em Conectar e autoriza as duas permissões no Instagram; (4) volta à página de sucesso; (5) equipe vê métricas no card; (6) Atualizar métricas; (7) Desconectar e confirmar que os dados somem; (8) mostrar Política de Privacidade e a página de exclusão.
