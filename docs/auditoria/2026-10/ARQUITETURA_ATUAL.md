# Arquitetura atual — auditoria 2026-10

Escopo: o que o **repositório** prova hoje (commit `d7b374a`, 2026-10-09). O que depende de painel (Supabase, Vercel, Meta, Google, Autentique) está marcado como **não verificável**. Complementa, sem substituir, [`../../architecture/arquitetura.md`](../../architecture/arquitetura.md) e [`../../architecture/dados-e-acesso.md`](../../architecture/dados-e-acesso.md); divergências estão na seção 8.

## 1. Stack e tamanho (medido)

| Item              | Valor                                                                                               | Evidência                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Framework         | TanStack Start 1.168 + Router 1.170 (React 19.2, SSR via Nitro, preset Vercel)                      | `package.json`, `.vercel/output`                                                    |
| Build / tipos     | Vite 8, TypeScript 5.8, Tailwind 4, shadcn/ui                                                       | `package.json`                                                                      |
| Backend de dados  | Supabase (Postgres, Auth, Realtime, Storage) `supabase-js` 2.110                                    | `package.json`, `supabase/`                                                         |
| Gerenciador       | bun (`bunfig.toml` com guarda de 24 h de idade de pacote)                                           | `package.json`                                                                      |
| Código de produto | 878 arquivos, 176.447 linhas (`components` 108.538, `lib` 48.742, `routes` 9.267, `features` 9.265) | `evidencias/inv.txt`                                                                |
| Código de teste   | 176 arquivos, 27.987 linhas, 2.145 testes                                                           | `evidencias/verificacoes.txt`                                                       |
| Rotas             | 97 arquivos em `src/routes` (9 de API/cron/webhook)                                                 | `evidencias/inv.txt`                                                                |
| Server functions  | 184 (`createServerFn`): 147 autenticadas, 37 públicas por token                                     | `evidencias/inv.txt`                                                                |
| Banco             | 162 migrations, 114 tabelas (todas com RLS), 60 funções (41 `SECURITY DEFINER`)                     | `evidencias/rls.txt` (estimativa por regex; sujeita a falsos positivos e negativos) |
| Bundle            | 312 chunks JS, 4,5 MB brutos; maiores: `TaskBoard` 574 KB (169 gzip), `index` 437 KB (136 gzip)     | `evidencias/verificacoes.txt`                                                       |
| Histórico         | 921 commits; sem CI (`.github/` e hooks ausentes)                                                   | `git log`, `ls -a`                                                                  |

**Aviso metodológico.** Contagens de tabelas, políticas, funções, server functions e chamadas (`114`, `41`, `184`, `37`, `87`, `26`…) vêm de varreduras por regex e são **estimativas** sujeitas a falsos positivos e falsos negativos; não substituem consulta ao catálogo do banco nem leitura do código.

Maiores arquivos (manutenção): `InfluencerBoard.tsx` 6.574 linhas, `TaskBoard.tsx` 5.169, `AppShell.tsx` 2.301, `portal-widgets.tsx` 1.944, `financeiro-entries.ts` 1.826.

## 2. Diagrama

```mermaid
flowchart LR
  subgraph Browser["Navegador (PWA)"]
    UI["React + TanStack Router"]
    ST["15 stores JSONB + localStorage/IndexedDB<br/>(table-array-store, scoped stores)"]
    SW["Service worker (só instalação PWA)"]
  end

  subgraph Vercel["Vercel (SSR + serverless)"]
    SSR["SSR / páginas públicas legais"]
    SF["Server functions<br/>147 autenticadas · 37 públicas por token"]
    API["Rotas /api: leads · resend · autentique · meta-data-deletion<br/>google/instagram oauth-callback"]
    CRON["Crons: email-flows (13h) · google-sync (6h)<br/>+ instagram-refresh (cron EXTERNO, não verificável)"]
  end

  subgraph Supa["Supabase"]
    AUTH["Auth (e-mail+senha, MFA TOTP)"]
    PG[("Postgres: 114 tabelas, RLS,<br/>has_permission / is_admin / is_internal_team_member")]
    RT["Realtime (postgres_changes)"]
    STO["Storage: 9 buckets (6 verificados como privados)"]
  end

  UI -->|JWT do usuário, RLS| PG
  UI --> AUTH
  ST <-->|upsert/update/delete por linha| PG
  RT --> ST
  UI -->|Bearer| SF
  SF -->|RLS (context.supabase)| PG
  SF -->|service-role (bypassa RLS)| PG
  SF --> STO
  API -->|service-role| PG

  subgraph Ext["Serviços externos"]
    GCAL["Google Calendar (OAuth)"]
    RES["Resend (e-mail + webhook Svix)"]
    AUT["Autentique (assinatura; só sandbox/backend)"]
    IG["Instagram API (novo, sem UI de produção testada)"]
    META["Meta: callback de exclusão"]
    MAKE["Make/Typeform → /api/public/leads; blog webhook (saída)"]
    PUSH["Web Push (VAPID)"]
    TURN["TURN (chamadas)"]
  end
  SF <--> GCAL
  SF --> RES
  RES -->|webhook| API
  API <-- AUT
  SF <--> IG
  META --> API
  MAKE --> API
  SF --> MAKE
  SF --> PUSH
  UI --> TURN
```

