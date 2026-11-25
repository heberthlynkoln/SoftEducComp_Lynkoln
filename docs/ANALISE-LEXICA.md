# Análise léxica (scanner)

Implementação: `backend/scanner.py`. Testes: `backend/tests/test_scanner.py`.

O scanner percorre o código uma única vez, da esquerda para a direita, e produz uma lista de **tokens** e uma lista de **erros léxicos**. Foi escrito à mão, só com a biblioteca padrão (`re` e `keyword`), para que cada regra fique visível. O código do usuário nunca é executado.

## Token

```json
{ "tipo": "IDENTIFICADOR", "lexema": "preco", "linha": 1, "coluna": 9 }
```

- **lexema**: o trecho exato do código; **tipo**: a categoria do token.
- **linha** e **coluna** começam em 1. A coluna conta **pontos de código Unicode**: `é` e `😀` contam 1, e uma tabulação também conta 1. As linhas terminam em `\n`, `\r\n` ou `\r`, com a mesma regra usada na contagem de linhas da API.

## Categorias

| Tipo | Regra | Exemplos |
|---|---|---|
| `PALAVRA_RESERVADA` | identificador que está em `keyword.kwlist` do Python em uso (3.12 no contêiner) | `if`, `while`, `True`, `import` |
| `IDENTIFICADOR` | letra (Unicode) ou `_`, seguida de letras, dígitos ou `_` | `x`, `preço_2`, `_tmp`, `match` |
| `LITERAL_INTEIRO` | `\d+` | `10` |
| `LITERAL_REAL` | `\d+\.\d*` ou `\.\d+` | `3.14`, `5.`, `.5` |
| `LITERAL_STRING` | aspas simples ou duplas, na mesma linha; `\"` não fecha a string | `"Ana"`, `'a\'b'` |
| `OPERADOR_ARITMETICO` | `+ - * / ** // %` | |
| `OPERADOR_ATRIBUICAO` | `=` e compostos `+= -= *= /= //= %= **=` | |
| `OPERADOR_RELACIONAL` | `== != < > <= >=` | |
| `DELIMITADOR` | `( ) [ ] { } , : ; .` | |
| `QUEBRA_DE_LINHA` | fim de uma linha **que teve tokens** | |

Os operadores seguem a regra do **casamento mais longo**: `**=` é um token, e não `*`, `*` e `=`. Espaços, tabulações e comentários (`#` até o fim da linha) são descartados. As *soft keywords* do Python (`match`, `case`, `type`, `_`) continuam sendo identificadores, como no próprio Python.

**Quebra de linha.** Linhas em branco e linhas só com comentário não geram `QUEBRA_DE_LINHA`, porque não terminam nenhuma instrução. A indentação é descartada, já que o subconjunto não tem blocos.

## Erros léxicos

Depois de um erro, o scanner pula o trecho inválido e continua, para relatar **todos** os erros léxicos de uma vez.

| `codigo` | Quando | Exemplo |
|---|---|---|
| `CARACTERE_INVALIDO` | caractere fora do alfabeto: `@ $ ? ! & \| ^ ~ \`, caracteres de controle, espaço não separável | `x = 1 @ 2` → coluna 7 |
| `NUMERO_MALFORMADO` | número seguido de letras, `_` ou outro ponto; notação científica | `2x`, `1.2.3`, `5e3` |
| `STRING_NAO_FECHADA` | a string chega ao fim da linha sem a aspa de fechamento | `x = "abc` |
| `STRING_NAO_SUPORTADA` | strings com três aspas | `"""texto"""` |

```json
{ "tipo": "ERRO_LEXICO", "codigo": "CARACTERE_INVALIDO", "lexema": "@", "linha": 1, "coluna": 7,
  "mensagem": "O caractere '@' não pertence ao alfabeto da linguagem analisada (o operador @ não faz parte do subconjunto)." }
```

Se houver qualquer erro léxico, o parser **não** é executado (decisão D1, em [ANALISE-SINTATICA.md](ANALISE-SINTATICA.md)).

## Reconhecer não é aceitar

O scanner reconhece mais do que o parser aceita. Em `if x > 3:` não há erro léxico: `if`, `x`, `>`, `3` e `:` são tokens válidos. Quem recusa a construção é o parser, com a explicação de que estruturas de controle estão fora do subconjunto. Essa separação é proposital, para que o estudante veja em que fase cada problema é detectado.
