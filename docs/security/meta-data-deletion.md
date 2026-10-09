# Callback de exclusão de dados da Meta

## URLs
| Uso | URL (produção) |
|---|---|
| Data Deletion Request Callback (POST, painel da Meta) | `https://plataforma.vocenohype.com.br/api/webhooks/meta-data-deletion` |
| Data Deletion Instructions URL (alternativa/complemento) | `https://plataforma.vocenohype.com.br/exclusao-de-dados` |
| Acompanhamento do pedido (devolvida à Meta em `url`) | `https://plataforma.vocenohype.com.br/exclusao-de-dados/<confirmation_code>` |

## Configuração
- `META_APP_SECRET`: "Chave secreta do aplicativo" (App Secret) do app na Meta (Configurações → Básico). Só em variável de ambiente (Vercel); nunca no código.
- `APP_URL` (já usada pelo Google OAuth) monta a `url` de acompanhamento.
- Migration `20261013000000_meta_data_deletion_requests.sql`: aplicar manualmente no SQL Editor.
- Sem `META_APP_SECRET` o endpoint responde 500 (`not_configured`) e não registra nada.

## Fluxo
1. A Meta faz `POST` com `signed_request=<assinatura>.<payload>` (form-urlencoded).
2. Valida o formato, a assinatura (HMAC-SHA256 do payload com o App Secret, comparação em tempo constante) e só então lê `user_id`/`issued_at`. Inválido/ausente/malformado → 400 sem gravar.
3. Grava o pedido em `meta_deletion_requests` com código de 128 bits. O ID da Meta **não** é guardado: só `HMAC(app_secret, "meta-user:"+id)`. `UNIQUE(meta_user_hash, issued_at)` torna a reentrega do mesmo pedido idempotente (mesmo código).
4. Processa: status `processing` → roda cada `MetaDataStore` registrado → só então `completed`. Falha deixa `failed` (a página mostra "em processamento"; a reentrega da Meta reprocessa).
5. Responde `{ "url": ..., "confirmation_code": ... }`.

## O que é excluído
Armazenamento registrado em `stores` na rota do callback: `instagramDeletionStore` (conexões do Instagram, `instagram_connections`). Para o identificador do pedido (`user_id` do `signed_request`, casado por HMAC com `ig_user_hash` e `ig_app_user_hash`) o fluxo apaga **só** a conexão daquele influenciador: token criptografado, @, perfil e métricas importadas. Não apaga o cadastro do influenciador, a organização, o cliente nem outras conexões. Se não houver conexão, o pedido conclui com 0 registros, após a verificação.

A assinatura aceita o App Secret do app Meta (`META_APP_SECRET`) **ou** do produto Instagram (`INSTAGRAM_APP_SECRET`); os hashes usam sempre `META_APP_SECRET` como chave. Incerteza a confirmar com o primeiro pedido real: o `user_id` do pedido pode ser o ID app-scoped (`user_id` do OAuth) ou o ID da conta profissional; os dois hashes são guardados e qualquer um casa.

## Retenção que NÃO é apagada
Nenhum dado financeiro/contratual do influenciador é tocado: o pedido refere-se à identidade Instagram, não ao cadastro. Retenções legais ficam fora (documentadas na Política de Privacidade).

## Novos armazenamentos
Para cada nova integração com dados vinculados à Meta, registrar um `MetaDataStore` na rota do callback e gravar o mesmo `metaUserHash(id, META_APP_SECRET)` ao vincular a identidade.

## Limitações
- Sem integração Meta ativa não há como testar fim a fim com a Meta; os testes automatizados cobrem assinatura, idempotência, estados, isolamento e ausência de vazamento em logs.
- Rotacionar o App Secret muda o hash: pedidos antigos não casam por `issued_at`/hash com reentregas novas (aceitável).
- A consulta pública não tem limitador de taxa: o código tem 128 bits (inviável de enumerar) e a resposta não traz dado pessoal.
