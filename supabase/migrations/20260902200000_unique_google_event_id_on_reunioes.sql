-- Corrige corrida na importação do Google Calendar: dois ciclos de sync
-- concorrentes podiam inserir a MESMA ocorrência duas vezes (mesmo
-- googleEventId), já que a checagem "já existe?" e o INSERT não eram
-- atômicos. Um índice único torna isso impossível no banco — o segundo
-- INSERT concorrente falha com unique_violation, e o código trata esse
-- erro como "já foi importado por outra chamada", sem duplicar.
create unique index if not exists reunioes_google_event_id_unique
  on public.reunioes (((data->>'googleEventId')))
  where data->>'googleEventId' is not null;
