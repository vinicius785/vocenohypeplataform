-- "Registrar follow-up" (simplificação do Pipe Comercial): até aqui, uma
-- interação comercial (ligação/e-mail/reunião) só existia dentro do array
-- solto `leads.activities` (jsonb), sem `outcome`/próxima-ação estruturados
-- nem autor dedicado — só editável abrindo a ficha inteira do lead. Esta
-- migration cria uma tabela própria pro registro rápido pelo card, sem
-- remover `leads.activities` (continua existindo, usado por notas/tarefas
-- manuais dentro do drawer).
--
-- Este módulo não é multi-tenant por workspace (não existe `workspace_id`
-- em `leads` nem em nenhuma outra tabela do Comercial) — o isolamento real
-- hoje é a permissão `comercial` (`has_permission`, mesma política de
-- `leads`). Reaproveitada aqui em vez de inventar um `workspace_id` que
-- não existiria em lugar nenhum para join.
create table public.commercial_interactions (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.leads(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  -- Denormalizado (mesmo padrão já usado em `Lead.history`/`LeadHistoryEntry`,
  -- que sempre grava o nome do autor dentro do próprio texto) — evita um
  -- join com `profiles` só pra exibir "quem registrou" no histórico.
  created_by_name text not null,
  interaction_type text not null check (interaction_type in ('whatsapp', 'ligacao', 'email', 'reuniao', 'outro')),
  occurred_at timestamptz not null,
  summary text not null check (char_length(btrim(summary)) > 0),
  outcome text check (outcome in ('respondeu', 'nao_respondeu', 'aguardando_retorno', 'interessado', 'sem_interesse', 'proposta_solicitada', 'reuniao_agendada')),
  next_action_description text,
  next_action_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.commercial_interactions is
  'Follow-ups comerciais registrados pelo time (WhatsApp/ligação/e-mail/reunião/outro) — histórico comercial separado das alterações técnicas do lead (nome, valor, responsável, etapa), que continuam em leads.extra.history.';

create index commercial_interactions_opportunity_id_idx
  on public.commercial_interactions (opportunity_id, occurred_at desc);
create index commercial_interactions_created_by_idx
  on public.commercial_interactions (created_by);

alter table public.commercial_interactions enable row level security;

-- Leitura: qualquer pessoa com permissão comercial vê o histórico de
-- qualquer oportunidade (mesmo padrão de `leads` — o time inteiro
-- acompanha o mesmo pipeline). Escrita: só quem tem permissão comercial E
-- só em nome de si mesmo (`created_by = auth.uid()`) — nunca confia em
-- `created_by`/`created_by_name` soltos vindos do payload sem essa
-- checagem. Sem policy de UPDATE/DELETE: um follow-up registrado é
-- histórico factual (o que realmente aconteceu), não deve ser editável
-- depois — o mesmo princípio já usado pra `LeadHistoryEntry`.
create policy "comercial read interactions" on public.commercial_interactions
  for select to authenticated
  using (public.has_permission(auth.uid(), 'comercial'));

create policy "comercial insert own interactions" on public.commercial_interactions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and public.has_permission(auth.uid(), 'comercial')
  );

create trigger commercial_interactions_set_updated_at
before update on public.commercial_interactions
for each row execute function public.update_updated_at_column();

-- Texto da próxima ação combinado com `leads.next_action_at` (já existente,
-- adicionado numa migration anterior) — sem isso o card não teria como
-- mostrar "Enviar apresentação comercial" sem buscar a última interação a
-- cada render.
alter table public.leads add column next_action_description text;
comment on column public.leads.next_action_description is
  'Texto livre da próxima ação combinada (ex.: "Enviar apresentação comercial") — espelha o campo mais recente vindo de commercial_interactions.next_action_description ou de uma reunião agendada pelo motor. NULL quando não há próxima ação.';