## 3. Camadas e fluxos de dados

1. **Leitura/escrita direta do navegador ao Postgres** (`supabase-js` com JWT do usuário): 15 tabelas "lista de entidades" (`clientes`, `projetos`, `reunioes`, `financeiro_lancamentos`, `banco_influenciadores`, `metas`, …) são carregadas **por inteiro** no login (`loadAllRows`, páginas de 1.000) e mantidas em memória; cada edição regrava a **linha inteira** (`data` JSONB) — ver INT-01. A segurança aqui é **só RLS**.
2. **Server functions autenticadas** (`requireSupabaseAuth` → cliente RLS do usuário ou, em 60 delas, `supabaseAdmin`): operações com regra de negócio, convites, integrações, e-mail, cofre. 151 das 184 têm validador `zod`.
3. **Server functions públicas** (token no corpo): portal do cliente por link, inscrição de influenciadores, NPS, bugs, proposta, descadastro, Instagram, status de exclusão. Todas usam service-role e validam o token no servidor.
4. **Rotas de servidor** (`src/routes/api/**`): webhooks de entrada, callbacks OAuth e crons.
5. **Tempo real**: `postgres_changes` por tabela alimenta as stores; sem fila — evento perdido com aba fechada só se recupera no recarregar (push cobre parte).

Autenticação: Supabase Auth e-mail+senha, MFA TOTP opcional, troca de senha forçada no primeiro acesso, convites de cliente (conta `authenticated` comum, mesma chave anon). Autorização: `profiles.permissions` (jsonb) + `user_roles` (admin) + `organization_members` (tipo `client`/interno). Isolamento: `is_internal_team_member`, `has_permission`, `is_admin`, `user_can_access_campanha` (37 tabelas explicitamente internas).

## 4. Integrações e criticidade

| Integração       | Uso                                                  | Autenticação do canal                                                                 | Estado verificado                                                                                                      |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Google Calendar  | sincronização de reuniões (escopo `calendar.events`) | OAuth por usuário; `state` em tabela; tokens em tabela só-service-role (em claro)     | código + testes; cron diário Vercel; cadência de 5–10 min depende de cron externo **não verificável**                  |
| Resend           | e-mails de campanha/convites; eventos                | webhook Svix (segredo em `email_provider_settings`), sem tolerância de timestamp      | código + testes parciais                                                                                               |
| Autentique       | contrato de influenciador                            | webhook por segredo no caminho (+ HMAC opcional); persistência/reconciliação no banco | só backend; smoke de sandbox executado em 2026-10; **credencial de produção retornou 401** na última tentativa; sem UI |
| Instagram (Meta) | métricas do influenciador (somente leitura)          | OAuth (`state` com hash), token criptografado AES-256-GCM                             | testes com `fetch` simulado; **nunca exercitado contra a API real**                                                    |
| Meta (exclusão)  | callback `signed_request` + página de status         | HMAC do App Secret, comparação em tempo constante                                     | testes; não publicado/testado em produção                                                                              |
| Make / Typeform  | leads (entrada), blog (saída best-effort)            | `X-Webhook-Secret` em `webhook_settings`, CORS `*`                                    | código; sem idempotência                                                                                               |
| Web Push, TURN   | notificações e chamadas                              | VAPID; credenciais TURN **no bundle do cliente** (`VITE_TURN_*`)                      | código                                                                                                                 |

## 5. Ambientes e deploy

