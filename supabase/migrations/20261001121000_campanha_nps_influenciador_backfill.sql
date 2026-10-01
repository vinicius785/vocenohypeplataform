-- Backfill único: a trigger `campanha_influenciadores_ensure_nps` só
-- dispara em INSERT/UPDATE futuros — influenciadores que já estavam
-- `APROVADO` antes dela existir nunca tiveram esse evento disparado, então
-- ficariam sem token de NPS até o próximo UPDATE da linha (que pode nunca
-- vir, já que aprovado é um estado estável). Diagnóstico rodado antes
-- deste backfill (produção, 2026-10-01): 54 influenciadores já aprovados
-- em campanhas existentes. Mesmo `ON CONFLICT DO NOTHING` da trigger —
-- gera só o token que falta, nunca sobrescreve/recria um já existente,
-- nunca toca em `score`/`comment`/`answered_at`.
insert into public.campanha_nps_influenciador (campanha_id, influenciador_id, token)
select ci.campanha_id, ci.id, encode(gen_random_bytes(16), 'hex')
from public.campanha_influenciadores ci
where ci.data->>'status' = 'APROVADO'
on conflict (campanha_id, influenciador_id) do nothing;
