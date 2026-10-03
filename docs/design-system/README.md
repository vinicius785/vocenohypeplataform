# Documentação do Design System

| Arquivo | O que é | Quando usar |
|---|---|---|
| [`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md) | **Contrato** de padronização: só padrões reutilizáveis e comprovados; conflitos marcados | Implementar ou auditar qualquer tela/módulo |
| [`INICIO-REFERENCE.md`](./INICIO-REFERENCE.md) | O que é **específico** da página Início | Entender o Início; **não** é regra para outros módulos |
| [`AUDIT-FINDINGS.md`](./AUDIT-FINDINGS.md) | Diagnóstico: inconsistências, duplicações, tokens não usados | Planejar correções |
| [`DECISIONS.md`](./DECISIONS.md) | 11 decisões **fechadas** (com evidência), 4 **abertas** (`PRECISA DE DECISÃO`) e 2 confirmações de alto impacto | Antes da auditoria global |
| [`technical/`](./technical/) | Dados brutos da engenharia reversa do Início (arquitetura, tipografia, tokens, componentes, estados) | Consulta técnica secundária |

Fluxo: resolver P1–P4 em `DECISIONS.md` → ajustar `DESIGN-SYSTEM.md` (trocar cada `PRECISA DE DECISÃO` pela regra) → auditar módulos contra ele.
