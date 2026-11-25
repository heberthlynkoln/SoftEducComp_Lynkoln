# Casos de teste CT-01 a CT-30

Casos definidos **antes** da implementação do parser (Apêndice A do documento de Materiais e Métodos). Esta versão registra, para cada caso, o teste automatizado que o verifica e o resultado observado na execução de 24/11/2026 ([../REGISTRO-TESTES.md](../REGISTRO-TESTES.md)).

Situação: **Aprovado** = coberto por teste automatizado que passou; **Previsto** = depende de etapa futura.

## Casos válidos

| ID | Entrada | Resultado esperado | Resultado observado | Teste | Situação |
|---|---|---|---|---|---|
| CT-01 | `x = 5` | Tokens IDENTIFICADOR, OPERADOR_ATRIBUICAO, LITERAL_INTEIRO; AST com uma atribuição; sem erros | Igual; AST `Programa(Atribuição(x, 5))` | `test_scanner.py::test_atribuicao_simples`; `test_parser.py::test_casos_validos[CT-01]` | Aprovado |
| CT-02 | `resultado = 10 + 5` | AST com `+` tendo 10 e 5 como filhos | Igual | `test_parser.py::test_casos_validos[CT-02]` | Aprovado |
| CT-03 | `r = 2 + 3 * 4` | `*` como filho de `+` | `+(2, *(3, 4))` | `test_parser.py::test_casos_validos[CT-03]` | Aprovado |
| CT-04 | `r = (2 + 3) * 4` | `+` como filho de `*` | `*(Agrupamento(+(2, 3)), 4)` | `test_parser.py::test_casos_validos[CT-04]` | Aprovado |
| CT-05 | `preco = 10` / `qtd = 3` / `total = preco * (qtd + 1)` | Três atribuições na ordem do código | Igual | `test_parser.py::test_casos_validos[CT-05]` | Aprovado |
| CT-06 | `msg = "Olá, mundo"` | Nó de string com o literal exato, com a vírgula | `TEXTO` com `valor = "Olá, mundo"` | `test_scanner.py::test_ct06_...`; `test_parser.py::test_casos_validos[CT-06]` | Aprovado |
| CT-07 | `preço_2 = _x` | Identificadores com acento e sublinhado | Igual | `test_scanner.py::test_ct07_...`; `test_parser.py::test_casos_validos[CT-07]` | Aprovado |

## Erros léxicos

| ID | Entrada | Resultado esperado | Resultado observado | Teste | Situação |
|---|---|---|---|---|---|
| CT-08 | `x = 1 @ 2` | ERRO_LEXICO linha 1, coluna 7, caractere `@`; `sucesso: false` | Igual (`CARACTERE_INVALIDO`) | `test_scanner.py::test_ct08_...` | Aprovado |
| CT-09 | `x = 2x` | Número malformado `2x`, linha 1, coluna 5 | Igual (`NUMERO_MALFORMADO`) | `test_scanner.py::test_ct09_...` | Aprovado |
| CT-10 | `x = "abc` | String não fechada `"abc`, coluna 5 | Igual (`STRING_NAO_FECHADA`) | `test_scanner.py::test_ct10_...` | Aprovado |

## Erros sintáticos

| ID | Entrada | Resultado esperado | Resultado observado | Teste | Situação |
|---|---|---|---|---|---|
| CT-11 | `x 5` | Erro no `5` (coluna 3); esperado `=` | Linha 1, coluna 3; esperado `=` | `test_parser.py::test_casos_de_erro_sintatico[CT-11]` | Aprovado |
| CT-12 | `x = 5 +` | Erro no fim; esperados identificador, número, string ou `(` | Linha 1, coluna 8, "fim do código"; mesmos esperados | `[CT-12]` | Aprovado |
| CT-13 | `x = (2 + 3` | Erro no fim; esperado `)` ou operador | Linha 1, coluna 11; esperados `+ - * /` e `)`; explicação aponta o `(` da coluna 5 | `[CT-13]` | Aprovado |
| CT-14 | `a = 1 @ 2` / `b = 3` | D1: só o erro léxico; parser não executado; nenhum erro sintático para a linha 2 | `sintatico.executado: false`, `erros: []` | `test_analise_sintatica.py::test_ct14_d1_...` | Aprovado |
| CT-15 | `x =` | Erro após `=`; esperados identificador, número, string ou `(` | Linha 1, coluna 4 (fim da linha) | `[CT-15]` | Aprovado |
| CT-16 | `x = 1 + * 2` | Erro no `*`; esperados identificador, número, string ou `(` | Linha 1, coluna 9; célula vazia `M[TERMO, *]` | `[CT-16]` | Aprovado |
| CT-17 | `if = 5` | Erro no `if`; esperado identificador | Linha 1, coluna 1; esperados identificador ou fim do código; explica que `if` é palavra reservada | `[CT-17]`, `test_ct17_explica_...` | Aprovado |
| CT-18 | `x = 5 +` / `y = 2` | Erro na quebra de linha da linha 1; não continua para a linha 2 (D4) | Linha 1, coluna 8 (fim da linha); um único erro | `[CT-18]`, `test_ct18_...` | Aprovado |
| CT-19 | `if x > 3:` | Erro no `if`, explicando que estruturas de controle estão fora do subconjunto | Igual | `[CT-19]`, `test_ct19_...` | Aprovado |

