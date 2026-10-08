# Assinatura de contratos — Autentique (Fase 3, primeira camada)

Status: **camada de provedor + teste controlado em sandbox.** Sem UI, sem tabela, sem rota de webhook
ainda (ver "Pendências"). Data da auditoria: 2026-10-09. Fonte: documentação oficial
(`https://docs.autentique.com.br/api/`), páginas citadas em cada item.

## 1. Auditoria do repositório

Não existe integração anterior com Autentique nem D4Sign (nenhum token, cliente HTTP, mutation,
webhook, tabela ou função). `contratos` (tabela) é o contrato **da agência com o cliente** e tem
status próprios (`rascunho`/`em_assinatura`/`vigente`/`encerrado`/`cancelado`); o contrato de
influenciador (motor `src/lib/contrato-influenciador.ts`) ainda **não tem persistência**.

## 2. Como autentica

GraphQL único: `POST https://api.autentique.com.br/v2/graphql`, header `Authorization: Bearer <token>`.
Token gerado no painel (Chaves de API). **Limite: 60 req/min** no plano Profissional (10 no Free,
200 no Corporativo); excedeu → HTTP 429 `{"message":"Too Many Attempts."}`.

## 3. Operações necessárias

| Necessidade     | Operação                                                                                                                                          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criar + enviar  | `createDocument(document, signers, file: Upload!, sandbox?, organization_id?, folder_id?)` — **cria e já envia** (não há passo "enviar" separado) |
| Status/arquivos | `document(id)` → `signatures { public_id email viewed signed rejected … }`, `files { original signed pades }`                                     |
| Cancelar        | `deleteDocument(id)` — **não bloqueia** assinatura se alguém já assinou; para bloquear, atualizar `deadline_at` para agora (`editing-a-document`) |
| Reenviar        | `resend-signatures` (grátis)                                                                                                                      |

Não existe campo de "status do documento": o estado sai dos eventos de cada assinatura
(`autentique-status.ts`). Erros de validação voltam como `errors[].extensions.validation` (HTTP pode ser
200). Códigos úteis: `unauthorized`, `unavailable_credits`, `must_be_a_valid_email_address`,
`must_be_a_valid_file`, `document_not_found`, `not_your_turn`.

## 4. Formato de criação

Requisição **multipart** (spec graphql-multipart-request): `operations` (query + variables com
`file: null`), `map` (`{"file":["variables.file"]}`) e `file`. `DocumentInput` relevante: `name`,
`sortable` (assina na ordem do array), `refusable`, `message`, `reminder`, `deadline_at`,
`locale`. Tamanho máximo do arquivo: 5 MB (Free) / 20 MB (Profissional).

## 5. Signatários

`SignerInput`: `email` (recebe o link) · `name` · `phone` + `delivery_method`
(`DELIVERY_METHOD_WHATSAPP`/`SMS`) · `action` (`SIGN`…) · `configs.cpf` (só quem tem esse CPF assina)
· `positions` (`x`,`y` em %, `z` = página, `element` `SIGNATURE`/`NAME`/`DATE`/`CPF`…) ·
`security_verifications` (`SMS`, `MANUAL`, `UPLOAD`, `LIVE`, `PF_FACIAL`…; algumas cobradas à parte).
Decisões do projeto: **2 signatários** (CONTRATADO, CONTRATANTE), **sem testemunhas**, **um contrato por
participação/campanha**. Padrão: link por e-mail, sem verificação extra (SMS é opcional e custa $0,03).

## 6. Template / documento — **achado principal**

**O Autentique não faz substituição de variáveis nem usa templates pela API.** A documentação diz que
"não há como usar os templates do painel para criar documentos pela API"; o caminho oficial é gerar o
arquivo final localmente (o exemplo cita **HTML** com `$Variavel$` substituída por código) e enviá-lo.
A lista de extensões aceitas **não está documentada** (há o erro `must_be_a_valid_file` com a lista).
Consequências:

- O mecanismo de template da D4Sign não vale aqui; **nós geramos o documento final** (variáveis do
  motor → texto/tabelas) antes de enviar.
- O `.docx` oficial do contrato **não está no repositório**. Gerar PDF/HTML fiel ao layout depende de
  receber o modelo e decidir o formato (a testar em sandbox: PDF vs HTML vs DOCX).
