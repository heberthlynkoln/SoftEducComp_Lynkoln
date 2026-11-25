"""POST /api/analisar com análise léxica e sintática; GET /api/gramatica.

Verifica o contrato (docs/API.md), a decisão D1 (parser não roda com erro léxico) e
que os exemplos da interface produzem o resultado prometido pelo seu grupo (CT-27).
"""
import re
from pathlib import Path

import pytest

from schemas import RespostaRecebimento

RAIZ = Path(__file__).resolve().parents[2]


def analisar(enviar, codigo):
    r = enviar(codigo)
    assert r.status_code == 200
    d = r.json()
    RespostaRecebimento.model_validate(d)
    return d


def test_programa_valido_retorna_tokens_ast_e_sucesso(enviar):
    d = analisar(enviar, "x = 10 + 5 * 2\n")
    assert d["sucesso"] is True
    assert d["lexico"]["sucesso"] is True and d["lexico"]["erros"] == []
    assert [t["lexema"] for t in d["lexico"]["tokens"]] == ["x", "=", "10", "+", "5", "*", "2", "\n"]
    s = d["sintatico"]
    assert s["executado"] and s["sucesso"] and s["erros"] == []
    assert s["ast"]["tipo"] == "PROGRAMA"
    soma = s["ast"]["filhos"][0]["filhos"][1]
    assert soma["tipo"] == "ADICAO" and soma["filhos"][1]["tipo"] == "MULTIPLICACAO"


def test_erro_sintatico_retorna_erros_e_ast_nula(enviar):
    d = analisar(enviar, "x = 5 +\n")
    assert d["sucesso"] is False
    assert d["lexico"]["sucesso"] is True
    s = d["sintatico"]
    assert s["executado"] is True and s["sucesso"] is False and s["ast"] is None
    (e,) = s["erros"]
    assert e["tipo"] == "ERRO_SINTATICO"
    assert {"linha", "coluna", "encontrado", "esperado", "mensagem", "explicacao"} <= set(e)


def test_ct14_d1_erro_lexico_impede_o_parser(enviar):
    d = analisar(enviar, "a = 1 @ 2\nb = 3\n")
    assert d["sucesso"] is False
    assert [(e["codigo"], e["linha"], e["coluna"]) for e in d["lexico"]["erros"]] == [("CARACTERE_INVALIDO", 1, 7)]
    s = d["sintatico"]
    assert s["executado"] is False and s["ast"] is None and s["erros"] == [] and s["passos"] == []
    assert "erros léxicos" in s["motivo"]


def test_erro_lexico_continua_mostrando_os_tokens_validos(enviar):
    d = analisar(enviar, "x = 2x + 1")
    assert [t["lexema"] for t in d["lexico"]["tokens"]] == ["x", "=", "+", "1"]


def test_ct22_somente_comentario(enviar):
    d = analisar(enviar, "# comentário")
    assert d["sucesso"] is True and d["lexico"]["tokens"] == []
    assert d["sintatico"]["ast"]["filhos"] == []


def test_ct28_codigo_nao_e_executado(enviar, tmp_path):
    alvo = tmp_path / "executou.txt"
    d = analisar(enviar, f"open({str(alvo)!r}, 'w').write('x')\n")
    assert d["sintatico"]["sucesso"] is False     # chamada de função é recusada pelo parser
    assert not alvo.exists()


def test_erros_no_codigo_respondem_200(enviar):
    """Erros léxicos e sintáticos fazem parte do resultado da análise, não são falhas da requisição."""
    for codigo in ["x = 1 @ 2", "x 5", "if x > 3:\n"]:
        assert enviar(codigo).status_code == 200


