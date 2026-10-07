# Contrato de influenciador (D4Sign) — dicionário de variáveis

Status: **Fase 1 (mapeamento) fechada. Fase 2 (mapeador + validadores puros) implementada** em
`src/lib/contrato-influenciador.ts`, `src/lib/documento-br.ts` e `src/lib/valor-extenso.ts` (com testes).
**Sem integração D4Sign, sem tabelas, sem server functions, sem webhook, sem UI.**
Data: 2026-10-07.

**Fonte oficial:** `Modelo de contrato influenciador 2026 - Vcnohype.docx` ("Contrato de Participação em Campanha",
15 seções, 2 tabelas, 41 cláusulas + Anexo I). Todo item abaixo vem de um placeholder `[...]` real desse arquivo.
Nenhuma variável foi criada a partir de contrato hipotético.

## 0. Decisões fechadas

1. V1 = **um contrato por participação/campanha** (`campanha_influenciadores.id`). Em campanha recorrente, cada ciclo é uma nova participação, logo um novo contrato.
2. Preenchimento **manual com pré-preenchimento**: o diálogo busca, pré-preenche, permite editar/completar, valida e salva uma **fotografia** dos dados usados. Sem remodelar o cadastro jurídico do Banco.
3. `bank.titular` só **pré-preenche** nome completo/razão social; o usuário corrige antes do envio.
4. **Sem RG** (o template não exige).
5. **CPF/CNPJ obrigatório**; hoje é texto livre, então a validação e a normalização vivem no formulário do contrato. O cadastro existente não é alterado.
6. **Endereço** pré-preenchido pelo Banco, corrigível no contrato.
7. **Dados bancários/PIX existem no formulário** (o template tem "Chave PIX / Dados Bancários" na cláusula de pagamento).
8. **Entregas** vêm de `Influ.entregas[]`; dado obrigatório ausente impede o envio, listando exatamente o que falta.
9. **Direitos de imagem/exclusividade** vêm da campanha, convertidos para o texto do template, sem cláusula nova; configuração ausente bloqueia e mostra a pendência.
10. **Dois signatários**: CONTRATANTE e CONTRATADO(A). Sem testemunhas.
11. **Pagamento**: só o que o template suporta; permuta/comissão/outros sem representação viram **pendência de modelo/regra**, nunca texto improvisado.

### Decisões da rodada 2 (fechadas em 2026-10-07)

| Tema | Decisão |
|---|---|
| Horário e permanência das entregas | **Bloqueia enquanto a tabela do diálogo estiver incompleta.** Não existem em `Entrega`; são informados no contrato e ficam na fotografia. O motor de entregas não muda. |
| Dias de exclusividade | **Entra na configuração da campanha** (`DireitosImagem.exclusividadeDias`, campo opcional já no tipo). Opções previstas: sem exclusividade, 30, 60 ou 90 dias. No contrato é só pré-preenchido e pode ser ajustado antes do envio. **Falta o seletor na tela da campanha.** |
| "Sem exclusividade" | Sem cláusula inventada. A opção existe, mas o texto vem da redação aprovada pelo jurídico: `TEXTO_SEM_EXCLUSIVIDADE` é `null` até lá e o mapeador **bloqueia** (PMR-3). |
| Entregas orçadas | **Bloqueia** (PMR-8). Nada vira contratável por inferência. |
| Constantes `[100.000]`, `[365]`, `[7]` | Constantes do template, **não variáveis**. Os colchetes não são placeholders pendentes, mas o jurídico valida os valores antes da produção. |
| Briefing de referência | Sugestão pré-preenchida = nome da campanha, **editável**. A tela não deve afirmar que é o briefing real. |
| Telefone | **Obrigatório** na geração. |
| PIX / dados bancários | Exige `influenciadores:bancario`, **checado também no backend**. O mapeador já bloqueia sem a permissão. |

Fluxo da V1: **influenciador aprovado → gerar contrato → pré-preencher → completar → validar → visualizar → enviar.**
O envio bloqueia por qualquer pendência contratual real (entrega, exclusividade, pagamento, direitos de imagem, Anexo I).

## 1. Como ler

