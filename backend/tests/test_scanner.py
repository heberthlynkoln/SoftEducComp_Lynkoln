"""Testes unitários do analisador léxico (scanner.py), sem HTTP.

Cobrem os itens da seção 6.1 do roteiro: palavras reservadas, identificadores,
literais, operadores (inclusive compostos), delimitadores, comentários, espaços,
posição, erros léxicos e casos de borda.
"""
import pytest

from scanner import (
    DELIMITADOR, ERRO_LEXICO, IDENTIFICADOR, LITERAL_INTEIRO, LITERAL_REAL,
    LITERAL_STRING, OPERADOR, PALAVRA_RESERVADA, QUEBRA_DE_LINHA, analisar_lexico,
)


def pares(codigo):
    """(tipo, lexema) de cada token, sem posição."""
    tokens, _ = analisar_lexico(codigo)
    return [(t["tipo"], t["lexema"]) for t in tokens]


def so_lexemas(codigo):
    tokens, _ = analisar_lexico(codigo)
    return [t["lexema"] for t in tokens if t["tipo"] != QUEBRA_DE_LINHA]


# ---------------------------------------------------------- palavras reservadas
@pytest.mark.parametrize("palavra", ["if", "else", "while", "return", "def", "import", "and", "or", "not"])
def test_palavras_reservadas_sao_reconhecidas(palavra):
    assert pares(palavra) == [(PALAVRA_RESERVADA, palavra)]


@pytest.mark.parametrize("valor", ["True", "False", "None"])
def test_constantes_sao_palavras_reservadas(valor):
    assert pares(valor) == [(PALAVRA_RESERVADA, valor)]


def test_palavra_reservada_nao_e_confundida_com_identificador_que_a_contem():
    assert pares("iffy") == [(IDENTIFICADOR, "iffy")]
    assert pares("returned") == [(IDENTIFICADOR, "returned")]


# ---------------------------------------------------------------- identificadores
@pytest.mark.parametrize("nome", ["x", "_x1", "total_2", "numero", "Preço", "ação", "_", "x9"])
def test_identificadores_validos(nome):
    assert pares(nome) == [(IDENTIFICADOR, nome)]


@pytest.mark.parametrize("nome", ["2x", "9abc"])
def test_identificador_que_comeca_com_digito_e_erro_de_numero_malformado(nome):
    tokens, erros = analisar_lexico(nome)
    assert tokens == []
    assert erros[0]["lexema"] == nome
    assert "malformado" in erros[0]["mensagem"]


# --------------------------------------------------------------------- literais
def test_literais_inteiros():
    assert pares("0 42 1000") == [(LITERAL_INTEIRO, "0"), (LITERAL_INTEIRO, "42"), (LITERAL_INTEIRO, "1000")]


def test_literais_reais():
    assert pares("3.14 0.5") == [(LITERAL_REAL, "3.14"), (LITERAL_REAL, "0.5")]


@pytest.mark.parametrize("trecho", ["3.", "3.14.5", "1.abc"])
def test_numero_colado_a_ponto_ou_letra_e_malformado(trecho):
    tokens, erros = analisar_lexico(trecho)
    assert tokens == [] and len(erros) >= 1
    assert erros[0]["lexema"] == trecho


def test_strings_com_aspas_duplas_e_simples():
    assert pares('"Ana" \'Bia\'') == [(LITERAL_STRING, '"Ana"'), (LITERAL_STRING, "'Bia'")]


def test_string_com_escapes_e_um_unico_token():
    codigo = 'a = "aspas \\" e \\\\ barra"'
    assert pares(codigo)[-1] == (LITERAL_STRING, '"aspas \\" e \\\\ barra"')


def test_string_nao_fechada_gera_erro_e_nao_token():
    tokens, erros = analisar_lexico('x = "abc')
    assert [t["lexema"] for t in tokens] == ["x", "="]
    assert erros == [{
        "tipo": ERRO_LEXICO, "lexema": '"abc', "linha": 1, "coluna": 5,
        "mensagem": 'String não fechada: falta a aspa " para terminar o texto nesta linha',
    }]