- `[DATA_ASSINATURA]` já saiu do contrato (a data é a do provedor), o que combina com este modelo.

## 7. Webhook

Endpoint HTTPS cadastrado no painel (Desenvolvedor → Webhooks) com os tipos de evento desejados; POST
JSON `{ id, object:"webhook", event:{ id, type, organization, data:{object}, created_at } }`.
Eventos: `document.created|updated|deleted|finished`, `signature.created|updated|deleted|viewed|accepted|rejected|delivery_failed`
(+ biometria e `member.*`). **Autenticidade:** header `x-autentique-signature` = HMAC-SHA256 (hex) do
**corpo cru** com o segredo do endpoint (`autentique-webhook.ts`, comparação em tempo constante).
Entrega: pode **duplicar** e **fora de ordem**; retentativas em 60 s, 120 s e 300 s, e o evento fica 14 dias
na lista de não entregues → deduplicar por `event.id` e, se o objeto não existir, consultar a API.
O formato antigo de webhook está **deprecated**.

## 8. Estados

Provedor → normalizado (`SignatureDocumentState`): `aguardando` · `parcial` · `assinado` ·
`recusado` · `cancelado`. Mapeamento proposto para o contrato de influenciador (nomes finais a
alinhar com o modelo): `rascunho` → `enviando` (trava de idempotência) → `aguardando_assinatura` →
`assinado`; exceções `recusado`, `cancelado`, `erro_envio`.

## 9. Persistência — PROPOSTA (nada foi criado)

Uma tabela nova `contratos_influenciador` (o domínio não existe hoje; não dá para reaproveitar
`contratos`):

- `id uuid pk`, `participacao_id` (campanha_influenciadores.id) **UNIQUE** entre contratos ativos
  (um contrato por participação) → impede duplicidade por clique duplo;
- `status text`, `template_version`, `snapshot jsonb` (fotografia dos dados usados — o motor já
  prevê), `provider text`, `external_id text` (id do documento), `signers jsonb`
  (`[{role, externalId, email}]` — sem CPF fora do snapshot), `sent_at`, `signed_at`,
  `last_error_code`, timestamps;
- `contrato_eventos` (`event_id text` **UNIQUE**, `contrato_id`, `type`, `received_at`) — dedup de
  webhook e trilha mínima;
- RLS: só time interno com a permissão do módulo; webhook escreve via service role.
  Aprovar antes de implementar.

## 10. Variáveis de ambiente

```
AUTENTIQUE_API_TOKEN=          # servidor apenas
AUTENTIQUE_WEBHOOK_SECRET=     # segredo do endpoint de webhook
```

Documentadas em `.env.example` (sem valores). Nunca em código, log, commit ou frontend.

## 11. Falhas (comportamento definido na camada)

| Situação                       | Código           | Repetível                                           |
| ------------------------------ | ---------------- | --------------------------------------------------- |
| Sem token                      | `not_configured` | não                                                 |
| Token inválido / 401 / 403     | `unauthorized`   | não                                                 |
| 429                            | `rate_limited`   | sim                                                 |
| 5xx / rede / resposta inválida | `unavailable`    | sim                                                 |
| Timeout (25 s)                 | `timeout`        | sim — **cuidado: o documento pode ter sido criado** |
| E-mail/telefone inválido       | `invalid_signer` | não                                                 |
| Arquivo recusado               | `invalid_file`   | não                                                 |
| Sem créditos                   | `no_credits`     | não                                                 |

Mensagens nunca contêm token, texto do provedor ou conteúdo do documento.

## 12. Idempotência

O Autentique **não oferece chave de idempotência** (a documentação não a menciona). Estratégia
proposta: (1) antes de chamar, gravar o contrato como `enviando` com `UNIQUE(participacao_id)` —
quem perder a corrida não chama a API; (2) o nome do documento carrega o id do nosso contrato
(`VNH-<id>`), permitindo reconciliar um documento órfão após timeout (listar documentos e procurar
pelo nome) antes de tentar de novo; (3) retry só em erro **não ambíguo** (429/5xx antes de criar).

## 13. Riscos

1. **Geração do documento** (sem templates na API) — maior risco; precisa do `.docx` e do formato.
2. Timeout ambíguo cria documento sem registro local → reconciliação pelo nome.
3. Custos: Free = 10 documentos/mês e 10 req/min; cobrança por documento e por signatário
   (e-mail $0,002; WhatsApp $0,02; SMS $0,03); sandbox é grátis.
