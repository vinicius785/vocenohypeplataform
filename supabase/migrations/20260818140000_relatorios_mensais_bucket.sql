-- Relatórios mensais de métricas (PDF) por campanha — o time sobe o PDF
-- pronto (feito fora da plataforma) e o cliente visualiza no portal sem
-- precisar baixar. Substitui o relatório antigo, gerado automaticamente a
-- partir das métricas preenchidas nos influenciadores (removido). Mesmo
-- padrão de bucket privado já usado em financeiro-anexos/entrega-anexos:
-- qualquer membro do time pode ler (uso interno) e subir/apagar o próprio
-- arquivo; o link público do cliente usa o service-role (bypassa RLS) pra
-- gerar uma URL assinada por fora.
insert into storage.buckets (id, name, public)
values ('relatorios-mensais', 'relatorios-mensais', false)
on conflict (id) do nothing;

CREATE POLICY "relatorios_mensais_read_authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'relatorios-mensais');

CREATE POLICY "relatorios_mensais_insert_authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'relatorios-mensais' AND owner = auth.uid());

CREATE POLICY "relatorios_mensais_delete_own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'relatorios-mensais' AND owner = auth.uid());
