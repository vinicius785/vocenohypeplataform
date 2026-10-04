# Demo operacional — runbook

Para quem **usa** a demonstração (comercial) e para quem **mantém** (dev). A decisão e o histórico de construção estão em [`decisions/0004-demo-operacional.md`](../decisions/0004-demo-operacional.md).

## O que é

Uma campanha **real, mas isolada**, criada a partir de um lead do CRM, com dados fictícios. O time a opera na tela de Campanhas e o cliente a opera no portal, por **link**, sobre o **mesmo estado** — o que um faz aparece para o outro em poucos segundos.

- Não envia e-mail, WhatsApp, push, webhook nem convite a ninguém. Não altera o lead. Não gera receita, custo nem NPS.
- Não aparece em Clientes, Campanhas (lista), Financeiro, Início, Banco de Influenciadores, tarefas globais nem notificações. Abre **só** pelo lead (ou pelo atalho "Abrir campanha").
- O cliente **não precisa de conta**: o link é a credencial. Vale **14 dias**, pode ser renovado e pode ser revogado.

## Para o comercial

### Criar e compartilhar

1. Abra o lead (Comercial) → aba **Visão geral** → seção **Demonstração** → **Criar demonstração**.
2. Quando estiver **Ativa**: **Copiar link** e envie ao cliente. **Abrir como cliente** mostra o que ele verá.
3. **Abrir campanha** leva ao detalhe da campanha no lado do time (selo "Ambiente de demonstração" no cabeçalho).

### Roteiro de demonstração ao vivo (≈ 10 minutos)

1. Você abre o link do cliente numa janela e a campanha do time em outra.
2. **Influenciadores**: o cliente aprova um perfil e reprova outro (com motivo). No time, o perfil recusado aparece com o motivo.
3. **Substituição**: no time, envie outro influenciador da _Curadoria_ ao cliente (o fluxo de sempre) — ele aparece no portal; o cliente aprova.
4. **Roteiro**: o cliente aprova um roteiro e pede ajuste em outro. No time, o ajuste aparece com o comentário; reenvie a nova versão; o cliente aprova.
5. **Conteúdo**: o cliente aprova um conteúdo e pede ajuste em outro; o time reenvia.
6. **Resultado**: o cliente vê as métricas (alcance, visualizações, curtidas, comentários, compartilhamentos, salvamentos) e abre o relatório do mês.
7. **Atividade**: no selo da campanha → **Ver atividade** mostra a narrativa ("Cliente reprovou …", "Time reenviou o roteiro …").
8. **Entre uma demo e outra**: selo → **Reiniciar demonstração** devolve tudo ao cenário inicial (mesmo link, mesma validade).

### Gerenciar (selo da campanha ou menu ••• do lead)

| Ação             | O que faz                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Renovar validade | Mais 14 dias, **mesmo link**.                                                                                                     |
| Gerar novo link  | O link atual **deixa de funcionar**; o novo vale 14 dias.                                                                         |
| Reiniciar        | Desfaz comentários, aprovações e alterações. Link e validade continuam.                                                           |
| Revogar acesso   | O link morre agora; a campanha e o histórico seguem com o time. Para voltar: **Gerar novo link** (um link revogado nunca revive). |
| Encerrar         | O cliente perde o acesso **para sempre**; não reabre. O lead pode ter uma **nova** demonstração.                                  |

Só existe **uma demonstração ativa por lead**.

## O que o cliente vê quando algo dá errado

Sempre a mesma tela — **"Link inválido ou expirado."** — seja link inexistente, expirado, revogado, encerrado ou limite de uso. O texto nunca revela o motivo (de propósito).

## Solução de problemas

| Sintoma                                                         | Causa provável                                          | O que fazer                                                                                   |
| --------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| "A Demo ainda não pode ser usada: …" ao criar                   | Falta migration no banco (veja _Migrations_)            | Aplicar a migration citada e tentar de novo.                                                  |
| "Não foi possível criar a demonstração agora. Nada foi criado"  | Falha no meio; tudo foi desfeito                        | Tentar de novo. Se repetir, ver o log do servidor (`[demo]`, `[portal] demo_apply_scenario`). |
| "A demonstração ainda está sendo carregada" ao abrir a campanha | A demo recém-criada ainda não chegou ao navegador       | Aguardar 1–2 s e clicar de novo.                                                              |
| O cliente não vê uma mudança do time                            | O sinal em tempo real falhou                            | Aparece sozinho em até **20 s** (polling de segurança).                                       |
| A demo "sumiu" das listas                                       | É assim mesmo (oculta)                                  | Abrir pelo lead → **Abrir campanha**.                                                         |
| Cliente diz que o link não abre                                 | Expirou (14 dias), foi revogado ou a demo foi encerrada | **Renovar** (expirado) ou **Gerar novo link** (revogado). Encerrada: criar uma nova.          |

## Para quem mantém

### Arquivos