4. Cancelar após assinatura parcial não bloqueia o documento (usar `deadline_at`).
5. Webhook fora de ordem/duplicado → sempre confirmar o estado consultando o documento.
6. Dados sensíveis (CPF/PIX) vão dentro do arquivo: enviar só o necessário e não logar conteúdo.

## 14. Arquitetura implementada (menor camada)

```
src/lib/signature/
  signature-provider.ts   interface SignatureProvider + tipos + SignatureProviderError (puro)
  autentique.server.ts    AutentiqueProvider (GraphQL/multipart, timeout, erros→códigos) — só servidor
  autentique-status.ts    deriva o estado do documento (puro)
  autentique-webhook.ts   verifica HMAC, extrai evento, estado sugerido (puro)
  minimal-pdf.ts          PDF fictício para o teste (não é o gerador do contrato)
scripts/autentique-sandbox-smoke.ts   teste controlado em sandbox
```

## 15. Como rodar o teste controlado (depende de configuração da conta)

```bash
AUTENTIQUE_API_TOKEN=<token> \
AUTENTIQUE_SMOKE_CONTRATADO_EMAIL=<seu e-mail 1> \
AUTENTIQUE_SMOKE_CONTRATANTE_EMAIL=<seu e-mail 2> \
bun scripts/autentique-sandbox-smoke.ts          # apaga o documento no final
bun scripts/autentique-sandbox-smoke.ts --keep   # mantém para olhar no painel
```

Usa `sandbox: true` (sem crédito; apagado pelo provedor em alguns dias), PDF fictício e e-mails seus.
O que o teste **ainda vai nos dizer** (não está na documentação): extensões aceitas (PDF/HTML/DOCX),
posição padrão das assinaturas sem `positions`, se `configs.cpf` aceita só CPF (e CNPJ?), se o
sandbox envia e-mail, e o formato exato dos eventos de webhook.

## 16. Pendências / depende da conta

- Gerar o token e rodar o teste acima (nenhum token foi usado neste repositório).
- Cadastrar o endpoint de webhook no painel e obter o `AUTENTIQUE_WEBHOOK_SECRET` — só depois da rota.
- Definir: formato do documento final, ordem de assinatura (default do script: CONTRATADO primeiro),
  verificação extra (SMS?) e plano (Free tem 10 documentos/mês).
- Aprovar a tabela da seção 9; depois: rota `api/public/autentique-webhook` (verificar HMAC →
  deduplicar `event.id` → responder 2xx → reconsultar o documento → atualizar o contrato).

## 17. Evidência do primeiro teste real (sandbox, 2026-10-09)

Resultado do `scripts/autentique-sandbox-smoke.ts` com o token real da conta:

- **Passo 1 — OK:** autenticação, endpoint, multipart, `sandbox: true` e `createDocument` foram aceitos.
  O Autentique devolveu o id do documento e **3** assinaturas.
- **Passo 2 — falhou no NOSSO cliente, não no Autentique:** a consulta foi recusada antes de sair, com
  `not_found: Identificador de documento inválido`.

**Causa:** o cliente validava o id do documento como **UUID**, mas o id real devolvido pelo
`createDocument` tem **50 caracteres hexadecimais** (ex.: `65369b2e…b5`), não UUID. A documentação
chama o argumento de "UUID", o que não vale para o id que a própria API entrega. Correção: a validação
passou a aceitar `[A-Za-z0-9_-]{8,128}` (mantém a proteção contra aspas/chaves no texto da query).
Também saiu `deleted_at` da consulta `document(id)`, por não constar entre os campos documentados
dela (só aparece em `documentsByFolder`).

**A 3ª assinatura:** o smoke imprimia o papel `null` — ou seja, uma assinatura cujo e-mail não é de
nenhum dos dois signatários que enviamos (o `**null**` do relato é só o papel impresso). Não é
"signatário sem nome" por definição; a hipótese a confirmar é que o Autentique inclui também o dono
da conta/token. O smoke agora imprime nome, e-mail mascarado, ação e se há conta; `--raw` mostra a
resposta GraphQL crua com e-mail, telefone e links mascarados.
