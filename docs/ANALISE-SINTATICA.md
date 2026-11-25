# Análise sintática, AST e tratamento de erros

| Arquivo | Conteúdo |
|---|---|
| `backend/gramatica.py` | produções, cálculo de FIRST/FOLLOW, construção e verificação da tabela M |
| `backend/parser.py` | parser LL(1) preditivo, construção da AST, passo a passo e mensagens de erro |
| `backend/arvore.py` | tipos de nó da AST e serialização para JSON |
| `backend/processamento.py` | orquestração: validação → scanner → (sem erro léxico) parser |
| `frontend/analise.js` | exibição dos erros, da árvore, dos tokens, do passo a passo e da tabela M |

A gramática está em [gramatica.md](gramatica.md).

## 1. Estratégia: parser LL(1) preditivo próprio

O parser é **descendente preditivo não recursivo**: uma pilha e a tabela M, como no algoritmo clássico de Aho, Lam, Sethi e Ullman.

```
pilha ← [$, PROGRAMA];  a ← primeiro token
repita
  X ← topo da pilha
  se X é ação semântica:    desempilha e executa (cria um nó da AST)
  se X = $ e a = $:         ACEITA
  se X é terminal:          se X = a, desempilha e avança; senão ERRO
  se X é não-terminal:      se M[X, a] = X → Y1…Yk, troca X por Yk…Y1; senão ERRO
```

**Por que esta estratégia**

- A gramática de referência é LL(1), e a tabela M é justamente o que o estudante precisa ver: a interface mostra a tabela, a célula usada em cada passo e a célula vazia que causou o erro.
- Os **tokens esperados** de um erro saem diretamente da tabela, o que liga a teoria (FIRST, FOLLOW e M) à mensagem de erro.
- Um gerador (ANTLR, Lark, PLY) esconderia a tabela e a pilha no código gerado. Um descendente recursivo seria igualmente didático para a AST, mas não exporia a tabela M.
- Não há dependências novas: tudo usa a biblioteca padrão.

**Implementado à mão versus gerado.** Tudo é implementado à mão; nada é gerado por ferramenta. FIRST, FOLLOW e M são **calculados** em tempo de execução a partir das produções, e não escritos manualmente. Se a gramática for alterada e deixar de ser LL(1), `construir_tabela()` acusa o conflito e o teste falha.

**Limitações da estratégia.** A gramática precisa continuar LL(1), sem recursão à esquerda e fatorada. Construções como o sinal unário ou chamadas de função exigiriam novas produções, que também teriam de passar no teste de conflitos.

