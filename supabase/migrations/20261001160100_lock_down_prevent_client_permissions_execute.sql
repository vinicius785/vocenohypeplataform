-- Esta função só deve rodar como trigger interno de `profiles` — nunca
-- via RPC direto (`/rest/v1/rpc/prevent_client_permissions`). Revoga o
-- EXECUTE que toda função nova ganha por padrão (fecha o warning do
-- advisor "Public/Signed-In Can Execute SECURITY DEFINER Function");
-- triggers continuam disparando normalmente, pois a checagem de EXECUTE
-- só se aplica a chamadas diretas de função, nunca ao disparo do trigger.
revoke all on function public.prevent_client_permissions() from public;
revoke all on function public.prevent_client_permissions() from anon;
revoke all on function public.prevent_client_permissions() from authenticated;
