# Guia de desenvolvimento

Fonte única para rodar, configurar, publicar e contribuir. Arquitetura em [`../architecture/arquitetura.md`](../architecture/arquitetura.md).

## Comandos
```bash
bun install
bun run dev        # http://localhost:8080
bun run build
bun run typecheck  # tsc --noEmit
bun run lint
bun run test       # vitest (65 arquivos, 808 testes na última verificação)
bun scripts/release.ts bump|publish   # versão + aviso em tempo real
```
Nota: `vitest` deve ignorar `.claude/worktrees/**` (cópias antigas fazem testes falharem).


## Variáveis de ambiente
| Variável | Uso |
|---|---|
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (+ `SUPABASE_*` no servidor) | cliente Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | **só servidor**; cliente admin. Não existe localmente por padrão |
| `APP_URL` | origem canônica (redirect do OAuth Google); nunca derivada do request |
| `SITE_URL`, `VERCEL_URL`, `VERCEL_ENV` | origem de links e ambiente |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth do Google Calendar |
| `CRON_SECRET` | Bearer exigido pelos crons |
| `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `VITE_VAPID_PUBLIC_KEY` | Web Push |
| `BLOG_WEBHOOK_URL` | webhook de blog (Make) |
| `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | TURN para chamadas |
O segredo do webhook de leads **não** é variável: fica em `webhook_settings` (só service-role).


## Build, deploy, versão
- Deploy por observação do branch (Lovable Cloud) / Vercel; **não há CI**.
- `public/version.json` + `VersionWatcher` avisam o usuário quando há bundle novo; `APP_VERSION` em `lib/app-version.ts`.
- `scripts/release.ts`: `bump` (SemVer, roda tsc/eslint/testes, commita) e `publish` (insere em `platform_releases`, disparando aviso em tempo real; o Hypito anuncia).
- Service worker (`sw.js`) existe só para instalação como PWA e **não faz cache**.


## Convenções de código
Alias `@/*` → `src/*`; Prettier 100 colunas, aspas duplas, vírgulas finais; `server-only` do Next é bloqueado (usar `*.server.ts`); migrations novas como arquivos novos, nunca editar antigas.

## Regras de camada (desde 2026-10)
1. `src/lib/**` **não importa valores de `src/components/**`**. Tipos e regras de domínio vivem em `lib/` (ex.: `lib/influencer-model.ts`); componentes só os consomem. Ainda há 19 imports `lib → components` (14 `import type`) (dívida: ver `architecture/auditoria-2026-10.md`).
2. Cada arquivo de componente grande (> 1.500 linhas) deve perder responsabilidades, não ganhar: `InfluencerBoard` (~6.000), `TaskBoard` (~5.400), `ChatSection`, `AppShell`.
3. Server functions: autenticadas por padrão (`requireSupabaseAuth`); sem sessão **só** com token validado + zod + (para escrita) rate limit. Nunca devolver `error.message` do banco ao cliente em endpoint público/portal: usar `throwSafeDbError`.
4. Toda migration nova que toque RLS: conferir o comportamento para **contas de cliente** (mesmo Supabase Auth, mesma chave anon) — ver `security/README.md`.
5. Testes que dependem de "hoje" usam o fuso de Brasília (`lib/timezone`), nunca `toISOString()`.

## Documentação
Mapa de assuntos e donos em [`../README.md`](../README.md). Decisões arquiteturais: [`../decisions/`](../decisions/).
