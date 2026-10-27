"""POST /api/analisar com a análise léxica integrada: tokens e erros na resposta."""
from processamento import EntradaRejeitada
from schemas import RespostaRecebimento
from scanner import ERRO_LEXICO, TIPOS_DE_TOKEN


def test_codigo_valido_retorna_tokens_e_sucesso(enviar):
    d = enviar("numero = 10\n").json()
    assert d["sucesso"] is True
    assert d["erros"] == []
    assert [(t["tipo"], t["lexema"], t["linha"], t["coluna"]) for t in d["tokens"]] == [
        ("IDENTIFICADOR", "numero", 1, 1),
        ("OPERADOR", "=", 1, 8),
        ("LITERAL_INTEIRO", "10", 1, 10),
        ("QUEBRA_DE_LINHA", "\n", 1, 12),
    ]


def test_todo_token_usa_uma_categoria_documentada(enviar):
    d = enviar('if x > 3:\n    y = (a + "t") * 2.5 # c\n').json()
    assert {t["tipo"] for t in d["tokens"]} <= set(TIPOS_DE_TOKEN)


def test_erro_lexico_retorna_200_com_sucesso_falso_e_lista_de_erros(enviar):
    r = enviar("a = 1 @ 2\n")
    assert r.status_code == 200
    d = r.json()
    assert d["sucesso"] is False
    assert d["erros"] == [{
        "tipo": ERRO_LEXICO, "lexema": "@", "linha": 1, "coluna": 7,
        "mensagem": "Caractere não reconhecido: '@'",
    }]
    # os tokens válidos continuam sendo devolvidos
    assert [t["lexema"] for t in d["tokens"] if t["tipo"] == "IDENTIFICADOR"] == ["a"]


def test_erro_sintatico_nao_afeta_a_analise_lexica(enviar):
    """`x 5` tem tokens válidos: o scanner não reclama, quem reclama é o parser (Etapa 4)."""
    d = enviar("x 5\n").json()
    assert d["sucesso"] is True and d["erros"] == []


def test_resposta_com_erros_valida_no_schema(enviar):
    d = enviar('x = "abc\n').json()
    RespostaRecebimento.model_validate(d)
    assert d["erros"][0]["lexema"] == '"abc'


def test_requisicao_vazia_continua_sendo_422_como_na_etapa_2(enviar):
    r = enviar("")
    assert r.status_code == 422
    assert r.json()["erro"]["codigo"] == "CODIGO_VAZIO"


def test_codigo_so_com_comentario_tem_sucesso_e_sem_tokens_de_conteudo(enviar):
    d = enviar("# nada aqui\n").json()
    assert d["sucesso"] is True
    assert [t["tipo"] for t in d["tokens"]] == ["QUEBRA_DE_LINHA"]


def test_posicoes_de_erro_em_varias_linhas(enviar):
    d = enviar("x = 1\ny = $\n").json()
    assert (d["erros"][0]["linha"], d["erros"][0]["coluna"]) == (2, 5)


def test_analise_e_deterministica(enviar):
    codigo = "total = preco * (qtd + 1) @ x\n"
    assert enviar(codigo).json() == enviar(codigo).json()


def test_scanner_nao_interrompe_a_aplicacao_com_entrada_hostil(enviar):
    d_r = enviar("'" * 50 + "\x00\x01 \u00a0 @@@ \"\n")
    assert d_r.status_code == 200
    assert d_r.json()["sucesso"] is False
