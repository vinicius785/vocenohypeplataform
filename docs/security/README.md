# Segurança

Estado de segurança da plataforma. Relatórios por data ficam nesta pasta; este arquivo resume o que vale **hoje**.

## Modelo de acesso (resumo)
- Equipe e Portal do Cliente compartilham o **mesmo Supabase Auth e a mesma chave anon (pública)**. Qualquer policy `TO authenticated` vale também para contas de cliente.
- Separação real: `organization_members` + `organizations.type` (`internal`/`client`), via `is_internal_team_member(uid)`; permissões de módulo por `has_permission`; admin por `is_admin`.
- Portal do cliente acessa dados por **server functions com service-role** (ignoram RLS) e valida token/papel/campanha no servidor. Com o cliente do usuário usa só `profiles` e o bucket `avatars`.

## Histórico
| Data | Documento | Resumo |
|---|---|---|
| 2026-09-17 | [`2026-09-security-audit-report.md`](./2026-09-security-audit-report.md) | Auditoria completa (XSS do blog, RLS de cronograma, buckets, headers, chat, Hypito) |
| 2026-09-17 | [`2026-09-security-remediation-plan.md`](./2026-09-security-remediation-plan.md) | O que foi corrigido e o que ficou para decisão humana |
| 2026-10-03 | [`../architecture/auditoria-2026-10.md`](../architecture/auditoria-2026-10.md) | Auditoria técnica geral (esta rodada) |
| 2026-10-03 | [`rls-internal-only.md`](./rls-internal-only.md) | **Migration pendente**: dados internos só para membros internos |

## Corrigido na rodada de 2026-10-03 (no código)
- Endpoint **sem autenticação** `requestPasswordReset` (fluxo legado, sem uso na UI) removido: gravava linha em `password_reset_requests` e disparava push aos admins para qualquer chamador.
- `logLoginFailure` (sem sessão) passou a ter **rate limit** (20/h por e-mail): impede inundar o log de auditoria de um e-mail alheio.
- Erros de banco **não vazam mais** ao cliente nos endpoints públicos de `bugs-link`, `inscricao-campanha`, `campanha-nps-influenciador` e `proposta-publica` (18 pontos → `throwSafeDbError`).
- `target="_blank"` verificado por parser de JSX: **todas** as tags já têm `rel` (o grep por linha acusava 28 por causa de tags multilinha) — nada a corrigir.
- `dompurify` atualizado para 3.4.16 (advisory GHSA-p98j-92pf-mc4p; o código não usa `IN_PLACE`/hooks, então a exposição era baixa).
- Cópia obsoleta e menos segura de `portal-auth.functions.ts` removida (tinha sido commitada por engano em `cf006f2`; não era importada).

## Pendente (exige ação sua)
| Prioridade | Item | Onde |
|---|---|---|
| **P1** | Aplicar a migration `20261004000000` (RLS interna + storage + índice) **depois** de conferir o banco vivo | [`rls-internal-only.md`](./rls-internal-only.md) |
| P2 | Rate limit de login é **consultivo** (o cliente chama `checkLoginRateLimit` antes de `signInWithPassword`; quem chama o Supabase Auth direto o ignora) — o piso real é o rate limit nativo do Supabase Auth; conferir os limites no painel | `rate-limit.functions.ts`, `routes/index.tsx` |
| P2 | Endpoints públicos por token de **escrita** sem rate limit (inscrição, NPS do influenciador, bugs, comentários de artigo, descadastro). O token é um UUID de 122 bits (não adivinhável), mas um token vazado permite spam | `*.functions.ts` listados na auditoria |
| P2 | 10 tabelas com RLS ligada e **nenhuma** policy (só service-role acessa: vault, webhook_settings, rate_limit_events, google_*, email_provider_settings…) — intencional; manter documentado | migrations |
| P3 | Vulnerabilidades de dependências **só de build/dev** (browserslist, postcss/nanoid via vite, babel, esbuild, js-yaml via eslint, vitest): não entram no bundle de produção; resolver com `bun update` quando o Lovable/TanStack liberarem versões | `bun audit` |
| P3 | `access-guards.server.ts` e `hypito-permissions.server.ts` não são usados por nenhum código (guardas escritos na "Fase 1" de auth e nunca ligados) — decidir entre adotar ou remover | `src/lib` |
