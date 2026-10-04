# 04 · Módulos do app interno

Todos vivem sob `/time?section=<chave>` (exceto detalhes de cliente e projeto e o Chat V2). Cada módulo = uma `*Section.tsx` em `src/components/` + uma pasta de apoio. Permissão entre parênteses.

| Seção | Função em uma linha |
|---|---|
| `inicio` | Painel pessoal: trabalho, agenda, mural, comentários, lembretes, clima |
| `clientes` (clientes) | Cadastro e ciclo de vida dos clientes |
| `campanhas` (campanhas) | Operação das campanhas, influenciadores e entregas |
| `projetos` (projetos) | Projetos e tarefas internas |
| `reunioes` (reunioes) | Agenda, disponibilidade, solicitações, Google Calendar |
| `comercial` (comercial) | Pipeline de leads, propostas, e-mail marketing |
| `financeiro` (financeiro) | Lançamentos, posição, análises |
| `time` (time) | Pessoas, carga, resposta, score operacional |
| `influenciadores` (influenciadores) | Banco de influenciadores |
| `metas` (metas) | Objetivos e indicadores |
| `chat` (chat) | Mensagens, canais, chamadas |
| `configuracoes` (configuracoes) | Perfil, workspace, permissões, integrações, segurança |
| `problemas` | Central de Problemas (reportar e triar bugs) |
| Marketing (dentro de Comercial/Marketing) | E-mail, blog, AEO, tráfego pago, editorial |

## Início
`InicioDashboard.tsx` (+ `components/inicio/`). Cards: **Meu trabalho** (tarefas via `task-aggregation`), **Agenda**, **Mural**, **Comentários**, **Lembretes** (`reminders.functions`, `personal_reminders`), **Pausa rápida** (jogos), cabeçalho climático (`weather-*`, Open-Meteo), diálogo "Bom dia" e avisos de release. Preferências por usuário em tempo real. É a **origem da linguagem visual** do design system.

## Clientes
`ClientesSection`, `clientes/ClienteCard · ClienteFiltersBar · ClienteFormSheet · ClienteDetailPage · ClienteContratosSection · ClienteFinancialSummary · PortalAccessSection · ClienteStatusControl`.
- Status do cliente: Captação → Ativo → Encerrado → Arquivado (`validate_cliente_status`; só admin arquiva).
- Criar cliente chama `createClienteComOrganizacao` (cria a **organização** do portal junto).
- Detalhe: contratos (`contratos.functions`), resumo financeiro, **acessos ao portal** (convites, papéis, campanhas liberadas — `client-access.functions`, `organization-invites`).
- Vem de: conversão de Lead ou "Importar do CRM".

## Campanhas
`CampanhasSection` (~1.700 linhas, lista + detalhe), `campanhas/*` (card, filtros, ativação, NPS, **página de inscrição**), `influenciadores/InfluencerBoard` (kanban/curadoria de influenciadores na campanha), `lib/entrega-engine`, `campanha-status`, `campanha-aprovacao`.
- A campanha mora dentro de `clientes.data.campanhas`; dados operacionais em tabelas `campanha_*`.
- Fluxo do influenciador na campanha: inscrito → curadoria → enviado ao cliente → aprovado/recusado → entregas (roteiro/conteúdo/publicação) → resultados.
- **NPS** do cliente (`campanha_nps`) e do influenciador (`campanha_nps_influenciador`, com avaliação interna).
- **Inscrição pública** com token (`signupToken`) e perguntas personalizáveis.

## Projetos e tarefas
`ProjetosSection`, `projeto.$id` (página única com seções por âncora), `tasks/TaskBoard` (workspace de tarefa: subtarefas, tags, dependências, bloqueios, tempo, comentários, anexos, rich-editor), `ProjectBugsPanel`.
- Tarefas de **projeto**, **campanha** e **Marketing avulso** são tabelas diferentes agregadas em "Meu trabalho".
- Bloqueio de tarefa com questionário (`task-blocks`); dependências não travam, só avisam.
- Link público de bugs por projeto (`/bugs/$token`).