def test_posicoes_da_ast_coincidem_com_os_tokens_exibidos(enviar):
    """C9: o que a árvore destaca é exatamente o que a tabela de tokens mostra."""
    d = analisar(enviar, 'total = preco * (qtd + 1)\nnome = "Olá, " + n\n')
    tokens = {(t["linha"], t["coluna"]): t for t in d["lexico"]["tokens"]}
    pilha = [d["sintatico"]["ast"]]
    while pilha:
        no = pilha.pop()
        pilha.extend(no["filhos"])
        if no["tipo"] != "PROGRAMA":
            assert (no["linha"], no["coluna"]) in tokens, no
            fim = [t for t in tokens.values()
                   if t["linha"] == no["linha_fim"] and t["coluna"] + len(t["lexema"]) - 1 == no["coluna_fim"]]
            assert fim, no


def test_tokens_consumidos_pelo_parser_sao_os_exibidos(enviar):
    """Os passos 'casar' consomem, em ordem, exatamente os tokens de lexico.tokens."""
    d = analisar(enviar, "a = 1\nb = (a + 2) * 3\n")
    consumidos = [p["token"] for p in d["sintatico"]["passos"] if p["tipo"] == "casar"]
    assert consumidos == list(range(len(d["lexico"]["tokens"])))


def test_indice_do_token_no_erro(enviar):
    d = analisar(enviar, "x = 1 + * 2")
    e = d["sintatico"]["erros"][0]
    assert d["lexico"]["tokens"][e["token"]]["lexema"] == "*"


def test_entrada_grande_dentro_do_limite_nao_quebra(enviar):
    codigo = "a = 1 + 2 * (b - 3)\n" * 4000        # 80.000 caracteres
    d = analisar(enviar, codigo)
    assert d["sucesso"] is True
    assert d["sintatico"]["passos_truncados"] is True


def test_arvore_profunda_e_avisada_sem_erro_500(enviar):
    d = analisar(enviar, "x = " + "1 + " * 300 + "1")
    assert d["sucesso"] is True and d["sintatico"]["ast"] is None and d["sintatico"]["avisos"]


def test_profundidade_maxima_permitida_e_serializada(enviar):
    """A maior árvore enviada passa pelo serializador da API (proteção contra regressões)."""
    from parser import LIMITE_PROFUNDIDADE_AST
    ops = LIMITE_PROFUNDIDADE_AST - 3               # PROGRAMA + ATRIBUICAO + (ops somas + 1 folha)
    d = analisar(enviar, "x = " + "1 + " * ops + "1")
    assert d["sintatico"]["estatisticas"]["profundidade"] == LIMITE_PROFUNDIDADE_AST
    assert d["sintatico"]["ast"] is not None


# ------------------------------------------------------------ CT-27: exemplos da interface
def exemplos_do_frontend():
    js = (RAIZ / "frontend" / "exemplos.js").read_text(encoding="utf-8")
    blocos = re.findall(r"\{\s*id: '([^']+)'.*?valido: (true|false),\s*codigo: '((?:[^'\\]|\\.)*)'", js, re.S)
    assert len(blocos) >= 10
    for id_, valido, bruto in blocos:
        codigo = bruto.encode().decode("unicode_escape").encode("latin-1").decode("utf-8")
        yield id_, valido == "true", codigo


@pytest.mark.parametrize("id_,valido,codigo", list(exemplos_do_frontend()))
def test_ct27_exemplo_produz_o_resultado_do_seu_grupo(enviar, id_, valido, codigo):
    d = analisar(enviar, codigo)
    assert d["lexico"]["sucesso"] is True, id_          # nenhum exemplo tem erro léxico
    assert d["sintatico"]["sucesso"] is valido, (id_, d["sintatico"]["erros"])
    if not valido:
        assert len(d["sintatico"]["erros"]) == 1


# ------------------------------------------------------------ /api/gramatica
def test_rota_da_gramatica(client):
    r = client.get("/api/gramatica")
    assert r.status_code == 200
    g = r.json()
    assert g["simbolo_inicial"] == "PROGRAMA" and g["ll1"] is True
    assert len(g["producoes"]) == 16
    assert set(g["tabela"]) == set(g["nao_terminais"]) == set(g["first"]) == set(g["follow"])
    assert g["tabela"]["FATOR"]["("] == 16
