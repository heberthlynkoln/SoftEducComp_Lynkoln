# Gramática do subconjunto de Python

Este documento define **exatamente** o que o parser reconhece. A gramática é a base do parser (`backend/parser.py`), dos testes (`backend/tests/test_gramatica.py`, `test_parser.py`) e da aba *Gramática e tabela M* da interface.

A análise léxica (como o texto vira tokens) está em [ANALISE-LEXICA.md](ANALISE-LEXICA.md). O funcionamento do parser, a AST e o tratamento de erros estão em [ANALISE-SINTATICA.md](ANALISE-SINTATICA.md).

## 1. Construções

| Situação | Construções |
|---|---|
| **Aceitas pelo parser** | Atribuição `identificador = expressão`, uma por linha; expressões com `+`, `-`, `*`, `/` e parênteses; identificadores (com acentos e `_`), números inteiros e reais (`10`, `3.14`, `.5`, `5.`) e strings entre aspas simples ou duplas; várias atribuições em sequência; linhas em branco e comentários com `#` (descartados pelo scanner). |
| **Reconhecidas só pelo scanner** (geram tokens, mas o parser recusa com explicação) | Palavras reservadas do Python (`if`, `while`, `def`, `True`, `import`…), operadores relacionais (`==`, `<`, `>=`…), operadores `**`, `//`, `%`, atribuições compostas (`+=`, `-=`…), delimitadores `[ ] { } , : ; .` |
| **Fora do escopo** (erro léxico ou sintático) | Estruturas de controle e blocos (indentação não é tratada); funções, classes e chamadas de função; listas, dicionários e tuplas; `import`; comparações e operadores lógicos; sinal negativo unário (`-5`, use `0 - 5`); atribuição encadeada (`x = y = 1`); várias atribuições na mesma linha (`;`); operadores bit a bit e `@`; notação científica (`5e3`); strings com três aspas, f-strings e continuação de linha com `\`. |

> Python não tem declaração de variáveis: a atribuição cria a variável. Por isso não há "declaração com e sem inicialização" no subconjunto.

## 2. Gramática formal

### 2.1 EBNF (visão de leitura)

```ebnf
programa    = { atribuicao } ;
atribuicao  = IDENTIFICADOR "=" expressao NOVA_LINHA ;
expressao   = termo { ( "+" | "-" ) termo } ;
termo       = fator { ( "*" | "/" ) fator } ;
fator       = IDENTIFICADOR | NUMERO | STRING | "(" expressao ")" ;
```

### 2.2 BNF LL(1) (a que o parser usa)

Para a análise preditiva, as repetições `{ }` viram não-terminais com produção vazia (ε) e a recursão à esquerda é eliminada (`EXPR'`, `TERMO'`). Os números são os mesmos exibidos na interface e usados na tabela M.

```
 1  PROGRAMA     → LISTA_ATRIB
 2  LISTA_ATRIB  → ATRIB LISTA_ATRIB
 3  LISTA_ATRIB  → ε
 4  ATRIB        → identificador = EXPR NOVA_LINHA
 5  EXPR         → TERMO EXPR'
 6  EXPR'        → + TERMO EXPR'
 7  EXPR'        → - TERMO EXPR'
 8  EXPR'        → ε
 9  TERMO        → FATOR TERMO'
