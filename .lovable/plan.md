
## Objetivo

Permitir que qualquer formulário externo (via Make/Integromat, Typeform, Tally, site próprio, etc.) envie o lead direto para a base **Comercial** da ferramenta, aparecendo automaticamente no Kanban.

## Situação atual

Hoje os leads da aba Comercial vivem só no `localStorage` do navegador (`comercial:leads` em `src/lib/comercial.ts`). Não existe tabela no banco nem endpoint para receber dados de fora — então é impossível o Make cadastrar qualquer coisa. Precisamos migrar a base para o Lovable Cloud e criar um webhook.

## O que vou fazer

### 1. Tabela `leads` no banco
Criar `public.leads` com os campos do tipo `Lead` (name, company, contact, email, phone, value, stage, tags, source, responsible, notes, created_at, updated_at, e um `source_form` para saber de qual formulário veio). RLS ligado: só usuários autenticados leem/editam; `service_role` (usado pelo webhook) pode inserir.

### 2. Endpoint público de webhook
Criar `src/routes/api/public/leads.ts` (POST). Ele:
- Valida um header `X-Webhook-Secret` contra um segredo `LEADS_WEBHOOK_SECRET` (gerado automaticamente e guardado no cofre).
- Valida o corpo com Zod (name obrigatório; demais opcionais; `stage` cai em `"lead"` por padrão).
- Insere na tabela `leads` usando o cliente admin.
- Responde `{ ok: true, id }` ou erro com status apropriado.

URL final estável: `https://project--e4e36f6a-b9c5-4a9c-9f8e-4611e5e55d3c.lovable.app/api/public/leads`

### 3. Refatorar `ComercialSection` para ler do banco
- `src/lib/comercial.functions.ts` com `listLeads`, `upsertLead`, `deleteLead` (usando `requireSupabaseAuth`).
- `ComercialSection.tsx` passa a usar `useQuery`/`useMutation` em vez de `loadLeads/saveLeads`. Assim leads que chegam pelo webhook aparecem para todos.
- Mantém a mesma UI/Kanban; só troca a fonte de dados.

### 4. Instruções do Make (mostro no chat depois de publicar)
No cenário do Make, depois do trigger do formulário:
1. Adicione o módulo **HTTP → Make a request**.
2. URL: a do webhook acima. Método: **POST**.
3. Headers: `Content-Type: application/json` e `X-Webhook-Secret: <valor que te mostro>`.
4. Body (JSON), mapeando os campos do formulário:
   ```json
   {
     "name": "{{nome}}",
     "email": "{{email}}",
     "phone": "{{telefone}}",
     "company": "{{empresa}}",
     "value": 0,
     "source": "Formulário site",
     "notes": "{{mensagem}}"
   }
   ```
5. Rode uma vez para testar — o lead aparece na coluna "Lead recebido".

## Detalhes técnicos

- **Segredo**: gerado com `generate_secret` (`LEADS_WEBHOOK_SECRET`, 48 chars). Eu te mostro o valor uma vez pra você colar no Make.
- **Migração dos leads atuais do localStorage**: como estão só no seu navegador e o app é novo, não faço migração automática — se quiser, cadastro manualmente os que existem hoje. Me avise.
- **Campos mínimos aceitos pelo webhook**: só `name`. Todo o resto é opcional pra não travar formulários simples.
- **Segurança**: rota fica em `/api/public/*` (sem auth do app), mas o header secreto é obrigatório; sem ele responde 401.
- **Rate limiting**: não vou adicionar (não existe primitivo padrão). Se algum dia começar a receber spam, revalidamos.

## O que preciso de você antes de implementar

Nada obrigatório — posso seguir. Só confirme:
1. Ok gerar um segredo novo (`LEADS_WEBHOOK_SECRET`) e você guarda ele no Make?
2. Quer que os leads criados pelo webhook caiam sempre em **"Lead recebido"**, ou o Make pode escolher o estágio?
