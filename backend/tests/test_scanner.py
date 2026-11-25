"""Analisador léxico: categorias, posições, erros e casos de borda (CT-07 a CT-10, CT-22, CT-25)."""
import pytest

from scanner import analisar_lexico


def tipos(codigo):
    return [t["tipo"] for t in analisar_lexico(codigo)["tokens"]]


def pares(codigo):
    return [(t["tipo"], t["lexema"]) for t in analisar_lexico(codigo)["tokens"]]


def test_atribuicao_simples():
    assert pares("x = 5") == [("IDENTIFICADOR", "x"), ("OPERADOR_ATRIBUICAO", "="), ("LITERAL_INTEIRO", "5")]


def test_posicoes_linha_e_coluna():
    toks = analisar_lexico("total = preco * (qtd + 1)\ny = 2\n")["tokens"]
    assert [(t["lexema"], t["linha"], t["coluna"]) for t in toks] == [
        ("total", 1, 1), ("=", 1, 7), ("preco", 1, 9), ("*", 1, 15), ("(", 1, 17), ("qtd", 1, 18),
        ("+", 1, 22), ("1", 1, 24), (")", 1, 25), ("\n", 1, 26),
        ("y", 2, 1), ("=", 2, 3), ("2", 2, 5), ("\n", 2, 6),
    ]


@pytest.mark.parametrize("codigo,tipo", [
    ("10", "LITERAL_INTEIRO"), ("3.14", "LITERAL_REAL"), ("5.", "LITERAL_REAL"), (".5", "LITERAL_REAL"),
    ('"Ana"', "LITERAL_STRING"), ("'Ana'", "LITERAL_STRING"), ('"a\\"b"', "LITERAL_STRING"),
    ("if", "PALAVRA_RESERVADA"), ("True", "PALAVRA_RESERVADA"), ("import", "PALAVRA_RESERVADA"),
    ("match", "IDENTIFICADOR"),   # soft keyword: continua identificador, como no Python
    ("==", "OPERADOR_RELACIONAL"), ("<=", "OPERADOR_RELACIONAL"), ("!=", "OPERADOR_RELACIONAL"),
    ("**", "OPERADOR_ARITMETICO"), ("//", "OPERADOR_ARITMETICO"), ("%", "OPERADOR_ARITMETICO"),
    ("+=", "OPERADOR_ATRIBUICAO"), ("**=", "OPERADOR_ATRIBUICAO"),
    (",", "DELIMITADOR"), (":", "DELIMITADOR"), ("[", "DELIMITADOR"), (".", "DELIMITADOR"),
])
def test_categorias(codigo, tipo):
    assert tipos(codigo) == [tipo]


def test_ct07_identificadores_com_acento_e_sublinhado():
    assert pares("preço_2 = _x") == [("IDENTIFICADOR", "preço_2"), ("OPERADOR_ATRIBUICAO", "="),
                                     ("IDENTIFICADOR", "_x")]


def test_casamento_mais_longo():
    assert [l for _, l in pares("a**=b//c==d")] == ["a", "**=", "b", "//", "c", "==", "d"]


def test_ct06_string_com_virgula_preserva_o_lexema():
    assert pares('msg = "Olá, mundo"')[2] == ("LITERAL_STRING", '"Olá, mundo"')


def test_ct08_caractere_invalido():
    r = analisar_lexico("x = 1 @ 2")
    assert r["sucesso"] is False
    (e,) = r["erros"]
    assert (e["tipo"], e["codigo"], e["lexema"], e["linha"], e["coluna"]) == \
        ("ERRO_LEXICO", "CARACTERE_INVALIDO", "@", 1, 7)
    assert "@" in e["mensagem"]


def test_ct09_numero_malformado():
    (e,) = analisar_lexico("x = 2x")["erros"]
    assert (e["codigo"], e["lexema"], e["linha"], e["coluna"]) == ("NUMERO_MALFORMADO", "2x", 1, 5)


def test_notacao_cientifica_nao_suportada():
    (e,) = analisar_lexico("x = 5e3")["erros"]
    assert e["codigo"] == "NUMERO_MALFORMADO" and "científica" in e["mensagem"]