- **Obrigatório / Opcional:** do ponto de vista do template (campo existe no texto).
- **Origem:** campo da plataforma (`arquivo:tipo.campo`) ou "SEM ORIGEM".
- **Ausente:** `BLOQUEIA` (não gera/envia e mostra a pendência) ou `PADRÃO` (usa o valor padrão do template).
- Nomes de variável são lógicos (`snake_case`, ASCII). A sintaxe do placeholder na D4Sign está **a confirmar**.
- "Somente leitura" = o valor vem da campanha e só se corrige lá (não no diálogo).

## 2. Dicionário de variáveis

### A. CONTRATADO(A) — qualificação (seção I) e assinatura (seção XV)

| ID | Variável | Placeholder(s) no template | Origem / pré-preenchimento | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V01 | `contratado_nome` | `[NOME COMPLETO OU RAZÃO SOCIAL]` (I) e `[NOME COMPLETO DO(A) INFLUENCIADOR(A)]` (XV) | Pré-preenche `Influ.bank.titular`; editável | Sim | Mesmo valor nos 2 locais; trim e espaços colapsados | PF: ≥ 2 palavras; PJ: ≥ 3 caracteres; sem colchetes | BLOQUEIA |
| V02 | `contratado_documento` | `[XXX.XXX.XXX-XX / XX.XXX.XXX/XXXX-XX]` (I) e `[DOCUMENTO]` (XV) | Pré-preenche `Influ.bank.cpfCnpj` (texto livre) | Sim | Normaliza para dígitos e formata (`000.000.000-00` / `00.000.000/0000-00`); mesmo valor nos 2 locais | CPF 11 dígitos ou CNPJ 14, dígitos verificadores, rejeita sequências repetidas | BLOQUEIA |
| V03 | `contratado_endereco` | `[ENDEREÇO COMPLETO]` | `BankInflu.endereco` (rua, numero, complemento, bairro, cidade, estado) via `findExistingBankInfluMatch` (casamento heurístico) | Sim | Compõe "Rua, nº N, Compl., Bairro, Cidade – UF" | Mínimo: rua, número, bairro, cidade, UF (2 letras) | BLOQUEIA, listando o que falta |
| V04 | `contratado_cep` | `[XXXXX-XXX]` | `BankInflu.endereco.cep` | Sim | 8 dígitos → `XXXXX-XXX` | 8 dígitos | BLOQUEIA |
| V05 | `contratado_perfil` | `[@PERFIL]` | `Influ.redes[].handle` (principal primeiro: `isPrimary`/`order`) | Sim | Garante prefixo `@`; várias separadas por ", " | ≥ 1 handle | BLOQUEIA |
| V06 | `contratado_plataformas` | `[Instagram / TikTok / YouTube / outras]` | Plataformas únicas de `Influ.redes[].plataforma` das redes de V05 | Sim | Une com " / " | ≥ 1 | BLOQUEIA |
| V07 | `contratado_email` | `[EMAIL]` | `Influ.email` (reserva `BankInflu.email`) | Sim | trim, minúsculas; é também o e-mail do signatário | Formato de e-mail | BLOQUEIA |
| V08 | `contratado_telefone` | `[TELEFONE]` | `Influ.telefone` (reserva `BankInflu.telefone`) | Sim (campo existe no template) | Normaliza e formata `(11) 99999-9999`; aceita DDI 55 | 10 ou 11 dígitos nacionais | BLOQUEIA |

### B. Objeto (seção II)

| ID | Variável | Placeholder | Origem / pré-preenchimento | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V09 | `anunciante_marca` | `[NOME DO ANUNCIANTE / MARCA]` | Pré-preenche `Cliente.empresa` da campanha; editável | Sim | trim | ≥ 2 caracteres | BLOQUEIA |
| V10 | `campanha_nome` | `[NOME DA CAMPANHA]` | `Campaign.nome` (somente leitura) | Sim | — | não vazio | BLOQUEIA |
| V11 | `campanha_periodo_inicio` | `[DATA INÍCIO]` | `Campaign.dataInicio` (campo opcional na campanha); editável | Sim | `dd/mm/aaaa` | data válida | BLOQUEIA |
| V12 | `campanha_periodo_fim` | `[DATA FIM]` | `Campaign.prazo` | Sim | `dd/mm/aaaa` | data válida e ≥ início | BLOQUEIA |
| V13 | `briefing_referencia` | `[CÓDIGO OU TÍTULO DO BRIEFING]` | **SEM ORIGEM** (o briefing da campanha é texto livre, sem código nem título). Sugestão pré-preenchida: `Campaign.nome` | Sim | Texto curto livre | 3–120 caracteres | BLOQUEIA |

