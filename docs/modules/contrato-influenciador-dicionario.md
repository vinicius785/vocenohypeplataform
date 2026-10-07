# Contrato de influenciador (D4Sign) — dicionário de variáveis

Status: **Fases 1, 2 e 2.1 concluídas** (mapeamento, mapeador/validadores puros e atualização jurídica).
Código: `src/lib/contrato-influenciador.ts`, `src/lib/documento-br.ts`, `src/lib/valor-extenso.ts` (com testes).
**Sem integração D4Sign, sem tabelas, sem server functions, sem webhook, sem UI.**
Versão do template refletida no código: `2026-10-v2`. Data: 2026-10-07.

**Fonte oficial:** `Modelo de contrato influenciador 2026 - Vcnohype.docx` ("Contrato de Participação em
Campanha", 15 seções, 2 tabelas, Anexo I). Todo item abaixo vem de um placeholder `[...]` real desse arquivo.
O DOCX continua sendo a fonte do conteúdo contratual: nenhuma cláusula nova foi criada e a redação só muda
onde as decisões jurídicas abaixo mandam.

## 0. Decisões fechadas

### Rodada 1
1. **Um contrato por participação/campanha** (`campanha_influenciadores.id`). Em campanha recorrente, cada ciclo é uma nova participação, logo um novo contrato.
2. **Preenchimento manual com pré-preenchimento**: busca, pré-preenche, permite editar/completar, valida e guarda uma **fotografia** dos dados usados. Sem remodelar o cadastro jurídico do Banco.
3. `bank.titular` só **pré-preenche** nome completo/razão social; o usuário corrige antes do envio.
4. **Sem RG** (o template não exige).
5. **CPF/CNPJ obrigatório**; validação e normalização no formulário do contrato. O cadastro existente não é alterado.
6. **Endereço** pré-preenchido pelo Banco, corrigível no contrato.
7. **Dados bancários/PIX existem no formulário** (o template tem "Chave PIX / Dados Bancários").
8. **Entregas** vêm de `Influ.entregas[]`; dado obrigatório ausente impede o envio, listando o que falta.
9. **Direitos de imagem/exclusividade** vêm da campanha, convertidos para o texto do template, sem cláusula nova.
10. **Dois signatários**: CONTRATANTE e CONTRATADO(A). Sem testemunhas.
11. **Pagamento**: só o que o template suporta; o resto vira pendência de modelo/regra.

### Rodada 2
| Tema | Decisão |
|---|---|
| Horário e permanência das entregas | **Bloqueia enquanto a tabela do diálogo estiver incompleta.** Não existem em `Entrega`; são informados no contrato. |
| Dias de exclusividade | Entram na configuração da campanha (`DireitosImagem.exclusividadeDias`, opcional, já no tipo). Opções previstas: sem exclusividade, 30, 60 ou 90 dias. No contrato é pré-preenchido e ajustável. **Falta o seletor na tela da campanha.** |
| Entregas orçadas | **Bloqueia** (PMR-8). |
| Briefing de referência | Sugestão = nome da campanha, **editável**; a tela não deve afirmar que é o briefing real. |
| Telefone | **Obrigatório**. |
| PIX / dados bancários | Exige `influenciadores:bancario`, **também no backend**. |

### Rodada 3 — decisões jurídicas (Fase 2.1)
| # | Decisão | Efeito |
|---|---|---|
| 1 | **Sem exclusividade** | O contrato **declara explicitamente que não há exclusividade**. Nunca campo vazio, nunca cláusula omitida. É uma condição válida: `exclusividade_possui = NÃO` e `exclusividade_periodo = "Não há exclusividade"` (constante `TEXTO_SEM_EXCLUSIVIDADE`). A pendência PMR-3 deixa de existir. |
| 2 | **Uso em mídia paga = NÃO** | A cláusula de mídia paga **permanece**, com a redação já existente no template. A variável passa a se chamar `uso_midia_paga` (antes `midia_paga_autorizada`) e é refletida na linha "Uso em mídia paga autorizado?". Não existe lógica que apague a cláusula. A pendência PMR-6 está encerrada. |
| 3 | **`[100.000]`, `[365]`, `[7]`** | Deixam de ser constantes e viram **variáveis do contrato** (V25 a V28), com os valores atuais só como ponto de partida (`CONTRATO_DEFAULTS`). Nenhum desses números fica escrito no texto final. |
| 4 | **Numeração** | Numeração contínua, sem criar cláusula 19 artificial. Ver a seção 1. |
| 5 | **Representante** | Padronizado como **Rodrigo Cesar da Silva** (sem acento), no bloco de qualificação e na assinatura. |

Fluxo da V1: **influenciador aprovado → gerar contrato → pré-preencher → completar → validar → visualizar → enviar.**

## 1. Numeração corrigida

**Problema no DOCX:** as cláusulas vão de 1 a 18, depois a seção VIII usa "8.1." e "8.2." (que repetem o número da
cláusula 8) e a sequência retoma em 20. Não existe cláusula 19.

**Correção (sem criar texto):** cada parágrafo numerado vira uma cláusula, em ordem contínua. Os dois blocos da
seção VIII (que já existem no texto) passam a ser as cláusulas 19 e 20, e as seguintes sobem uma posição.

| Antes | Depois |
|---|---|
| 1 a 18 | 1 a 18 (sem mudança) |
| **8.1.** Obrigações do(a) CONTRATADO(A) | **19.** |
| **8.2.** Obrigações da CONTRATANTE | **20.** |
| 20 a 41 | **21 a 42** (cada uma +1) |

As seções em romano (I a XV) não mudam.

**Referências internas que dependem da numeração**

| Onde | Antes | Depois |
|---|---|---|
| Cláusula 24 → agora **25** (remoção antecipada de publicação) | "penalidades do **artigo 22 ou 23**" | "penalidades do **artigo 23 ou 24**" (inadimplemento total e parcial) |
| Cláusulas 7, 14 e 32 (antiga 31) | "Cláusula IX" | sem mudança (é a seção IX) |
| Cláusula 19 (antiga 8.1, item a) e 21 (antiga 20) | "Cláusula III" | sem mudança (seção III) |
| Cláusula 27 (antiga 26) | "Cláusula VI" | sem mudança (seção VI) |
| Cláusula 36 (antiga 35) | "Cláusula VII" | sem mudança (seção VII) |
| Cláusulas 14 e 24 (antiga 23) | "Anexo I" | sem mudança |

As referências "Cláusula III/VI/VII/IX" apontam para **seções** em algarismo romano, por isso não mudam. A única
referência numérica a cláusula é "artigo 22 ou 23". Ela é a que precisa ser atualizada.

**Pendente:** aplicar essa renumeração no DOCX/template da D4Sign. O arquivo original não foi alterado nesta etapa.

## 2. Como ler

- **Obrigatório / Opcional:** do ponto de vista do template.
- **Origem:** campo da plataforma (`arquivo:tipo.campo`) ou "SEM ORIGEM".
- **Ausente:** `BLOQUEIA` (não gera/envia e mostra a pendência) ou `PADRÃO` (usa o valor padrão do template).
- Números de cláusula abaixo seguem a **numeração corrigida** (seção 1).
- Nomes de variável: `snake_case`, ASCII. A sintaxe do placeholder na D4Sign está **a confirmar**.
- "Somente leitura" = o valor vem da campanha e só se corrige lá.

## 3. Dicionário de variáveis

### A. CONTRATADO(A) — qualificação (seção I) e assinatura (seção XV)

| ID | Variável | Placeholder(s) | Origem / pré-preenchimento | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V01 | `contratado_nome` | `[NOME COMPLETO OU RAZÃO SOCIAL]` (I) e `[NOME COMPLETO DO(A) INFLUENCIADOR(A)]` (XV) | Pré-preenche `Influ.bank.titular`; editável | Sim | Mesmo valor nos 2 locais; trim e espaços colapsados | PF: ≥ 2 palavras; PJ: ≥ 3 caracteres; sem colchetes | BLOQUEIA |
| V02 | `contratado_documento` | `[XXX.XXX.XXX-XX / XX.XXX.XXX/XXXX-XX]` (I) e `[DOCUMENTO]` (XV) | Pré-preenche `Influ.bank.cpfCnpj` (texto livre) | Sim | Normaliza e formata (`000.000.000-00` / `00.000.000/0000-00`); mesmo valor nos 2 locais | CPF ou CNPJ com dígitos verificadores; rejeita sequências repetidas | BLOQUEIA |
| V03 | `contratado_endereco` | `[ENDEREÇO COMPLETO]` | `BankInflu.endereco` via `findExistingBankInfluMatch` (heurístico) | Sim | "Rua, nº N, Compl., Bairro, Cidade – UF" | Mínimo: rua, número, bairro, cidade, UF | BLOQUEIA, listando o que falta |
| V04 | `contratado_cep` | `[XXXXX-XXX]` | `BankInflu.endereco.cep` | Sim | 8 dígitos → `XXXXX-XXX` | 8 dígitos | BLOQUEIA |
| V05 | `contratado_perfil` | `[@PERFIL]` | `Influ.redes[].handle` (principal primeiro) | Sim | Garante `@`; várias separadas por ", " | ≥ 1 handle | BLOQUEIA |
| V06 | `contratado_plataformas` | `[Instagram / TikTok / YouTube / outras]` | Plataformas únicas de `Influ.redes[]` | Sim | Une com " / " | ≥ 1 | BLOQUEIA |
| V07 | `contratado_email` | `[EMAIL]` | `Influ.email` (reserva `BankInflu.email`) | Sim | trim, minúsculas; é o e-mail do signatário | Formato de e-mail | BLOQUEIA |
| V08 | `contratado_telefone` | `[TELEFONE]` | `Influ.telefone` (reserva Banco) | Sim | Formata `(11) 99999-9999`; aceita DDI 55 | 10 ou 11 dígitos nacionais | BLOQUEIA |

### B. Objeto (seção II)

| ID | Variável | Placeholder | Origem | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V09 | `anunciante_marca` | `[NOME DO ANUNCIANTE / MARCA]` | Pré-preenche `Cliente.empresa`; editável | Sim | trim | ≥ 2 caracteres | BLOQUEIA |
| V10 | `campanha_nome` | `[NOME DA CAMPANHA]` | `Campaign.nome` (somente leitura) | Sim | — | não vazio | BLOQUEIA |
| V11 | `campanha_periodo_inicio` | `[DATA INÍCIO]` | `Campaign.dataInicio`; editável | Sim | `dd/mm/aaaa` | data válida | BLOQUEIA |
| V12 | `campanha_periodo_fim` | `[DATA FIM]` | `Campaign.prazo` | Sim | `dd/mm/aaaa` | válida e ≥ início | BLOQUEIA |
| V13 | `briefing_referencia` | `[CÓDIGO OU TÍTULO DO BRIEFING]` | **SEM ORIGEM.** Sugestão: `Campaign.nome` (editável; não é o briefing real) | Sim | Texto curto livre | 3–120 caracteres | BLOQUEIA |

### C. Entregas e aprovação (seção III)

| ID | Variável | Placeholder | Origem | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V14 | `entregas` (tabela) | tabela da cláusula 3 | Ver T1 | Sim | Uma linha por entrega | ≥ 1 linha completa | BLOQUEIA |
| V15 | `aprovacao_antecedencia_dias` | `[X]` na cláusula 6 ("em até [X] dias antes da data de publicação") | **SEM ORIGEM**; sem padrão no template | Sim | Inteiro | 1 a 60 | BLOQUEIA |

### D. Pagamento (seção V)

| ID | Variável | Placeholder | Origem | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V16 | `pagamento_valor_total` | `R$ [X.XXX,XX]` (cl. 10) | `Influ.pagamento` **somente** com `tipos = ["Valor"]` | Sim | Centavos; formata `1.234,56` | Número > 0 | BLOQUEIA (outros tipos: PMR-1) |
| V17 | `pagamento_valor_total_extenso` | `[VALOR POR EXTENSO]` | Derivada de V16 | Sim (derivada) | "mil duzentos e trinta e quatro reais e cinquenta e seis centavos" | V16 válida | BLOQUEIA |
| V18 | `pagamento_forma` | `[PIX / Transferência Bancária / Outro]` | Pré-seleciona PIX ou Transferência conforme o cadastro bancário | Sim | Lista fechada | Um dos três | BLOQUEIA |
| V19 | `pagamento_dados` | `[CHAVE PIX OU DADOS BANCÁRIOS]` | `Influ.bank` (permissão `influenciadores:bancario`) | Sim | PIX: "{tipo}: {chave}". Transferência: "Banco, Agência, Conta, Titular, CPF/CNPJ" | Chave PIX validada por tipo; transferência com dados completos | BLOQUEIA |
| V20 | `pagamento_parcela_valor` | `R$ [X.XXX,XX]` (cl. 11, item a) | = V16 (parcela única) | Sim (derivada) | Igual ao total | = V16 | BLOQUEIA |
| V21 | `pagamento_prazo_dias_uteis` | `[30]` ("em até [30] dias úteis após o envio da NF") | Padrão do template = 30; editável | Sim | Inteiro | 1 a 120 | PADRÃO 30 |

### E. Exclusividade e direitos de imagem (seções VI e VII)

| ID | Variável | Placeholder | Origem | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V22 | `exclusividade_possui` | (condição; não aparece no texto) | `Campaign.direitosImagem.exclusividade` ou escolha no diálogo | Sim (derivada) | **SIM** com dias; **NÃO** quando "sem exclusividade" | — | BLOQUEIA se não confirmada |
| V22 | `exclusividade_periodo` | `[X] dias a partir da data de assinatura` (linha "Período de exclusividade (se aplicável)") | Com exclusividade: dias de `DireitosImagem.exclusividadeDias`, ajustáveis no diálogo. **Sem exclusividade: texto fixo "Não há exclusividade"** | Sim | "N dias a partir da data de assinatura" ou "Não há exclusividade". **Nunca vazio.** | Dias: inteiro 1 a 3650 | BLOQUEIA se o modo não foi confirmado |
| V23 | `uso_conteudo_meses` | `[X] meses a partir da data de publicação` | `direitosImagem.duracaoDias` → meses = dias / 30, **só se múltiplo exato de 30** | Sim | Somente leitura | Inteiro ≥ 1 | BLOQUEIA: `permitido = false` (PMR-4), prazo indeterminado (PMR-5), não múltiplo de 30 |
| V24 | `uso_midia_paga` (antes `midia_paga_autorizada`) | `[SIM / NÃO]` (linha "Uso em mídia paga autorizado?") | SIM se `direitosImagem.usos` contém o uso pago; senão NÃO | Sim (derivada) | Somente leitura. **A cláusula de mídia paga permanece nos dois casos** | — | nunca ausente |

### F. Parâmetros que antes eram constantes (rodada 3, decisão 3)

| ID | Variável | Cláusula e placeholder antigo | Valor inicial | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V25 | `multa_publicacao_irregular` + `multa_publicacao_irregular_extenso` | **26** (antiga 25): "multa de R$ `[100.000]` (cem mil reais) por publicação irregular" | `100.000` | Sim | Em R$; sai sem ",00" quando redondo; o extenso acompanha ("cem mil reais") | Maior que zero e até R$ 99.999.999,99 | BLOQUEIA (não cai no valor inicial) |
| V26 | `multa_confidencialidade` + `multa_confidencialidade_extenso` | **34** (antiga 33): "multa contratual de R$ `[100.000]` (cem mil reais) por evento de violação" | `100.000` | Sim | Idem V25; **independente** de V25 | Idem V25 | BLOQUEIA |
| V27 | `vigencia_dias_apos_entregas` | **29** (antiga 28): "permanece vigente até `[365]` dias após a realização de todas as entregas" | `365` | Sim | Inteiro | 1 a 3650 | BLOQUEIA |
| V28 | `briefing_antecedencia_dias` | **20, item a)** (antiga 8.2 a): "com pelo menos `[7]` dias de antecedência da data de publicação" | `7` | Sim | Inteiro; **distinto de V15** (aprovação do conteúdo) | 1 a 60 | BLOQUEIA |