**Uso do scanner.** O parser recebe a lista de tokens do scanner (`analisar_lexico`) e converte cada token em terminal (tabela em [gramatica.md](gramatica.md#23-correspondência-entre-terminais-e-tokens-do-scanner)). O scanner não foi reimplementado nem modificado para o parser.

## 2. Decisões de projeto

| # | Decisão | Justificativa e verificação |
|---|---|---|
| **D1** | **O parser não roda quando há erro léxico.** A resposta traz os erros léxicos e `sintatico.executado: false`, com o motivo. | Remover um token inválido altera a estrutura do restante: em `x = 1 @ 2`, tirar o `@` produziria `x = 1 2` e um erro sintático que o código original não tem. Os erros léxicos são sempre exibidos. Teste: `test_analise_sintatica.py::test_ct14_d1_erro_lexico_impede_o_parser`. |
| **D3** | **AST abstrata**, não árvore de derivação. `EXPR'`, `TERMO'`, `=`, a quebra de linha e o `$` não viram nós. **Os parênteses são mantidos** como nó `AGRUPAMENTO`. | Mostrar o agrupamento deixa visível *onde* os parênteses mudaram a organização (`(10 + 5) * 2`), que é um objetivo didático do roteiro. A Etapa 5 pode tratar `AGRUPAMENTO` como transparente. A derivação completa aparece no **passo a passo**. |
| **D4** | **Sem recuperação de erros:** o parser para no **primeiro** erro sintático. | Com apenas atribuições, a recuperação teria pouco efeito e poderia gerar erros em cascata; um único erro bem explicado é mais claro. A interface informa isso ao usuário. Teste: `test_parser.py::test_ct18_...`. |
| **D5** | Limite de 100.000 caracteres (validação), 200 parênteses aninhados (mesmo limite do CPython) e AST enviada com até 100 níveis. | Acima de 100 níveis, a árvore não é legível e o serializador JSON limita o aninhamento. O programa continua sendo **analisado**: a resposta diz que é válido e traz um aviso explicando por que a árvore não foi enviada. |
| **D6** | O código do usuário nunca é executado. | Teste `test_ct28_codigo_nao_e_executado`. |
| **D7** | Erros apresentados **por fase**: blocos separados para erro léxico e sintático, com título, símbolo e texto (não só cor). | O estudante precisa saber em que fase o problema ocorreu. |
| **D8** | A AST é exibida como **árvore hierárquica navegável** em HTML/JS puro, renderizada no navegador, sem biblioteca. | Permite expandir e recolher nós, navegar pelo teclado, usar leitores de tela (`role="tree"`) e destacar o trecho de cada nó no código. Os filhos só são criados ao expandir, o que mantém a interface leve em árvores grandes. Uma imagem gerada no servidor (Graphviz) não permitiria interação; D3 ou Mermaid acrescentariam dependência sem ganho para árvores desse tamanho. |

## 3. Estrutura da AST

Cada nó tem sempre os mesmos campos:

```json
{
  "id": "n7",
  "tipo": "MULTIPLICACAO",
  "rotulo": "Multiplicação",
  "linha": 1, "coluna": 13, "linha_fim": 1, "coluna_fim": 17,
  "regra": "TERMO' → * FATOR TERMO'",
  "atributos": { "operador": "*" },
  "filhos": [ { "...": "NUMERO 3" }, { "...": "NUMERO 4" } ]
}
```

- `linha`/`coluna`: início; `linha_fim`/`coluna_fim`: **último caractere** (inclusivo). Colunas em pontos de código, como nos tokens.
- `regra`: a produção que reconheceu a construção (exibida ao selecionar o nó).
- `id`: identificador único na resposta; usado pelo passo a passo (`no_criado`).

| `tipo` | Atributos | Filhos | Regra |
|---|---|---|---|
| `PROGRAMA` | `quantidade_atribuicoes` | as atribuições, na ordem do código | `PROGRAMA → LISTA_ATRIB; LISTA_ATRIB → ATRIB LISTA_ATRIB \| ε` |
| `ATRIBUICAO` | `nome` | `[IDENTIFICADOR (alvo), expressão]` | `ATRIB → identificador = EXPR NOVA_LINHA` |
| `IDENTIFICADOR` | `nome`, `papel` (`"alvo"` à esquerda do `=`, `"uso"` dentro da expressão) | — | 4 (alvo) ou 13 |
| `NUMERO` | `valor` (lexema), `tipo_numero` (`"inteiro"`/`"real"`) | — | 14 |
| `TEXTO` | `valor` (lexema com aspas), `conteudo` (sem as aspas) | — | 15 |
| `ADICAO`, `SUBTRACAO` | `operador` | `[esquerda, direita]` | 6 ou 7 |
| `MULTIPLICACAO`, `DIVISAO` | `operador` | `[esquerda, direita]` | 10 ou 11 |
| `AGRUPAMENTO` | — | `[expressão]` | 16 |

O `papel` do identificador e as posições foram pensados para a **Etapa 5** (tabela de símbolos e "variável usada antes de receber valor").

Exemplo, `int resultado = 10 + 5 * 2` adaptado ao subconjunto (`resultado = 10 + 5 * 2`):

```
Programa (1 atribuição)
└── Atribuição: resultado
    ├── Identificador: resultado (alvo)
    └── Adição (+)
        ├── Número: 10
        └── Multiplicação (*)
            ├── Número: 5
            └── Número: 2
```

### Tokens, árvore de derivação e AST

Para `x = 5 + 3`:

- **Tokens** (scanner): `IDENTIFICADOR(x)`, `OPERADOR_ATRIBUICAO(=)`, `LITERAL_INTEIRO(5)`, `OPERADOR_ARITMETICO(+)`, `LITERAL_INTEIRO(3)`.
- **Derivação** (passo a passo do parser): `PROGRAMA ⇒ LISTA_ATRIB ⇒ ATRIB LISTA_ATRIB ⇒ identificador = EXPR NOVA_LINHA LISTA_ATRIB ⇒ … TERMO EXPR' … ⇒ …`, com todos os não-terminais auxiliares.
- **AST**: `Atribuição(x, Adição(5, 3))`, apenas o que importa para o significado.

A interface exibe as três: a aba *Tokens*, a aba *Passo a passo* (a derivação, com pilha e entrada) e a aba *Árvore (AST)*, cada uma identificada pelo nome correto e com uma explicação curta da diferença.

## 4. Passo a passo

Cada passo registra `numero`, `tipo` (`inicio`, `expandir`, `casar`, `acao`, `aceitar`, `erro`), a `pilha` (topo à direita, no máximo 30 símbolos), os próximos 8 tokens da `entrada`, a descrição da `acao` e, quando houver, `celula` e `producao` usadas, `token` consumido (índice em `lexico.tokens`) e `no_criado` (id do nó da AST criado). São guardados os primeiros 2.000 passos (`passos_truncados` e `total_passos` informam o restante). A análise em si não tem esse limite.

Em caso de erro, `arvore_parcial` traz as subárvores já construídas antes do erro (por exemplo, as atribuições completas das linhas anteriores). A interface as mostra em *Árvore em construção*.

## 5. Tratamento de erros sintáticos

Formato (campos fixos), para `a = 1` seguido de `b = 2 * (3 + * 4)`:

```json
{
  "tipo": "ERRO_SINTATICO",
  "linha": 2, "coluna": 14, "linha_fim": 2, "coluna_fim": 14,
  "encontrado": "*", "encontrado_tipo": "OPERADOR_ARITMETICO",
  "esperado": ["identificador", "número", "string", "("],
  "esperados_terminais": ["identificador", "numero", "string", "("],
  "regra": "TERMO → FATOR TERMO'",
  "celula_tabela": { "nao_terminal": "TERMO", "terminal": "*" },
  "token": 11,
  "mensagem": "Erro sintático na linha 2, coluna 14: era esperado identificador, número, string ou '(', mas o parser encontrou o operador '*'.",
  "explicacao": "O operador '+' precisa de um operando à direita: dois operadores seguidos ('+' e '*') não formam uma expressão. Uma expressão começa por um identificador, um número, uma string ou '('. Na tabela M, a célula M[TERMO, *] está vazia: nenhuma alternativa de TERMO pode começar com '*'."
}
```

**Como os esperados são calculados.** No erro, o parser volta ao estado da pilha logo **após o último token consumido** e testa, pela tabela M, cada terminal da gramática, guardando os que seriam aceitos. O conjunto é exato: inclui o que as produções ε aplicadas antes do erro permitiriam (em `x = (2 + 3`, os operadores **e** o `)`) e não inclui `)` fora de parênteses (em `x = 1 2`, só operadores ou fim da linha).

**Tipos de erro tratados**, com explicação própria para cada um:

| Situação | Exemplo | O que a explicação diz |
|---|---|---|
| Token inesperado | `x 5` | faltou o `=` entre o nome e o valor |
| Construção incompleta | `x =`, `x = 5 +`, `x = ()` | falta a expressão ou o operando à direita |
| Fim inesperado do código | `x = (2 + 3` | o código terminou; o `(` aberto na linha L, coluna C não foi fechado |
| Operadores consecutivos | `x = 1 + * 2` | dois operadores seguidos não formam uma expressão |
| Falta de operador | `x = 1 2` | faltou um operador entre os dois operandos |
| Parêntese sobrando | `x = (1))` | `)` sem `(` correspondente |
| Palavra reservada como nome | `if = 5` | `if` é palavra reservada do Python |
| Construção fora do subconjunto | `if x > 3:`, `x = [1]`, `x += 1`, `print(x)`, `x = a > b`, `x = -5` | qual construção é e que ela não faz parte do subconjunto, com a alternativa quando existe |

Em todos os casos, a explicação termina com a **causa formal**: a célula vazia de M, ou o terminal do topo da pilha (e a regra que o empilhou) que não casou com o token.

**Mensagens.** O parser não usa exceções do Python para o usuário, não mostra *stack traces*, caminhos nem nomes internos (verificado por `test_erro_nao_expoe_detalhes_internos`). Entradas inválidas nunca derrubam a aplicação: o resultado é sempre HTTP 200 com o erro descrito, e falhas inesperadas viram o erro 500 padronizado, sem detalhes.

**Recuperação.** Não implementada (D4): apenas o primeiro erro é reportado, e isso está escrito na própria tela.

## 6. Relação com as próximas etapas

A análise semântica (Etapa 5) ainda **não está implementada**. A AST desta etapa foi desenhada para ela: cada identificador sabe se é `alvo` ou `uso`, todos os nós têm posição e `processar()` já tem o ponto em que a análise semântica entrará, depois do parser. Os casos CT-29 (`y = x + 1` sem `x` definido) e CT-30 (número + texto) ficam para a Etapa 5.