def test_ct10_string_nao_fechada():
    (e,) = analisar_lexico('x = "abc')["erros"]
    assert (e["codigo"], e["lexema"], e["coluna"]) == ("STRING_NAO_FECHADA", '"abc', 5)


def test_string_nao_atravessa_linhas():
    r = analisar_lexico('x = "abc\ny = 1\n')
    assert [e["codigo"] for e in r["erros"]] == ["STRING_NAO_FECHADA"]
    assert ("IDENTIFICADOR", "y") in pares('x = "abc\ny = 1\n')   # continua na linha seguinte


def test_string_tres_aspas_nao_suportada():
    (e,) = analisar_lexico('x = """a"""')["erros"]
    assert e["codigo"] == "STRING_NAO_SUPORTADA"


def test_varios_erros_lexicos_sao_todos_relatados():
    r = analisar_lexico("a = 1 @ 2\nb = $\nc = 3x\n")
    assert [(e["codigo"], e["linha"]) for e in r["erros"]] == [
        ("CARACTERE_INVALIDO", 1), ("CARACTERE_INVALIDO", 2), ("NUMERO_MALFORMADO", 3)]


def test_ct22_somente_comentario():
    r = analisar_lexico("# comentário")
    assert r == {"sucesso": True, "tokens": [], "erros": []}


def test_comentario_no_fim_da_linha_e_descartado():
    assert tipos("x = 1  # comentário\n") == ["IDENTIFICADOR", "OPERADOR_ATRIBUICAO", "LITERAL_INTEIRO",
                                                "QUEBRA_DE_LINHA"]


def test_ct25_sem_quebra_de_linha_final():
    assert "QUEBRA_DE_LINHA" not in tipos("x = 1")


def test_linhas_em_branco_nao_geram_quebra():
    toks = analisar_lexico("\n\nx = 1\n\n# c\n\ny = 2")["tokens"]
    assert [t["tipo"] for t in toks].count("QUEBRA_DE_LINHA") == 1
    assert (toks[0]["lexema"], toks[0]["linha"]) == ("x", 3)
    assert (toks[-1]["lexema"], toks[-1]["linha"]) == ("2", 7)


@pytest.mark.parametrize("codigo", ["x\r\ny = 1\r\n", "x\ry = 1\r", "x\ny = 1\n"])
def test_terminadores_de_linha(codigo):
    toks = analisar_lexico(codigo)["tokens"]
    assert [(t["lexema"], t["linha"]) for t in toks if t["tipo"] == "IDENTIFICADOR"] == [("x", 1), ("y", 2)]


def test_coluna_conta_pontos_de_codigo():
    toks = analisar_lexico('a = "😀é" + b')["tokens"]
    # a=1 espaço=2 "="=3 espaço=4 aspas=5 😀=6 é=7 aspas=8 espaço=9 +=10 espaço=11 b=12
    assert [(t["lexema"], t["coluna"]) for t in toks][-1] == ("b", 12)


def test_tabulacao_conta_uma_coluna():
    assert [t["coluna"] for t in analisar_lexico("x\t=\t5")["tokens"]] == [1, 3, 5]


def test_ct19_if_gera_tokens_sem_erro_lexico():
    r = analisar_lexico("if x > 3:\n    y = 1\n")
    assert r["sucesso"] is True
    assert r["tokens"][0]["tipo"] == "PALAVRA_RESERVADA"


@pytest.mark.parametrize("ch", ["\x00", " ", "\\", "?", "&", "~"])
def test_caracteres_fora_do_alfabeto(ch):
    (e,) = analisar_lexico(f"x = 1 {ch} 2")["erros"]
    assert e["codigo"] == "CARACTERE_INVALIDO"


def test_scanner_nao_altera_nem_executa():
    codigo = "open('/tmp/nao_deve_existir', 'w')"
    r = analisar_lexico(codigo)
    assert "".join(t["lexema"] for t in r["tokens"]).replace(" ", "") == codigo.replace(" ", "")