Os valores iniciais estão em `CONTRATO_DEFAULTS` e só pré-preenchem o rascunho. O texto final usa sempre o valor do
rascunho: vazio ou inválido bloqueia em vez de cair no padrão.

### G. Não são variáveis

- **Dados da CONTRATANTE** (razão social, CNPJ, endereço, representante): fixos no template e no cabeçalho. O representante é **Rodrigo Cesar da Silva**, igual na qualificação e na assinatura.
- **Signatário da CONTRATANTE**: configuração (nome, e-mail, CPF para a D4Sign), fora do template.
- **Linha de data da assinatura** ("São Paulo/SP, ____ de ____ de 202___"): em branco no template; ver TI-4.

## 4. Tabelas repetidas

### T1 — Entregas (cláusula 3): uma linha por `Influ.entregas[]`

| Coluna | Origem | Regra / validação | Ausente |
|---|---|---|---|
| Tipo de Entrega | `Entrega.tipo` (texto livre). Entrega dividida (`grupoId`): sufixo da unidade ("(1/3)") | não vazio | BLOQUEIA |
| Qtd. | `Entrega.quantidade` | inteiro ≥ 1 | BLOQUEIA |
| Formato / Plataforma | Não existe por entrega. Sugestão só para os formatos do template: Reels → Instagram Reels; Stories → Instagram Stories; Post feed → Instagram Feed; TikTok → TikTok; Short → YouTube – Short; Vídeo YouTube → YouTube – Video. Demais: manual | não vazio; editável | BLOQUEIA |
| Data e Horário | Data: `Entrega.dataPostagem` (só data). **Horário: informado no contrato** | `DD/MM/AAAA – HH:MM`; horário válido | BLOQUEIA ("Stories: falta horário") |
| Permanência Mínima | **Informada no contrato.** Sugestões dos exemplos do template: Stories "24 horas"; Reels/TikTok/YouTube "Permanente"; Feed: escolher | não vazio | BLOQUEIA |

