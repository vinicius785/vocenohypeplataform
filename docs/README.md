# Documentação do projeto

Uma fonte de verdade por assunto. Antes de criar um documento novo, procure o assunto aqui; se já existe, atualize-o.

| Assunto                                                                                                               | Onde                                                                                                           | Para quem       |
| --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------- |
| Como rodar, configurar, publicar; regras de camada e de código                                                        | [`development/guia.md`](./development/guia.md)                                                                 | dev             |
| **Demo operacional** (runbook, roteiro de demonstração, migrations, solução de problemas)                             | [`development/demo-runbook.md`](./development/demo-runbook.md)                                                 | comercial + dev |
| Visão geral, quem usa, superfícies de acesso, glossário                                                               | [`architecture/visao-geral.md`](./architecture/visao-geral.md)                                                 | todos           |
| Arquitetura: stack, pastas, rotas, camadas, autenticação                                                              | [`architecture/arquitetura.md`](./architecture/arquitetura.md)                                                 | dev             |
| Dados: tabelas por domínio, RLS, permissões, storage                                                                  | [`architecture/dados-e-acesso.md`](./architecture/dados-e-acesso.md)                                           | dev             |
| Portal do cliente, links públicos, webhooks, crons, OAuth                                                             | [`architecture/portal-e-links-externos.md`](./architecture/portal-e-links-externos.md)                         | dev + produto   |
| Como as partes se comunicam e se relacionam                                                                           | [`architecture/comunicacao-e-relacoes.md`](./architecture/comunicacao-e-relacoes.md)                           | dev + produto   |
| Riscos e lacunas conhecidas                                                                                           | [`architecture/riscos-e-lacunas.md`](./architecture/riscos-e-lacunas.md)                                       | todos           |
| **Auditoria técnica 2026-10** (matriz de prioridades, classificação, resultados)                                      | [`architecture/auditoria-2026-10.md`](./architecture/auditoria-2026-10.md)                                     | todos           |
| **Platform Optimization Audit 2026-10** (2ª etapa: causas, performance, banco, DS, UX, matriz P0–P3 — só diagnóstico) | [`architecture/platform-optimization-audit-2026-10.md`](./architecture/platform-optimization-audit-2026-10.md) | todos           |
| Módulos internos (função, arquivos, dados)                                                                            | [`modules/README.md`](./modules/README.md)                                                                     | dev + produto   |
| Design System (contrato, decisões, auditoria, aplicação e estado da migração)                                         | [`design-system/`](./design-system/README.md)                                                                  | design + dev    |
| Segurança (estado atual, auditoria de setembro, RLS pendente)                                                         | [`security/README.md`](./security/README.md)                                                                   | dev             |
| **Segurança — relatório consolidado** (para compartilhar; PDF ao lado)                                                | [`security/relatorio-consolidado.md`](./security/relatorio-consolidado.md)                                     | todos           |
| Performance (medições de bundle e carga inicial)                                                                      | [`performance/README.md`](./performance/README.md)                                                             | dev             |
| Decisões arquiteturais (ADRs)                                                                                         | [`decisions/`](./decisions/)                                                                                   | dev             |

PDF para compartilhar: [`architecture/documentacao-plataforma-vnh.pdf`](./architecture/documentacao-plataforma-vnh.pdf) (gerado de `architecture/` e `modules/`).

Fora de `docs/`: `CLAUDE.md` (instruções para o agente de código), `AGENTS.md` (regra de histórico git com o Lovable), `.lovable/plan.md` (plano original do webhook de leads, **gerenciado pelo Lovable — não mover**; já implementado), `src/routes/README.md` (convenção de nomes de rotas).

## Como manter

- **Assunto novo** → uma página no diretório do assunto + uma linha neste índice.
- **Decisão que muda a estrutura** → ADR curto em `decisions/` (contexto, decisão, consequências).
- **Relatório de um momento** (auditoria, medição) → fica com a data no nome e **não é reescrito**; o que continua válido sobe para o documento do assunto.
