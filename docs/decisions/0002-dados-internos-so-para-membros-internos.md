# 0002 — Dados internos só para membros internos (RLS e storage)

**Data:** 2026-10-03 · **Status:** proposta — migration **não aplicada** (ver `security/rls-internal-only.md`)

## Contexto
Contas do Portal do Cliente são `authenticated` no mesmo Supabase. Policies `TO authenticated USING (true)` e policies de storage só com `bucket_id` expõem dados internos (precificação, estado compartilhado, anexos financeiros) e dados **de outros clientes** (relatórios mensais). O portal não depende dessas policies: usa service-role no servidor.

## Decisão
Toda policy que dá acesso a dado interno exige `is_internal_team_member(auth.uid()) OR is_admin(auth.uid())`. Dado de cliente só é entregue pelo servidor (service-role + URL assinada) depois de validar token/papel/campanha.

## Consequências
- Nenhuma mudança para a equipe; contas de cliente deixam de ler/escrever essas tabelas e buckets pela API direta.
- Toda migration nova que crie policy deve responder: "uma conta de cliente passa nisto?".
- Risco: membro interno sem `organization_members` ativo perderia acesso — por isso a migration traz consultas de verificação antes de aplicar.