## Reuniões
`ReunioesSection`, `meetings/*` (Agenda, Calendário, Disponibilidade, Solicitações, entrada por link), `UpcomingMeetingAlert`, `MeetingReminderToast`. Sincroniza com **Google Calendar** (`google-calendar.functions`, OAuth, cron diário). Pode anexar chamada interna (WebRTC).

## Comercial
`ComercialSection`, `comercial/* (PipelineBoard, LeadDrawer, LeadCard, FollowUp, SimuladorPropostaDialog, convertLead)`, `comercial-engine`, `pricing`.
- Etapas de oportunidade; realtime sobre `leads` (AppShell notifica novo lead).
- **Simulador de Proposta** (tiers × formatos) e **calculadora pública** por token.
- `convertLeadToClienteEProjeto`: lead → Cliente (sempre em Captação) + Projeto; grava `crmLeadId`.
- Ações automáticas por oportunidade (`runOpportunityAction`), visões salvas, interações.

## Marketing
`MarketingSection` + `marketing/*`: **E-mail** (campanhas, passos, públicos, templates, fluxos automáticos, dashboard; provedor Resend), **Blog** (editor markdown, publicação agendada, webhook para o site via Make, curtidas e comentários), **AEO Monitor** (prompts, rodadas, respostas por IA, evidências), **Tráfego pago**, **Editorial**.

## Financeiro
`FinanceiroSection` com 3 áreas: **Resumo** (posição, requer atenção), **Lançamentos** (entradas/saídas, filtros, importação CSV, cobrança, marcar como pago), **Análises** (fluxo de caixa, despesas, receita por cliente, resultado por campanha). Lançamentos ligam a cliente/campanha/influenciador; pagamentos de influenciador alimentam o financeiro; contratos geram alertas de vencimento.

## Time
`TimeV2Page`, `time-v2/*`, `team/*`: tabela de membros, carga, perfil (comunicação, tempo de resposta, entregas da semana, insights) e **Score Operacional** (`performance-engine`, config em Configurações). Tempo de resposta vem do Chat (`get_member_response_time`).

## Influenciadores
`influenciadores-v2/InfluencerBancoV2Page`: banco com filtros, card, drawer e avaliação; dados bancários só com `influenciadores:bancario`. Alimenta campanhas e e-mail marketing (picker).

## Metas
`metas/*`: **Objetivos** com **Indicadores** (peso, histórico, evolução, linha esperada), hoje atualizados **manualmente** (`dataSource: "auto"` está reservado para o futuro). Saúde: saudável, atenção, em risco, atrasado, concluído, não iniciado, cancelado — calculada só por `metas-engine`.

## Chat
V1 (`ChatSection`, `chat-store`) e V2 (`chat-v2/*`, rotas `/chat-v2`). Canais públicos/privados, DMs, **@menções** de pessoa, tarefa, projeto, campanha e cliente (`mention-kinds`), anexos, mensagens de voz, reações, fixadas/salvas, busca, threads, links com preview, **chamadas** (`call-controller`, WebRTC) e push.

## Configurações
Seções: Geral/Workspace, Perfil, Preferências, Disponibilidade, Áudio e Vídeo, Segurança (MFA, cofre), **Time e permissões**, **Integrações** (webhook de leads, webhooks de saída, Google), Precificação, Score operacional, Dados e backup, **Auditoria**.

## Central de Problemas
`problemas/*`: qualquer membro **reporta** (com contexto automático: tela, navegador, versão, captura) e comenta; quem tem `problemas` **tria** (status, prioridade, área, responsável, nota interna). Os reports do portal do cliente também chegam aqui.

## Shell e transversais
`AppShell`: sidebar global (256/68px), topbar, busca global, notificações (menções, tarefas, mensagens), timer ativo, tema, aviso de versão. Transversais: `useConfirm`, `FilterToolbar`, `Kpi`, `PageHeader`, `EmptyState`, notificações/push, release notes.