### C. Entregas e aprovação (seção III)

| ID | Variável | Placeholder | Origem | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V14 | `entregas` (tabela) | tabela da cláusula 3 | Ver seção 3 (T1) | Sim | Uma linha por entrega | ≥ 1 linha completa | BLOQUEIA |
| V15 | `aprovacao_antecedencia_dias` | `[X]` na cláusula 6 ("em até [X] dias antes da data de publicação") | **SEM ORIGEM**; o template não traz padrão | Sim | Inteiro | 1 a 60 | BLOQUEIA |

### D. Pagamento (seção V)

| ID | Variável | Placeholder | Origem | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V16 | `pagamento_valor_total` | `R$ [X.XXX,XX]` (cl. 10) | `Influ.pagamento`, **somente** quando `tipos = ["Valor"]`: `config.Valor.valor` | Sim | Converte para centavos; formata `1.234,56` | Número > 0 | BLOQUEIA (outros tipos: PMR-1) |
| V17 | `pagamento_valor_total_extenso` | `[VALOR POR EXTENSO]` | Derivada de V16 (função nova) | Sim (derivada) | "mil duzentos e trinta e quatro reais e cinquenta e seis centavos" | V16 válida | BLOQUEIA |
| V18 | `pagamento_forma` | `[PIX / Transferência Bancária / Outro]` | Pré-seleciona PIX se há `bank.pixChave`; senão Transferência se há banco+agência+conta; editável | Sim | Lista fechada: PIX, Transferência Bancária, Outro | Um dos três | BLOQUEIA |
| V19 | `pagamento_dados` | `[CHAVE PIX OU DADOS BANCÁRIOS]` | `Influ.bank` (exige permissão `influenciadores:bancario`) | Sim | PIX: "{tipo}: {chave}". Transferência: "Banco, Agência, Conta (tipo), Titular, CPF/CNPJ" | PIX validada por `pixTipo` (cpf/cnpj com dígitos, e-mail, telefone, aleatória); Transferência: todos os campos preenchidos | BLOQUEIA |
| V20 | `pagamento_parcela_valor` | `R$ [X.XXX,XX]` (cl. 11, item a) | = V16 (parcela única) | Sim (derivada) | Igual ao total | = V16 | BLOQUEIA |
| V21 | `pagamento_prazo_dias_uteis` | `[30]` ("em até [30] dias úteis após o envio da NF") | Padrão do template = 30; editável | Sim | Inteiro | 1 a 120 | PADRÃO 30 |

### E. Exclusividade e direitos de imagem (seções VI e VII)

| ID | Variável | Placeholder | Origem | Obrig. | Regra | Validação | Ausente |
|---|---|---|---|---|---|---|---|
| V22 | `exclusividade_periodo` | `[X] dias a partir da data de assinatura` (linha "Período de exclusividade (se aplicável)") | `Campaign.direitosImagem.exclusividade` (e `exclusividadeSegmento`, informativo). **Dias: SEM ORIGEM** (PMR-3) | Sim | Se exclusividade: "N dias a partir da data de assinatura". Se não: texto de "não aplicável" **a aprovar pelo jurídico** | Inteiro ≥ 1 quando há exclusividade | BLOQUEIA |
| V23 | `uso_conteudo_meses` | `[X] meses a partir da data de publicação` | `direitosImagem.duracaoDias`: meses = dias / 30, **só se múltiplo exato de 30** | Sim | Somente leitura | Inteiro ≥ 1 | BLOQUEIA: `permitido = false` (PMR-4); `duracaoDias` vazio = indeterminado (PMR-5); não múltiplo de 30 (ajustar na campanha) |
| V24 | `midia_paga_autorizada` | `[SIM / NÃO]` | SIM se `direitosImagem.usos` contém "Pago (whitelisting/impulsionamento)"; senão NÃO | Sim (derivada) | Somente leitura | — | nunca ausente (ver PMR-6) |

