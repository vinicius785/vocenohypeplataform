-- Marca quando a pessoa clicou em "Começar o dia" — usado pra decidir se o
-- botão deve aparecer (só uma vez por dia, a partir das 06h, e nunca mais de
-- uma vez entre dispositivos, já que o campo é por usuário no banco).
alter table public.profiles add column if not exists last_day_started_at timestamptz;