def test_string_nao_fechada_nao_invade_a_linha_seguinte():
    tokens, erros = analisar_lexico('x = "abc\ny = 2\n')
    assert erros[0]["lexema"] == '"abc'
    assert [t["lexema"] for t in tokens if t["tipo"] == IDENTIFICADOR] == ["x", "y"]


def test_hash_dentro_de_string_nao_e_comentario():
    assert pares('s = "#não"') == [(IDENTIFICADOR, "s"), (OPERADOR, "="), (LITERAL_STRING, '"#não"')]


# -------------------------------------------------------------------- operadores
@pytest.mark.parametrize("op", ["+", "-", "*", "/", "%", "=", "<", ">"])
def test_operadores_simples(op):
    assert pares(op) == [(OPERADOR, op)]


@pytest.mark.parametrize("op", ["==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "**", "//", "->", ":="])
def test_operadores_compostos_sao_um_unico_token(op):
    assert pares(op) == [(OPERADOR, op)]


def test_operador_composto_tem_prioridade_sobre_o_simples():
    assert so_lexemas("a**=b//c") == ["a", "**=", "b", "//", "c"]


def test_igualdade_nao_vira_dois_sinais_de_atribuicao():
    assert so_lexemas("x == 1") == ["x", "==", "1"]


# ------------------------------------------------------------------- delimitadores
@pytest.mark.parametrize("d", list("()[]{},:;."))
def test_delimitadores(d):
    assert pares(d) == [(DELIMITADOR, d)]


# ----------------------------------------------------------- comentários e espaços
def test_comentario_de_linha_e_ignorado():
    assert so_lexemas("x = 1  # comentário com = e ( ) \n") == ["x", "=", "1"]


def test_comentario_no_fim_do_arquivo_sem_quebra_de_linha():
    assert so_lexemas("x = 1 # fim") == ["x", "=", "1"]


def test_comentario_nao_consome_a_quebra_de_linha_seguinte():
    assert pares("# só comentário\nx") == [(QUEBRA_DE_LINHA, "\n"), (IDENTIFICADOR, "x")]


def test_espacos_e_tabulacoes_nao_geram_tokens():
    assert so_lexemas("  x \t=\t5   ") == ["x", "=", "5"]


def test_quebras_de_linha_viram_tokens():
    assert pares("a\nb") == [(IDENTIFICADOR, "a"), (QUEBRA_DE_LINHA, "\n"), (IDENTIFICADOR, "b")]


@pytest.mark.parametrize("quebra", ["\r\n", "\r", "\n"])
def test_todas_as_quebras_de_linha_sao_reconhecidas(quebra):
    tokens, _ = analisar_lexico(f"a{quebra}b")
    assert [t["lexema"] for t in tokens] == ["a", quebra, "b"]
    assert tokens[2]["linha"] == 2 and tokens[2]["coluna"] == 1


# ---------------------------------------------------------------------- posição
def test_posicoes_em_varias_linhas():
    tokens, _ = analisar_lexico("numero = 10\nx = 2")
    posicoes = {(t["lexema"], t["linha"], t["coluna"]) for t in tokens}
    assert ("numero", 1, 1) in posicoes      # início da linha 1
    assert ("10", 1, 10) in posicoes
    assert ("x", 2, 1) in posicoes           # coluna volta a 1 na linha 2
    assert ("2", 2, 5) in posicoes


def test_exemplo_do_roteiro_numero_na_coluna_5():
    tokens, _ = analisar_lexico("int numero = 10;")
    por_lexema = {t["lexema"]: (t["linha"], t["coluna"]) for t in tokens}
    assert por_lexema["numero"] == (1, 5)
    assert por_lexema["="] == (1, 12)


def test_coluna_conta_caracteres_e_nao_bytes():
    tokens, _ = analisar_lexico('s = "ação" + x')
    x = next(t for t in tokens if t["lexema"] == "x")
    assert x["coluna"] == 14  # 's = "ação" + ' tem 13 caracteres


def test_token_no_fim_do_arquivo_sem_quebra_de_linha():
    tokens, _ = analisar_lexico("x = abc")
    assert tokens[-1] == {"tipo": IDENTIFICADOR, "lexema": "abc", "linha": 1, "coluna": 5}


# ---------------------------------------------------------------- erros léxicos
def test_caractere_invalido_gera_erro_com_localizacao_e_mensagem_do_roteiro():
    tokens, erros = analisar_lexico("a = 1 @ 2")
    assert erros == [{
        "tipo": ERRO_LEXICO, "lexema": "@", "linha": 1, "coluna": 7,
        "mensagem": "Caractere não reconhecido: '@'",
    }]


@pytest.mark.parametrize("ch", ["@", "$", "!", "?", "`", "&", "|", "^", "~", "\\"])
def test_caracteres_fora_do_escopo_geram_erro(ch):
    tokens, erros = analisar_lexico(f"x {ch} y")
    assert [e["lexema"] for e in erros] == [ch]
    assert [t["lexema"] for t in tokens] == ["x", "y"]   # o scanner continua após o erro


def test_caractere_invisivel_aparece_escapado_na_mensagem():
    _, erros = analisar_lexico("x = 1\x00")
    assert erros[0]["mensagem"] == "Caractere não reconhecido: '\\x00'"


def test_erros_nao_interrompem_a_analise():
    tokens, erros = analisar_lexico("a @ b\nc $ d\n")
    assert [e["lexema"] for e in erros] == ["@", "$"]
    assert [t["lexema"] for t in tokens if t["tipo"] == IDENTIFICADOR] == ["a", "b", "c", "d"]


def test_erros_sao_acumulados_na_ordem_do_codigo():
    _, erros = analisar_lexico("x = @\ny = $\nz = 2x")
    assert [(e["linha"], e["coluna"]) for e in erros] == [(1, 5), (2, 5), (3, 5)]


def test_codigo_sintaticamente_invalido_mas_lexicamente_valido_nao_gera_erro():
    """Responsabilidade do parser (Etapa 4): o scanner só classifica os tokens."""
    for codigo in ["x 5", "x = 5 +", "= = = (((", "if x > 3:\n    y = 1\n"]:
        _, erros = analisar_lexico(codigo)
        assert erros == [], codigo


# ------------------------------------------------------------------- casos de borda
def test_codigo_vazio():
    assert analisar_lexico("") == ([], [])


def test_apenas_espacos():
    assert analisar_lexico("   \t  ") == ([], [])


def test_apenas_comentarios():
    tokens, erros = analisar_lexico("# um\n# dois")
    assert [t["tipo"] for t in tokens] == [QUEBRA_DE_LINHA]
    assert erros == []


def test_apenas_quebras_de_linha_viram_so_quebras():
    tokens, _ = analisar_lexico("\n\n")
    assert [t["tipo"] for t in tokens] == [QUEBRA_DE_LINHA, QUEBRA_DE_LINHA]


def test_exemplos_do_escopo_documentado():
    """Os programas de exemplo do escopo têm os tokens esperados e nenhum erro léxico."""
    tokens, erros = analisar_lexico("total = preco * (qtd + 1)\nnome = \"Ana\"\n")
    assert erros == []
    assert [t["tipo"] for t in tokens if t["tipo"] != QUEBRA_DE_LINHA] == [
        IDENTIFICADOR, OPERADOR, IDENTIFICADOR, OPERADOR, DELIMITADOR, IDENTIFICADOR, OPERADOR,
        LITERAL_INTEIRO, DELIMITADOR,
        IDENTIFICADOR, OPERADOR, LITERAL_STRING,
    ]