| Parte                                         | Onde                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Migrations                                    | `supabase/migrations/20261005000000_demo_operacional.sql`, `20261005120000_demo_apply_scenario_fix.sql`                   |
| Regras do ciclo de vida (puras, testáveis)    | `src/lib/demo/demo-service.ts` · persistência: `demo-service.server.ts`                                                   |
| Cenário (função pura e determinística)        | `src/lib/demo/cenario-campanha-completa.ts` · arquivos de exemplo: `demo-assets.server.ts`                                |
| Transições (mapeadas nas máquinas existentes) | `src/lib/demo/demo-estados.ts`                                                                                            |
| Funções públicas do cliente (por token)       | `src/lib/demo/demo-public.ts`, `demo-public.server.ts`, `src/lib/demo-public.functions.ts`                                |
| Funções do time (permissão `comercial`)       | `src/lib/demo.functions.ts`                                                                                               |
| Ocultar a Demo no time                        | `table-array-store.ts` (`isHidden`), `clientes-store.ts`, `campanha-scoped-store.ts`, `demo/demo-visibility.ts`           |
| Guardas de efeitos externos                   | `demo/demo-guards.ts`, `demo/demo-scans.ts`, `email-provider.server.ts` (`sendEmail`), `cliente-link.functions.ts` (push) |
| Portal do cliente                             | `src/routes/demo.$token/`, `features/client-portal-v2/runtime/`                                                           |
| Sinal em tempo real                           | `src/lib/demo/demo-signal.ts`                                                                                             |
| Narrativa                                     | `src/lib/demo/demo-timeline.ts`                                                                                           |

### Regras que não podem quebrar

- **Marcador**: `clientes.data.demoSessionId`, imutável (gatilho `clientes_demo_marker_guard`). É o que esconde a demo do time.
- **Isolamento**: toda função pública deriva a campanha da **sessão** (nunca do que o navegador manda) e rejeita qualquer outra.
- **Token**: 32 bytes aleatórios, só em `demo_sessions.token` (sem `SELECT` para `authenticated`). Nunca em log, bucket de limite ou URL do time.
- **Ator** das ações do cliente é fixo: "Cliente (demonstração)".
- **Sem efeito externo**: `sendEmail` recusa `.invalid`; o push aos admins pula demo; nenhum webhook passa pela demo.
- **`demo_prerequisites()`** (SQL) é a trava: `createDemo`/`restartDemo` recusam se a migration da Demo ou as guardas faltarem.

### Migrations (ordem e papel)

| #   | Arquivo                                                         | Papel                                                                     |
| --- | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | `20261004000000_restrict_internal_data_to_internal_members.sql` | RLS: dados internos só para a equipe (pré-requisito de segurança).        |
| 2   | `20261005000000_demo_operacional.sql`                           | Tabelas, guardas, `demo_apply_scenario`, `demo_prerequisites`.            |
| 3   | `20261005120000_demo_apply_scenario_fix.sql`                    | Corrige `uuid = text` em `campanha_nps` (achado ao testar no banco real). |

Verificação: `select public.demo_prerequisites();` → `schemaVersion: 1` e os três booleanos `true`.

### Limpeza manual (só se a criação falhar no meio **e** o desfazer também falhar)

```sql
-- 1) achar demos e o que pertence a elas
select s.id, s.status, s.created_at, s.cliente_id, s.campanha_id, s.organization_id,
       c.data->>'empresa' as empresa
from public.demo_sessions s left join public.clientes c on c.id = s.cliente_id
order by s.created_at desc;

-- 2) apagar UMA demo (troque os 4 valores). A ordem importa.
begin;
delete from public.campanha_nps_influenciador where campanha_id = '<campanha_id>';
delete from public.campanha_influenciador_avaliacoes where campanha_id = '<campanha_id>';
delete from public.campanha_nps where campanha_id::text = '<campanha_id>';
delete from public.campaign_cycles where campanha_id = '<campanha_id>';
delete from public.campanha_influenciadores where campanha_id = '<campanha_id>';
delete from public.campanha_tarefas where campanha_id = '<campanha_id>';
delete from public.campanha_documentos where campanha_id = '<campanha_id>';
delete from public.campanha_cronograma where campanha_id = '<campanha_id>';
delete from public.clientes where id = '<cliente_id>' and organization_id = '<organization_id>' and data->>'demoSessionId' = '<id da sessão>';
delete from public.demo_sessions where id = '<id da sessão>';   -- eventos saem em cascata
delete from public.organizations where id = '<organization_id>';
commit;
```

Arquivos de exemplo ficam em `demo/<id da sessão>/` nos buckets `entrega-anexos` e `relatorios-mensais` (apagar pelo painel de Storage).

### Limites conhecidos

- A demo é **legível** por quem tem permissão em `clientes`/`campanhas` (RLS) — está oculta nas telas, não inacessível.
- Arquivos de exemplo são PDF/PNG simples gerados por código; podem ser trocados por peças desenhadas sem mudar o contrato (`renderDemoAsset`).
- Mudanças na ficha da campanha (briefing, relatórios) feitas pelo time chegam ao cliente pelo polling de 20 s (o sinal imediato cobre influenciadores e cronograma).
- O limite de uso das funções públicas (120 leituras e 40 escritas por minuto por link) falha **aberto** se o banco do limitador cair — o que protege é a entropia do token.
- A migration `20261003100000_central_de_problemas.sql` continua pendente no banco (não afeta a demo).
