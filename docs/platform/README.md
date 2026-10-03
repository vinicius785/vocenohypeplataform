# Documentação da Plataforma VNH (Hype App)

Levantamento geral feito sobre o código real (versão `1.297.0`, outubro/2026). Cobre a plataforma interna, o portal do cliente, links externos, integrações, dados, comunicação entre as partes e design.

| Doc | Para quem | Conteúdo |
|---|---|---|
| [01-VISAO-GERAL.md](./01-VISAO-GERAL.md) | todos | O que é a plataforma, quem usa, as superfícies de acesso, glossário |
| [02-DEV-ARQUITETURA.md](./02-DEV-ARQUITETURA.md) | dev | Stack, estrutura de pastas, rotas, camadas, auth, stores, server functions, deploy, testes |
| [03-DADOS-E-SEGURANCA.md](./03-DADOS-E-SEGURANCA.md) | dev | Tabelas por domínio, RLS e permissões, organizações, storage, MFA, rate limit |
| [04-MODULOS-INTERNOS.md](./04-MODULOS-INTERNOS.md) | dev + produto | Cada módulo do app interno: função, arquivos, dados, relações |
| [05-PORTAL-E-LINKS-EXTERNOS.md](./05-PORTAL-E-LINKS-EXTERNOS.md) | dev + produto | Portal do cliente (V2, token, legado), links públicos, webhooks, OAuth, crons |
| [06-COMUNICACAO-E-RELACOES.md](./06-COMUNICACAO-E-RELACOES.md) | dev + produto | Como as partes conversam e como as funcionalidades se ligam (diagramas) |
| [07-DESIGN.md](./07-DESIGN.md) | design + dev | Design system consolidado, aplicação por superfície, estado da migração |
| [08-LACUNAS-E-RISCOS.md](./08-LACUNAS-E-RISCOS.md) | todos | O que não foi verificado, pendências conhecidas, riscos |

**Convenção de confiança.** Cada afirmação vem do código lido. Quando algo é dedução (não confirmado), aparece marcado como **[inferido]**. Itens que dependem de ver o sistema em produção estão em `08`.

**Documentos que já existiam e continuam valendo:** `../design-system/` (contrato visual), `../security-audit-report.md`, `../security-remediation-plan.md`, `../codebase-optimization-report.md`, `/CLAUDE.md`.
