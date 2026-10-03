-- Remoção DEFINITIVA de Fase/Roadmap, Início e Estimativa das tarefas.
--
-- Decisão confirmada pelo usuário em 2026-10-02 ("Remover definitivamente",
-- sem cópia de arquivo), após levantamento dos dados reais em produção:
--   * projeto_fases: 2 fases em 1 projeto            -> tabela removida
--   * tarefas com roadmapPhaseId: 29 (todas de projeto) -> chave removida
--   * tarefas com startDate ("Início"): 17 (4 projeto, 11 campanha,
--     2 Marketing)                                    -> chave removida
--   * tarefas com estimate ("Estimativa"): 0           -> chave removida
--   * projetos com a feature "roadmap": 2              -> item removido
--   * marcos (milestones) com faseId: 0                -> chave removida
--
-- Nada no banco dependia disso além de `projeto_fases` (sem FK apontando pra
-- ela; RLS, índice, trigger `sync_data_id_trigger` e a FK `updated_by` saem
-- junto com a tabela). Os campos das tarefas nunca foram colunas: são chaves
-- dentro do JSONB `data` de projeto_tarefas / campanha_tarefas /
-- marketing_standalone_tasks (inclusive em subtarefas aninhadas) e do array
-- legado `projetos.data.tasks` (dado morto, ignorado pelo app).
--
-- O frontend correspondente já não lê nem grava nenhum desses campos, e
-- ignora a feature "roadmap" se ainda existir — pode ser aplicada antes ou
-- depois do deploy.

-- 1) Função auxiliar temporária: remove as chaves de uma tarefa e, de forma
--    recursiva, das suas subtarefas (preservando a ordem).
create or replace function public._strip_removed_task_fields(t jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb;
  subs jsonb;
begin
  if t is null or jsonb_typeof(t) <> 'object' then
    return t;
  end if;
  result := t - 'startDate' - 'estimate' - 'roadmapPhaseId';
  subs := result -> 'subtasks';
  if subs is not null and jsonb_typeof(subs) = 'array' then
    result := jsonb_set(
      result,
      '{subtasks}',
      coalesce(
        (select jsonb_agg(public._strip_removed_task_fields(x.e) order by x.ord)
           from jsonb_array_elements(subs) with ordinality as x(e, ord)),
        '[]'::jsonb
      )
    );
  end if;
  return result;
end;
$$;

-- 2) Tarefas (per-row) e tarefas avulsas do Marketing.
update public.projeto_tarefas
   set data = public._strip_removed_task_fields(data)
 where data is distinct from public._strip_removed_task_fields(data);

update public.campanha_tarefas
   set data = public._strip_removed_task_fields(data)
 where data is distinct from public._strip_removed_task_fields(data);

update public.marketing_standalone_tasks
   set data = public._strip_removed_task_fields(data)
 where data is distinct from public._strip_removed_task_fields(data);

-- 3) Projetos: array legado de tarefas, feature "roadmap" e faseId dos marcos.
update public.projetos
   set data = jsonb_set(
         data,
         '{tasks}',
         coalesce(
           (select jsonb_agg(public._strip_removed_task_fields(x.e) order by x.ord)
              from jsonb_array_elements(data -> 'tasks') with ordinality as x(e, ord)),
           '[]'::jsonb
         )
       )
 where jsonb_typeof(data -> 'tasks') = 'array'
   and (data -> 'tasks') is distinct from coalesce(
         (select jsonb_agg(public._strip_removed_task_fields(x.e) order by x.ord)
            from jsonb_array_elements(data -> 'tasks') with ordinality as x(e, ord)),
         '[]'::jsonb
       );

update public.projetos
   set data = jsonb_set(
         data,
         '{features}',
         coalesce(
           (select jsonb_agg(x.f order by x.ord)
              from jsonb_array_elements(data -> 'features') with ordinality as x(f, ord)
             where x.f <> '"roadmap"'::jsonb),
           '[]'::jsonb
         )
       )
 where jsonb_typeof(data -> 'features') = 'array'
   and (data -> 'features') @> '["roadmap"]'::jsonb;

update public.projetos
   set data = jsonb_set(
         data,
         '{milestones}',
         (select jsonb_agg(
                   case when jsonb_typeof(x.m) = 'object' then x.m - 'faseId' else x.m end
                   order by x.ord)
            from jsonb_array_elements(data -> 'milestones') with ordinality as x(m, ord))
       )
 where jsonb_typeof(data -> 'milestones') = 'array'
   and exists (
         select 1 from jsonb_array_elements(data -> 'milestones') m
          where jsonb_typeof(m) = 'object' and m ? 'faseId'
       );

-- 4) Fases do roadmap.
drop table if exists public.projeto_fases;

-- 5) Remove a função auxiliar (não fica nenhuma estrutura sem finalidade).
drop function public._strip_removed_task_fields(jsonb);