Ordem por data. Entram `combinado` e `publicado`; `orcado` bloqueia (PMR-8).

### T2 — Anexo I (peso das entregas): uma linha por grupo (tipo + plataforma)

| Coluna | Origem | Regra / validação | Ausente |
|---|---|---|---|
| Tipo de Entrega | Grupo de T1; Stories usa "Stories (conjunto)" | — | — |
| Plataforma | Plataforma do grupo | — | — |
| Peso (% do valor) | **SEM ORIGEM** → manual no diálogo | Cada peso > 0; **soma = 100%** | BLOQUEIA (PMR-10) |
| Valor correspondente | V16 × peso, em centavos; a última linha absorve o arredondamento | Soma **exata** = V16 | derivado |
| TOTAL | `100%` e `R$ [VALOR TOTAL]` = V16 | — | — |

As cláusulas 14 e 24 (antiga 23) dependem do Anexo I.

## 5. Pendências de modelo/regra

| ID | Pendência | Estado |
|---|---|---|
| PMR-1 | Pagamento diferente de "Valor" simples (Por Hora, Comissão, Permuta, Outro, combinações). `pagamentoCashValue` **não** deve ser reutilizado aqui. | **Aberta** (bloqueia) |
| PMR-2 | Pagamento em mais de uma parcela (o template tem só o item a) da cláusula 11). | **Aberta** (bloqueia) |
| PMR-3 | "Sem exclusividade" sem redação aprovada. | **Encerrada** na rodada 3: declara "Não há exclusividade" |
| PMR-4 | Campanha sem cessão de imagem (`permitido = false`); a cláusula 17 é uma cessão. | **Aberta** (bloqueia) |
| PMR-5 | Prazo de uso indeterminado; o template exige meses. | **Aberta** (bloqueia) |
| PMR-6 | Mídia paga NÃO convivendo com a cláusula de mídia paga. | **Encerrada** na rodada 3: a cláusula permanece, variável `uso_midia_paga` |
| PMR-7 | Horário e permanência da entrega. | **Encerrada** na rodada 2: coletados no diálogo |
| PMR-8 | Entrega só orçada. | **Encerrada** na rodada 2: bloqueia |
| PMR-9 | Formato/plataforma por entrega com `tipo` de texto livre. | Aberta (sugestão + manual) |
| PMR-10 | Pesos do Anexo I sem fonte. | Entrada manual obrigatória |