- **Um único projeto Supabase**: o servidor de desenvolvimento local (`localhost:8080`) usa as credenciais do ambiente real — em **etapa anterior da mesma sessão de trabalho** (validação da navegação mobile, antes desta auditoria somente de leitura) o navegador local exibiu dados reais de projetos e conversas (sessão preexistente); a auditoria em si não abriu o navegador. Não há staging nem dados de teste (`seed`/fixtures ausentes). → OPS-08.
- Deploy: push no `main` → Vercel (documentação cita também "Lovable Cloud" — ver divergências). **Migrations são aplicadas à mão** no SQL Editor; não há tabela/ledger de migrations nem verificação de que o schema de produção equivale ao repositório. → OPS-01.
- Variáveis: ≈30 nomes lidos pelo código (incluindo `NODE_ENV`/`DEV`); `.env.example` lista 10 (2 são segredos HMAC opcionais do Autentique); ausentes dele: `SUPABASE_*`, `CRON_SECRET`, `VAPID_*`, `BLOG_WEBHOOK_URL`, `SITE_URL`, `VERCEL_*`, `AUTENTIQUE_SMOKE_*`. Valores nunca foram lidos nesta auditoria.
- Plano Vercel: um comentário em `src/routes/api/cron/google-calendar-sync.ts` afirma plano **Hobby**; **indício não verificado** (se confirmado, implicaria sem SLA contratual e limites de cron).

## 6. Pontos únicos de falha e acoplamentos

| Ponto                                           | Efeito de falha                                 | Alternativa hoje        |
| ----------------------------------------------- | ----------------------------------------------- | ----------------------- |
| Supabase (um projeto: Auth+DB+Realtime+Storage) | plataforma inteira indisponível; sem degradação | nenhuma                 |
| Vercel (SSR + serverless + crons)               | idem                                            | nenhuma                 |
| `SUPABASE_SERVICE_ROLE_KEY`                     | comprometimento ignora toda RLS                 | rotação não documentada |
| Cron externo (Google 5–10 min; Instagram)       | sincronização para silenciosamente              | sem alerta              |
| Resend                                          | e-mail de campanha/convite para                 | sem fila de reenvio     |
| Stores carregadas por inteiro                   | login lento/falha parcial com muito dado        | recarregar              |
| JSONB sem FK                                    | inconsistência silenciosa de vínculos           | triggers pontuais       |

Acoplamentos: `lib → components` (5 importações de valor restantes, p.ex. `marketing-tasks.ts → TaskBoard`), regra da ADR 0001 parcialmente violada; `localStorage` como cache compartilhado entre abas.

## 7. O que não foi possível verificar

Estado vivo do banco (políticas aplicadas, migrations pendentes, dados), plano/região do Supabase e da Vercel, backups, variáveis reais da Vercel, cron externo, configuração dos apps Google/Meta/Autentique. Cada item tem o método de validação em [`PLANO_DE_ACAO.md`](./PLANO_DE_ACAO.md) (lote P0).

## 8. Divergências documentação × implementação

| Documento                                  | Afirma                                                                         | Realidade verificada                                                                                                |
| ------------------------------------------ | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `development/guia.md`                      | "65 arquivos, 808 testes"                                                      | 176 arquivos, 2.145 testes                                                                                          |
| `development/guia.md`, `CLAUDE.md`         | `SUPABASE_SERVICE_ROLE_KEY` "não existe localmente"                            | a chave existe no `.env` local (ambiente de dev aponta para dados reais)                                            |
| `development/guia.md` regra 3              | funções públicas de escrita exigem rate limit e nunca devolvem `error.message` | 28 funções públicas sem limitador (18 escritas); `processEmailUnsubscribe` devolve `error.message` e ecoa o e-mail  |
| `development/guia.md`                      | "19 imports `lib → components`"                                                | 24 importações (5 de valor)                                                                                         |
| `architecture/portal-e-links-externos.md`  | lista 5 rotas de servidor                                                      | existem 9 (faltam `autentique.$secret`, `meta-data-deletion`, `instagram/oauth-callback`, `cron/instagram-refresh`) |
| `README.md` (índice) / `modules/README.md` | —                                                                              | não listam Instagram, exclusão da Meta, páginas legais                                                              |
| `development/guia.md`                      | deploy "Lovable Cloud / Vercel"                                                | `CLAUDE.md` diz que o Lovable saiu do fluxo; mecanismo único não documentado                                        |
| `.env` local                               | —                                                                              | contém `LEADS_WEBHOOK_SECRET` (variável sem uso; segredo real está no banco)                                        |