### F. Constantes do template (valores padrão entre colchetes; **não** são dado da plataforma)

| ID | Onde | Valor no template | Tratamento proposto |
|---|---|---|---|
| C01 | Cl. 8.2 a) — antecedência do briefing | `[7]` dias | Texto fixo (tirar os colchetes) |
| C02 | Cl. 28 — vigência após as entregas | `[365]` dias | Texto fixo |
| C03 | Cl. 25 — multa por conteúdo não aprovado | `R$ [100.000] (cem mil reais)` | Texto fixo |
| C04 | Cl. 33 — multa por violação de confidencialidade | `R$ [100.000] (cem mil reais)` | Texto fixo |

Se o jurídico quiser que algum varie por campanha, ele passa a variável e entra neste dicionário.

### G. Não são variáveis

- **Dados da CONTRATANTE** (razão social, CNPJ, endereço, representante): fixos no template e no cabeçalho.
- **Signatário da CONTRATANTE**: configuração (nome, e-mail, CPF para a D4Sign), fora do template.
- **Linha de data da assinatura** ("São Paulo/SP, ____ de ____ de 202___"): em branco no template; ver TI-4.

## 3. Tabelas repetidas

### T1 — Entregas (cláusula 3): uma linha por `Influ.entregas[]`

| Coluna | Origem | Regra / validação | Ausente |
|---|---|---|---|
| Tipo de Entrega | `Entrega.tipo` (texto livre; sugestões: Reels, Stories, Post feed, Carrossel, TikTok, Vídeo YouTube, Short). Entrega dividida (`grupoId`): acrescenta o sufixo da unidade ("(1/3)") | não vazio | BLOQUEIA |
| Qtd. | `Entrega.quantidade` | inteiro ≥ 1 | BLOQUEIA |
| Formato / Plataforma | **Não existe por entrega.** Sugestão derivada do tipo só para os formatos que o template exemplifica: Reels → Instagram Reels; Stories → Instagram Stories; Post feed → Instagram Feed; TikTok → TikTok; Short/Vídeo YouTube → YouTube – Short/Video. Demais tipos: manual (PMR-9) | não vazio; editável | BLOQUEIA |
| Data e Horário | Data: `Entrega.dataPostagem` (**só data**, `YYYY-MM-DD`). **Horário: não existe** (PMR-7) | Saída `DD/MM/AAAA – HH:MM`; horário `HH:MM` válido; data válida | BLOQUEIA ("Stories: falta horário") |
| Permanência Mínima | **Não existe** (PMR-7). Sugestões só a partir dos exemplos do próprio template: Stories "24 horas"; Feed "Permanente" ou "72h" (escolher); Reels/TikTok/YouTube "Permanente" | não vazio; editável | BLOQUEIA |

- Ordem: por data crescente.
- Quais entregas entram: `combinado` e `publicado`. Entrega `orcado` bloqueia com aviso (PMR-8).
- As linhas de exemplo do template (`[Ex: …]`) saem na versão oficial (TI-1).
- Tabela com número variável de linhas exige suporte da D4Sign a linhas repetidas (TI-6).

### T2 — Anexo I (peso das entregas): uma linha por grupo (tipo + plataforma)

| Coluna | Origem | Regra / validação | Ausente |
|---|---|---|---|
| Tipo de Entrega | Grupo de T1; para Stories o template usa "Stories (conjunto)" | — | — |
| Plataforma | Plataforma do grupo (T1) | — | — |
| Peso (% do valor) | **SEM ORIGEM** (a plataforma tem um pagamento único, sem valor por entrega) → entrada manual no diálogo | Cada peso > 0; **soma = 100%** | BLOQUEIA |
| Valor correspondente | Calculado: V16 × peso, em centavos; a última linha absorve o arredondamento | A soma é **exatamente** V16 | derivado |
| TOTAL | `100%` e `R$ [VALOR TOTAL]` = V16 | — | — |

As cláusulas 14 e 23 dependem do Anexo I, então ele é obrigatório.