## 6. Pendências do template (DOCX)

| ID | Item | Estado |
|---|---|---|
| TI-1 | Remover os avisos "⚠ Campos acima editáveis…", "⚠ ATENÇÃO: Esta seção define…", "⚠ Preencher a tabela acima…", "— fim do documento —", os rótulos `[Ex: …]` e as linhas de exemplo. | **A aplicar no DOCX** |
| TI-2 | Numeração contínua (seção 1) e referência "artigo 22 ou 23" → "artigo 23 ou 24". | **Decidida; a aplicar no DOCX** |
| TI-3 | Representante como "Rodrigo Cesar da Silva" nos dois locais. | **Decidida; a aplicar no DOCX** (a qualificação ainda tem a grafia com acento) |
| TI-4 | Linha de data da assinatura em branco; manter ou remover. | Aberta |
| TI-5 | Colchetes `[100.000]`, `[365]`, `[7]`. | **Decidida:** viram placeholders das variáveis V25 a V28; **a aplicar no DOCX** |
| TI-6 | Linhas repetidas nas tabelas (entregas, Anexo I) na D4Sign. | Aberta (confirmar capacidade) |

## 7. O que ainda impede o início da Fase 3

1. **Aplicar no DOCX/template da D4Sign** as decisões já tomadas: renumeração (TI-2), grafia do representante (TI-3), placeholders de V25 a V28 no lugar dos três colchetes (TI-5) e limpeza dos avisos e exemplos (TI-1). Sem o template final não dá para criá-lo na D4Sign.
2. **Confirmar a abordagem de renumeração.** Fiz cada parágrafo numerado virar cláusula (8.1 → 19, 8.2 → 20, demais +1). A alternativa seria manter 20 a 41 e tornar os dois blocos "19.1" e "19.2". Essa leitura não precisa de nenhuma referência atualizada, mas exigiria um "19" sem texto. Preciso do aceite do jurídico antes de aplicar.
3. **Confirmar com a D4Sign** o suporte a linhas repetidas nas duas tabelas (TI-6) e a sintaxe dos placeholders.
4. Definir TI-4 (linha de data da assinatura).

