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

## O que é excluído hoje
**Nada, porque não existe dado vinculado à Meta**: a plataforma não tem login nem API da Meta e não guarda identificadores dela (auditoria de 2026-10-09; @ e links de Instagram são digitados à mão e não estão ligados a uma identidade Meta). O pedido é registrado, a verificação roda (`META_DATA_STORES` vazio) e a conclusão informa 0 registros. Isso é o comportamento correto e verdadeiro, mas **não** é "processamento simulado": o status só vira `completed` depois da verificação.

## Quando houver integração com a Meta
Registrar em `META_DATA_STORES` (`src/lib/meta-data-deletion.ts`) um `MetaDataStore` por local de dados (tokens, vínculos, dados importados). `deleteForMetaUser(hash)` deve apagar **só** o que pertence àquela identidade (nunca a conta, a organização ou o cliente) e devolver a contagem; para isso a integração deve gravar o mesmo `metaUserHash(userId, META_APP_SECRET)` ao vincular a identidade. Retenção legal (financeiro, contratos) fica fora da exclusão e deve ser documentada no store.

## Limitações
- Sem integração Meta ativa não há como testar fim a fim com a Meta; os testes automatizados cobrem assinatura, idempotência, estados, isolamento e ausência de vazamento em logs.
- Rotacionar o App Secret muda o hash: pedidos antigos não casam por `issued_at`/hash com reentregas novas (aceitável).
- A consulta pública não tem limitador de taxa: o código tem 128 bits (inviável de enumerar) e a resposta não traz dado pessoal.
