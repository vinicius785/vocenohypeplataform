# Decisões do Design System

Etapa de fechamento: cada decisão foi investigada no código antes de ser fechada. **Fechadas** estão incorporadas ao `DESIGN-SYSTEM.md`; **Abertas** dependem de intervenção humana. Evidências detalhadas: [`AUDIT-FINDINGS.md`](./AUDIT-FINDINGS.md) §6.

## A. Decisões fechadas

| # | Decisão | Regra fechada | Evidência-chave | Consequência de UX |
|---|---|---|---|---|
| C1 | Família tipográfica | Pilha do sistema (`font-sans`); `font-mono` só para código/IDs/valores técnicos | Nenhuma fonte carregada (sem dependência, `@font-face` ou link); `font-mono` em ~9 pontos técnicos | Mantém o que o usuário já vê; trocar de família é decisão de marca nova, não correção |
| C2 | Escala do título de página | `text-2xl md:text-[26px] font-semibold tracking-tight` (a escala do Início) | Início = referência; módulos têm 36/42px/700 inline; objetivo declarado de eliminar títulos gigantes sem função | Menos altura gasta com título, mais conteúdo acima da dobra. **Maior impacto visual da etapa — confirmar** |
| C3 | Estado → cor | Categorias semânticas por significado (neutro / em andamento=`info` / atenção / risco / positivo) + tabela de mapeamento dos vocabulários principais; paleta Tailwind direta proibida | 9 mapas de tom; 82 arquivos com paleta direta (7 matizes dominantes) × 64 com tokens; mapas já divergem para o mesmo significado | Mesma cor = mesmo significado em todo módulo; menos cores competindo |
| C4 | Seleção/segmentação | SegmentedControl = alternar visões/divisões primárias na página e filtro em cabeçalho de card; Tabs = painéis dentro de overlay; âncora = seções de detalhe | SegmentedControl em 20 arquivos; Tabs só em 3, todos dentro de overlay; âncora só na página de projeto | Cada controle tem um papel único; abas deixam de esconder conteúdo da página |
| C5 | Apresentação de KPI | Um componente com duas variantes (**strip** e **lead**), posição, limites, zero, atenção, clique definidos | 7 apresentações diferentes; componente "canônico" já declarado no código mas com 1 uso; duas formas de uso real (células iguais × um número dominante) | Mesmo KPI em todo módulo; quantidade limitada |
| C6 | Texto secundário e contraste | Texto secundário = `text-secondary`; `muted-foreground` só ícone/decorativo; sem opacidade em texto | **Medido:** `muted-foreground` 4.77:1 em branco e **4.35:1 em `muted`** (reprova 4.5); com opacidade 1.7–2.2:1; `text-secondary` 7.56:1 / 6.89:1; temas escuros ≥ 6.9:1 em ambos | Legibilidade e acessibilidade AA no tema claro |
| C7 | Superfície de página e card | Página `background`; card `card` + borda `/60`, `rounded-2xl`, sem sombra; sem canvas | Início (referência) funciona assim; radius `rounded-2xl` é o uso do Início e dos overlays; 4 raios arbitrários (20/22/24/28) sem justificativa de função | Uma só superfície; o canvas deixa de ser necessário |
| C8 | Alert | Componente `Alert` (5 variantes) para mensagem persistente; toast para feedback transitório | `Alert` existe com variantes semânticas; usado em 1 lugar; o resto improvisa caixas de erro | Erros inline com o mesmo formato |
| C9 | Loading / Error | Skeleton quando o layout é conhecido; spinner quando não; botão em carregamento; erro de seção em `Alert` dentro do bloco | Skeleton (ui + composições) e spinner convivem; 16 usos de pulso próprio; erro por card não existe no Início | Estado previsível por situação |
| C10 | Primitivo de tabela | Primitivos de tabela do sistema; `<table>` cru eliminado; scroll horizontal dentro do container | `<table>` cru em 11 arquivos; primitivo em 3; componente de tabela de dados sem nenhum consumo | Tabelas com a mesma estrutura |
| C11 | Navegação, contexto, filtros, ações, scroll | Regras de arquitetura do §1 do DS (página única, contexto uma vez, filtro único, ação primária única, um fluxo de rolagem) | Princípios definidos pela diretoria de produto e confirmados pelos achados (período duplicado, 5 barras de filtro, abas escondendo conteúdo) | Menos camadas e menos controles redundantes |

## B. Decisões que ainda precisam de intervenção humana

### P1 — Select
- **PRECISA DE DECISÃO.**
- **Opções no código:** `<select>` nativo (50 arquivos) × componente de select do sistema (5 arquivos; é o que a página interna do design system mostra como padrão).
- **Informação que falta:** (a) se a aparência do select nativo é aceitável como padrão visual em desktop; (b) custo/risco de migrar 50 arquivos. O código não responde nenhuma das duas.

### P2 — Texto em `brand` sobre fundo claro
- **PRECISA DE DECISÃO.**
- **Fato medido:** `brand` em branco = **2.83:1**; `brand-hover` = 3.60:1; nenhum token de marca atinge 4.5:1 como texto no tema claro. Uso: `text-brand` em 82 arquivos (links, rodapés de card, pill ativo). No tema escuro passa (6.3–7.0:1).
- **Informação que falta:** se aceita-se um novo token mais escuro só para texto de marca no tema claro, ou se esse texto passa a usar `foreground` com sublinhado/ícone. Criar token é decisão de marca.

### P3 — Tabela no mobile
- **PRECISA DE DECISÃO.**
- **Opções no código:** rolagem horizontal dentro do container (uso real em várias tabelas) × linha vira card (estratégia do componente de tabela de dados, registrada "para confirmação").
- **Informação que falta:** a confirmação explícita dessa estratégia; não há consumidor que a valide.

### P4 — Cor de etapas de pipeline
- **PRECISA DE DECISÃO.**
- **Fato:** o Comercial usa 9 matizes distintos, por escolha documentada no código ("impossível distinguir de relance" quando compartilhavam matiz); só existem 5 tokens `chart-*`.
- **Informação que falta:** se etapas de pipeline podem usar uma paleta categórica oficial (novos tokens) ou devem ser neutras com número/ícone de etapa.

## C. Decisões que merecem confirmação (fechadas, alto impacto)

- **C2** muda a escala do título de ~10 módulos.
- **C7** remove o canvas cinza e depende da borda `/60` para separar o card no tema claro; **não foi verificado visualmente** (sem acesso à interface nesta etapa). Se a borda for insuficiente, o ajuste correto é no token de borda do sistema, não por módulo.