Não bloqueiam o início, mas limitam quais campanhas geram contrato hoje: PMR-1, PMR-2, PMR-4 e PMR-5.
Também fica o seletor de exclusividade na tela da campanha (rodada 2).

Observação: com "Não há exclusividade", as cláusulas 15 e 16 e a multa da cláusula 27 permanecem no texto, como
decidido. Vale o jurídico confirmar que essa é a leitura pretendida.

## 8. Validações e normalizações (implementadas na Fase 2)

- CPF e CNPJ (dígitos verificadores) e formatação; chave PIX por tipo; CEP, UF, telefone brasileiro, e-mail.
- Dinheiro em centavos inteiros (vazio/inválido é `null`, nunca 0), valor por extenso e formato compacto de valor redondo.
- Datas `dd/mm/aaaa` e `DD/MM/AAAA – HH:MM`.
- Mensagem de pendência por linha: "Falta: Stories — horário; Reels — permanência".

## 9. Dados sensíveis

A fotografia do contrato conterá CPF/CNPJ e PIX/dados bancários. Deve ficar só para o time interno (RLS interna),
fora de logs, com acesso a bancário condicionado à permissão `influenciadores:bancario`.

## 10. Fora de escopo

Integração D4Sign, tabelas, bucket, server functions, webhook e UI.
