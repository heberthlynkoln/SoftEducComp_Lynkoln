# Análise léxica (scanner)

O analisador léxico é a primeira fase do compilador: lê o texto do programa e o transforma em uma sequência de **tokens**. Esta página descreve exatamente o que o scanner reconhece nesta etapa. O que não estiver aqui não é reconhecido e gera erro léxico.

> **Escopo léxico × escopo do parser.** O scanner reconhece mais coisas do que o parser vai aceitar. A coluna "Parser (Etapa 4)" indica o que a gramática de referência do README aceita. Um token reconhecido pelo scanner **não** significa que a construção seja válida: por exemplo, `if x > 3:` é tokenizado sem erro léxico, mas o parser (Etapa 4) vai recusar a estrutura.

## Conceitos

- **Lexema:** o trecho exato do código que originou um token. Em `numero = 10`, o lexema de `numero` é `numero`.
- **Token:** a classificação de um lexema, com categoria, posição (linha e coluna) e lexema.
- **Erro léxico:** caractere ou sequência que não pertence a nenhuma categoria. O scanner registra o erro, pula o trecho e **continua**, para mostrar todos os problemas de uma vez.

## Tabela de categorias

| Categoria (`tipo`) | Lexemas reconhecidos | Exemplos | Parser (Etapa 4) |
|---|---|---|---|
| `PALAVRA_RESERVADA` | As palavras reservadas do Python (`keyword.kwlist`): `if`, `else`, `while`, `return`, `def`, `import`, `and`, `or`, `not`, `True`, `False`, `None` etc. | `if`, `None` | não aceita (fora do escopo) |
| `IDENTIFICADOR` | Letra ou `_`, seguida de letras, dígitos ou `_`. Letras acentuadas são aceitas. Não pode começar por dígito. | `x`, `_x1`, `total_2`, `preço` | aceita |
| `LITERAL_INTEIRO` | Dígitos `0`–`9`. | `0`, `42`, `1000` | aceita |
| `LITERAL_REAL` | Dígitos, `.`, dígitos. | `3.14`, `0.5` | aceita |
| `LITERAL_STRING` | Texto entre aspas duplas ou simples, com `\` para escapes. Não pode quebrar a linha. | `"Ana"`, `'x'`, `"aspas \" e barra \\"` | aceita |
| `OPERADOR` | Aritméticos `+ - * / % // **`; atribuição `= += -= *= /= %= **= //= <<= >>=`; relacionais `== != < > <= >=`; outros `-> :=` e deslocamento `<< >>`. | `+`, `==`, `**` | aceita apenas `+ - * /` e `=` |
| `DELIMITADOR` | `( ) [ ] { } , : ; .` | `(`, `:` | aceita apenas `( )` |
| `QUEBRA_DE_LINHA` | `\n`, `\r\n` ou `\r`. Terminam comandos, por isso viram token. | `\n` | usado como fim de atribuição |

Operadores lógicos (`and`, `or`, `not`) são palavras reservadas, não símbolos.

## Espaços, comentários e quebras

- **Espaços e tabulações** são ignorados e não geram token.
- **Comentários** começam em `#` e vão até o fim da linha. São ignorados. Um `#` dentro de um texto entre aspas faz parte do texto.
- **Quebras de linha** geram um token `QUEBRA_DE_LINHA`, porque a gramática usa a quebra para terminar cada atribuição.

## Caracteres e sequências não reconhecidos

Geram **erro léxico** (`ERRO_LEXICO`), sem interromper a análise:

| Situação | Exemplo | Mensagem |
|---|---|---|
| Caractere fora do escopo | `@`, `$`, `!`, `?`, `&`, `\|`, `^`, `~` | `Caractere não reconhecido: '@'` |
| Caractere invisível | `\x00` | `Caractere não reconhecido: '\x00'` (escapado) |
| Texto não fechado | `x = "abc` | `String não fechada: falta a aspa " para terminar o texto nesta linha` |
| Número colado a letras ou pontos | `2x`, `3.abc`, `1.` | `Número malformado: '2x'` |

Para um texto não fechado, o trecho erroneamente aberto vai até o fim da linha; a análise continua na linha seguinte.

## Posição

- **Linha** e **coluna** começam em **1**.
- A coluna conta **caracteres** (pontos de código Unicode), não bytes. Em `s = "ação" + x`, o `x` está na coluna 14.
- `\r\n` conta como uma única quebra de linha.

## Formato dos dados

Token:

```json
{ "tipo": "IDENTIFICADOR", "lexema": "numero", "linha": 1, "coluna": 5 }
```

Erro léxico:

```json
{ "tipo": "ERRO_LEXICO", "lexema": "@", "linha": 1, "coluna": 7, "mensagem": "Caractere não reconhecido: '@'" }
```

Os campos completos da resposta da API estão em [API.md](API.md).

## Exemplos

Código:

```python
numero = 10
resultado = numero * (2 + 3)  # comentário ignorado
```

Tokens (sem as quebras de linha):

| Tipo | Lexema | Linha | Coluna |
|---|---|---|---|
| IDENTIFICADOR | `numero` | 1 | 1 |
| OPERADOR | `=` | 1 | 8 |
| LITERAL_INTEIRO | `10` | 1 | 10 |
| IDENTIFICADOR | `resultado` | 2 | 1 |
| OPERADOR | `=` | 2 | 11 |
| IDENTIFICADOR | `numero` | 2 | 13 |
| OPERADOR | `*` | 2 | 20 |
| DELIMITADOR | `(` | 2 | 22 |
| LITERAL_INTEIRO | `2` | 2 | 23 |
| OPERADOR | `+` | 2 | 25 |
| LITERAL_INTEIRO | `3` | 2 | 27 |
| DELIMITADOR | `)` | 2 | 28 |

Código com erros léxicos:

```python
a = 1 @ 2
b = "sem fim
c = 3
```

Resultado: `sucesso: false`, dois erros (`@` na linha 1, coluna 7; `"sem fim` na linha 2, coluna 5). Os tokens de `a`, `=`, `1`, `2`, `b`, `=`, `c`, `=`, `3` continuam na lista.

## Fora do escopo do scanner nesta etapa

- Números com notação científica (`1e3`), hexadecimais (`0x1F`), binários ou com `_` (`1_000`).
- Literais de bytes (`b"x"`), strings triplas (`"""x"""`), f-strings e prefixos (`r"..."`).
- Continuação de linha com `\` no fim da linha.
- Operadores bit a bit `& | ^ ~`.
- Identificadores não ASCII que não sejam letras (por exemplo, emojis).

Esses casos geram erro léxico ou são lidos como sequências de tokens menores, conforme a tabela acima.