10  TERMO'       → * FATOR TERMO'
11  TERMO'       → / FATOR TERMO'
12  TERMO'       → ε
13  FATOR        → identificador
14  FATOR        → numero
15  FATOR        → string
16  FATOR        → ( EXPR )
```

- **Símbolo inicial:** `PROGRAMA`.
- **Não-terminais:** `PROGRAMA`, `LISTA_ATRIB`, `ATRIB`, `EXPR`, `EXPR'`, `TERMO`, `TERMO'`, `FATOR`.
- **Terminais:** `identificador`, `numero`, `string`, `=`, `+`, `-`, `*`, `/`, `(`, `)`, `NOVA_LINHA` e `$` (fim da entrada).

É a mesma gramática de referência definida nas etapas anteriores. No código (`backend/gramatica.py`), as produções também levam **ações semânticas** (símbolos `@alvo`, `@bin`, `@agrupa`…) que constroem a AST. Elas não fazem parte da gramática, são ignoradas no cálculo de FIRST e FOLLOW e aparecem no passo a passo entre chaves (`{bin}`).

### 2.3 Correspondência entre terminais e tokens do scanner

| Terminal | Token produzido pelo scanner |
|---|---|
| `identificador` | `IDENTIFICADOR` |
| `numero` | `LITERAL_INTEIRO` ou `LITERAL_REAL` |
| `string` | `LITERAL_STRING` |
| `=` | `OPERADOR_ATRIBUICAO` com lexema `=` |
| `+` `-` `*` `/` | `OPERADOR_ARITMETICO` com o lexema correspondente |
| `(` `)` | `DELIMITADOR` com o lexema correspondente |
| `NOVA_LINHA` | `QUEBRA_DE_LINHA`; se a última linha não terminar com quebra, o parser acrescenta uma `NOVA_LINHA` **implícita** (como o tokenizador do Python), que não aparece na lista de tokens |
| `$` | fim da entrada (não é token) |

Qualquer outro token (palavra reservada, `==`, `**`, `[`…) não corresponde a nenhum terminal: não tem coluna na tabela M e por isso sempre gera erro sintático, com uma explicação sobre o motivo de estar fora do subconjunto.

**Coerência com o scanner.** Todos os terminais acima são produzidos pelo scanner; nenhum token novo precisou ser criado para o parser. O único ajuste do scanner pensado para o parser é que linhas em branco e linhas só com comentário **não** geram `QUEBRA_DE_LINHA` (como o `NL` do Python, que não termina instrução), para que não apareçam "atribuições vazias".

## 3. Precedência e associatividade

| Nível | Operadores | Associatividade | Onde está na gramática |
|---|---|---|---|
| 1 (mais forte) | `( )` | — | `FATOR → ( EXPR )` |
| 2 | `*` `/` | à esquerda | `TERMO` / `TERMO'` |
| 3 (mais fraco) | `+` `-` | à esquerda | `EXPR` / `EXPR'` |

A precedência vem da **estratificação** (`EXPR` usa `TERMO`, que usa `FATOR`): uma multiplicação é sempre reconhecida dentro de um termo, antes de a soma o combinar. A associatividade à esquerda vem da forma como o parser monta a AST ao percorrer `EXPR'`/`TERMO'`: o operando já reconhecido fica à esquerda do próximo.

| Entrada | AST (simplificada) | Teste |
|---|---|---|
| `r = 10 + 5 * 2` | `10 + (5 * 2)` | `test_parser.py::test_precedencia_e_associatividade` |
| `r = 20 - 5 - 3` | `(20 - 5) - 3` | idem |
| `r = 100 / 10 / 2` | `(100 / 10) / 2` | idem |
| `r = (10 + 5) * 2` | `(10 + 5) * 2`, com nó de agrupamento | idem |

## 4. FIRST, FOLLOW e tabela M

Os conjuntos são **calculados** pelo backend a partir das produções (`gramatica.py`), não digitados à mão. O teste `test_gramatica.py` compara o resultado com o cálculo manual abaixo e verifica que não há conflitos (a gramática é LL(1)).

| Não-terminal | FIRST | FOLLOW |
|---|---|---|
| PROGRAMA | { identificador, ε } | { $ } |
| LISTA_ATRIB | { identificador, ε } | { $ } |
| ATRIB | { identificador } | { identificador, $ } |
| EXPR | { identificador, numero, string, ( } | { ), NOVA_LINHA } |
| EXPR' | { +, -, ε } | { ), NOVA_LINHA } |
| TERMO | { identificador, numero, string, ( } | { +, -, ), NOVA_LINHA } |
| TERMO' | { *, /, ε } | { +, -, ), NOVA_LINHA } |
| FATOR | { identificador, numero, string, ( } | { *, /, +, -, ), NOVA_LINHA } |

Tabela M (número da produção; célula vazia = erro):

| M | identificador | numero | string | = | + | - | * | / | ( | ) | NOVA_LINHA | $ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PROGRAMA | 1 | | | | | | | | | | | 1 |
| LISTA_ATRIB | 2 | | | | | | | | | | | 3 |
| ATRIB | 4 | | | | | | | | | | | |
| EXPR | 5 | 5 | 5 | | | | | | 5 | | | |
| EXPR' | | | | | 6 | 7 | | | | 8 | 8 | |
| TERMO | 9 | 9 | 9 | | | | | | 9 | | | |
| TERMO' | | | | | 12 | 12 | 10 | 11 | | 12 | 12 | |
| FATOR | 13 | 14 | 15 | | | | | | 16 | | | |

A mesma tabela está disponível em `GET /api/gramatica` e na interface, onde a célula da falha é marcada com ✗.

## 5. Exemplos

### Válidos

```python
x = 5
resultado = 10 + 5 * 2
media = (2 + 3) * 4 / 2 - 1
nome = "Ana"
saudacao = "Olá, " + nome      # comentário no fim da linha
r = ((((1))))
```

### Inválidos (erros sintáticos intencionais)

| Entrada | Posição | Esperado | Explicação dada ao estudante (resumo) |
|---|---|---|---|
| `x 5` | 1:3 | `=` | faltou o `=` entre o nome da variável e o valor |
| `x = 5 +` | 1:8 | identificador, número, string ou `(` | o operador `+` precisa de um operando à direita, mas o código terminou |
| `x = (2 + 3` | 1:11 | `+ - * /` ou `)` | o parêntese aberto na coluna 5 não foi fechado |
| `x =` | 1:4 | identificador, número, string ou `(` | depois do `=` deve vir a expressão |
| `x = 1 + * 2` | 1:9 | identificador, número, string ou `(` | dois operadores seguidos |
| `x = 1 2` | 1:7 | `+ - * /` ou fim da linha | faltou um operador entre `1` e `2` |
| `x = (1))` | 1:8 | `+ - * /` ou fim da linha | `)` sem o `(` correspondente |
| `if = 5` | 1:1 | identificador ou fim do código | `if` é palavra reservada e não pode ser nome de variável |
| `if x > 3:` | 1:1 | identificador ou fim do código | estruturas de controle estão fora do subconjunto |
| `x = -5` | 1:5 | identificador, número, string ou `(` | sinal negativo unário fora do subconjunto: escreva `0 - 5` |
| `print(x)` | 1:6 | `=` | chamadas de função fora do subconjunto |
| `x = y = 1` | 1:7 | `+ - * /` ou fim da linha | atribuição encadeada fora do subconjunto |

Exemplo de **erro léxico**, em que o parser não é executado: `x = 1 @ 2` (caractere não reconhecido na coluna 7).

A lista completa, com o resultado esperado de cada caso e o teste que o verifica, está em [etapa4/casos-de-teste.md](etapa4/casos-de-teste.md).
