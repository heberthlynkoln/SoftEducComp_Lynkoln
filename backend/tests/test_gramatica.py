"""Gramática: propriedade LL(1), FIRST, FOLLOW e tabela M conferidos com o cálculo feito à mão."""
import gramatica as G

ID, NUM, STR = "identificador", "numero", "string"


def test_gramatica_e_ll1_sem_conflitos():
    G.construir_tabela()          # lança GramaticaNaoLL1 se houver conflito
    assert G.descrever()["ll1"] is True


def test_first_calculado_confere_com_o_calculo_manual():
    f = G.calcular_first()
    assert f["PROGRAMA"] == {ID, G.EPSILON}
    assert f["LISTA_ATRIB"] == {ID, G.EPSILON}
    assert f["ATRIB"] == {ID}
    for a in ("EXPR", "TERMO", "FATOR"):
        assert f[a] == {ID, NUM, STR, "("}
    assert f["EXPR'"] == {"+", "-", G.EPSILON}
    assert f["TERMO'"] == {"*", "/", G.EPSILON}


def test_follow_calculado_confere_com_o_calculo_manual():
    f = G.calcular_follow()
    assert f["PROGRAMA"] == {"$"}
    assert f["LISTA_ATRIB"] == {"$"}
    assert f["ATRIB"] == {ID, "$"}
    assert f["EXPR"] == f["EXPR'"] == {")", "NOVA_LINHA"}
    assert f["TERMO"] == f["TERMO'"] == {"+", "-", ")", "NOVA_LINHA"}
    assert f["FATOR"] == {"*", "/", "+", "-", ")", "NOVA_LINHA"}


def test_tabela_m_tem_exatamente_as_celulas_esperadas():
    t = G.descrever()["tabela"]
    assert t == {
        "PROGRAMA": {ID: 1, "$": 1},
        "LISTA_ATRIB": {ID: 2, "$": 3},
        "ATRIB": {ID: 4},
        "EXPR": {ID: 5, NUM: 5, STR: 5, "(": 5},
        "EXPR'": {"+": 6, "-": 7, ")": 8, "NOVA_LINHA": 8},
        "TERMO": {ID: 9, NUM: 9, STR: 9, "(": 9},
        "TERMO'": {"+": 12, "-": 12, "*": 10, "/": 11, ")": 12, "NOVA_LINHA": 12},
        "FATOR": {ID: 13, NUM: 14, STR: 15, "(": 16},
    }


def test_producoes_exibidas_sem_acoes_semanticas():
    textos = [p["texto"] for p in G.descrever()["producoes"]]
    assert textos[0] == "PROGRAMA → LISTA_ATRIB"
    assert textos[2] == "LISTA_ATRIB → ε"
    assert textos[3] == "ATRIB → identificador = EXPR NOVA_LINHA"
    assert textos[15] == "FATOR → ( EXPR )"
    assert not any("@" in t for t in textos)


def test_todo_terminal_tem_correspondencia_com_tokens_do_scanner():
    for t in G.descrever()["terminais"]:
        assert t["token"], t


def test_conflito_seria_detectado(monkeypatch):
    """Sanidade do verificador: uma gramática ambígua para LL(1) é recusada."""
    import pytest
    for f in (G.calcular_first, G.calcular_follow, G.construir_tabela):
        f.cache_clear()
    monkeypatch.setattr(G, "PRODUCOES", G.PRODUCOES + [("FATOR", ["identificador", "(", ")"])])
    with pytest.raises(G.GramaticaNaoLL1):
        G.construir_tabela()
    monkeypatch.undo()
    for f in (G.calcular_first, G.calcular_follow, G.construir_tabela):
        f.cache_clear()
    G.construir_tabela()
