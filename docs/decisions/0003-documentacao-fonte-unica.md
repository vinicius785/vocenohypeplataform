# 0003 — Documentação com uma fonte de verdade por assunto

**Data:** 2026-10-03 · **Status:** adotada

## Contexto
`docs/` tinha relatórios soltos de datas diferentes, uma pasta `platform/` que duplicava o Design System (resumo, tokens, componentes), comandos/variáveis repetidos entre arquivos e imagens de validação espalhadas.

## Decisão
Estrutura por assunto (`architecture/`, `design-system/`, `security/`, `performance/`, `development/`, `modules/`, `decisions/`), com `docs/README.md` como índice. Relatórios de um momento levam a data no nome e não são reescritos; o que segue valendo sobe para o documento do assunto. Arquivos gerenciados por ferramentas (`.lovable/plan.md`) ficam onde a ferramenta espera.

## Consequências
- `platform/07-DESIGN.md` foi dissolvido: o que era único foi para `design-system/APLICACAO-E-MIGRACAO.md`; o resto duplicava o contrato.
- Comandos, variáveis de ambiente, deploy e convenções vivem só em `development/guia.md`.
- O PDF `architecture/documentacao-plataforma-vnh.pdf` é derivado e precisa ser regenerado quando `architecture/` ou `modules/` mudarem.