**Observação sobre CT-17 e CT-19.** O conjunto de esperados inclui "fim do código", porque `LISTA_ATRIB → ε` é aplicável com `$`: um programa vazio é válido. É exatamente o que a linha de `PROGRAMA` na tabela M indica, e o critério C6 compara os esperados com a tabela M. A descrição original ("esperado identificador") fica, portanto, contida no resultado observado.

## Casos de borda

| ID | Entrada | Resultado esperado | Resultado observado | Teste | Situação |
|---|---|---|---|---|---|
| CT-20 | campo vazio | HTTP 422 `CODIGO_VAZIO` | Igual | `test_erros.py::test_texto_vazio` | Aprovado |
| CT-21 | só espaços e tabulações | HTTP 422 `CODIGO_APENAS_ESPACOS` | Igual | `test_erros.py::test_apenas_espacos` | Aprovado |
| CT-22 | `# comentário` | Sucesso, sem tokens e sem erro sintático | Sucesso; `Programa` sem filhos | `test_scanner.py::test_ct22_...`; `test_parser.py::test_ct22_...`; `test_analise_sintatica.py::test_ct22_...` | Aprovado |
| CT-23 | 100.001 caracteres | HTTP 413 `CODIGO_MUITO_LONGO` | Igual | `test_erros.py::test_codigo_acima_do_limite` | Aprovado |
| CT-24 | 100.000 caracteres | Aceito | Igual | `test_analisar.py::test_limite_exato_e_aceito` | Aprovado |
| CT-25 | `x = 1` sem quebra de linha | Tokens sem QUEBRA_DE_LINHA; sintaxe válida | Igual (o parser usa uma NOVA_LINHA implícita) | `test_scanner.py::test_ct25_...`; `test_parser.py::test_casos_validos[CT-25]` | Aprovado |
| CT-26 | `r = ((((1))))` | AST com quatro níveis aninhados, sem erro | Quatro nós `AGRUPAMENTO` aninhados | `test_parser.py::test_casos_validos[CT-26]` | Aprovado |
| CT-27 | cada um dos 10 exemplos da interface | Resultado coerente com o grupo (válido ou com erro) | 5 válidos com AST; 5 com erro sintático | `test_analise_sintatica.py::test_ct27_...` (backend); `integracao.test.js` "CT-27" (interface com backend real) | Aprovado |
| CT-28 | código que tenta gravar um arquivo | Apenas analisado; o arquivo não é criado (D6) | O parser recusa a chamada de função; o arquivo não existe | `test_analisar.py::test_codigo_nao_e_executado`; `test_analise_sintatica.py::test_ct28_...` | Aprovado |

## Erros semânticos (Etapa 5)

| ID | Entrada | Resultado esperado | Situação |
|---|---|---|---|
| CT-29 | `y = x + 1` sem `x` definido | Erro semântico: `x` usado antes de receber valor, linha 1, coluna 5 | Previsto (Etapa 5). Hoje o programa é **sintaticamente válido**, como deve ser. |
| CT-30 | `x = 1` e depois `y = x + "a"` | Incompatibilidade entre número e texto, se tipos forem suportados | Previsto (Etapa 5), condicional |

## Resumo

| Categoria | Casos | Aprovados | Previstos |
|---|---|---|---|
| Válidos | 7 | 7 | 0 |
| Erros léxicos | 3 | 3 | 0 |
| Erros sintáticos | 9 | 9 | 0 |
| Casos de borda | 9 | 9 | 0 |
| Erros semânticos | 2 | 0 | 2 |
| **Total** | **30** | **28** | **2** |