## 4. Pendências de modelo/regra (bloqueiam; não improvisar texto jurídico)

| ID | Pendência | Efeito |
|---|---|---|
| PMR-1 | Pagamento diferente de "Valor" simples: **Por Hora** (é uma tarifa, não um total), **Comissão**, **Permuta**, **Outro** e combinações. O template só tem "Valor Total da Campanha: R$". `pagamentoCashValue` **não deve ser reutilizado** aqui (soma a tarifa por hora como se fosse total e devolve 0 para permuta/comissão). | Bloqueia até existir regra e texto aprovados |
| PMR-2 | Pagamento em mais de uma parcela. O template tem só o item `a)` da cláusula 11. | Bloqueia |
| PMR-3 | Duração da exclusividade em dias: `DireitosImagem` não tem o campo. Texto para "sem exclusividade" não existe no template. | Dias manuais no diálogo (a confirmar) e texto "não aplicável" a aprovar |
| PMR-4 | Campanha sem cessão de imagem (`permitido = false`): a cláusula 17 é uma cessão incondicional. | Bloqueia |
| PMR-5 | Prazo de uso indeterminado (`duracaoDias` vazio): o template exige "[X] meses". | Bloqueia |
| PMR-6 | `usos` × cláusula 17: itens a) a c) são fixos, e o item b) concede mídia paga mesmo quando V24 = NÃO. Os usos "Orgânico" e "Materiais próprios do cliente" não têm variável. | Revisão jurídica |
| PMR-7 | `Entrega` não tem horário nem permanência. | Coletados na tabela T1 do diálogo (a confirmar) |
| PMR-8 | Entrega `orcado` (orçada, não combinada). | Bloqueia; incluir só `combinado`/`publicado` (a confirmar) |
| PMR-9 | Formato/plataforma por entrega: `tipo` é texto livre. | Sugestão só para os formatos exemplificados; demais manuais |
| PMR-10 | Pesos do Anexo I sem fonte. | Entrada manual obrigatória |

## 5. Pendências do template (para o jurídico antes de subir na D4Sign)

| ID | Item |
|---|---|
| TI-1 | Remover avisos "⚠ Campos acima editáveis…", "⚠ ATENÇÃO: Esta seção define…", "⚠ Preencher a tabela acima…", "— fim do documento —", os rótulos `[Ex: …]` e as linhas de exemplo. |
| TI-2 | Numeração: não existe cláusula 19 (de 18 vai para 20) e a seção VIII usa 8.1/8.2 fora da sequência. |
| TI-3 | Grafia do representante: "Rodrigo **Cézar** da Silva" (qualificação) × "Rodrigo **Cesar** da Silva" (assinatura). |
| TI-4 | Linha de data da assinatura em branco; decidir manter ou remover (a D4Sign registra data/hora da assinatura). |
| TI-5 | Valores jurídicos entre colchetes (C01 a C04): confirmar e fixar. |
| TI-6 | Tabela de entregas e Anexo I precisam de linhas repetidas (a confirmar na D4Sign) ou de um número máximo fixo de linhas. |

## 6. Validações e normalizações a criar (Fase 2; hoje não existem)

- CPF e CNPJ (dígitos verificadores) e formatação; chave PIX por tipo.
- Parser de dinheiro único (existem 3 cópias de `parseMoney` com a mesma falha: devolvem 0 para vazio/inválido, e 0 confunde "não configurado" com "sem valor") e valor por extenso.
- Datas `dd/mm/aaaa` e `DD/MM/AAAA – HH:MM`; CEP (8 dígitos); UF (2 letras); telefone brasileiro; nome com ≥ 2 palavras.
- Mensagem de pendência por linha, no formato: "Falta: Stories — horário; Reels — permanência".

## 7. Dados sensíveis

A fotografia do contrato conterá CPF/CNPJ e PIX/dados bancários. Deve ficar só para o time interno (RLS interna), fora de logs, com acesso a bancário condicionado à permissão `influenciadores:bancario`.

## 8. Fora de escopo desta fase

Integração D4Sign, tabelas, bucket, server functions, webhook, UI e a Fase 2 (mapeador e validadores).
