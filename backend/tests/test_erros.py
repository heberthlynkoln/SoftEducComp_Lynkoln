"""Tratamento de erros: campos ausentes/inválidos, entradas rejeitadas, falhas internas."""
import pytest

from processamento import LIMITE_CARACTERES
from schemas import RespostaErro


def checar_erro(resposta, status, codigo):
    assert resposta.status_code == status
    assert resposta.headers["content-type"].startswith("application/json")
    d = resposta.json()
    RespostaErro.model_validate(d)               # formato único de erro
    assert d["recebido"] is False
    assert d["erro"]["codigo"] == codigo
    assert d["erro"]["mensagem"]
    assert isinstance(d["erro"]["detalhes"], list)
    return d


# ---- entradas que não podem ser processadas ----
def test_texto_vazio(enviar):
    d = checar_erro(enviar(""), 422, "CODIGO_VAZIO")
    assert d["erro"]["detalhes"][0]["campo"] == "codigo"


@pytest.mark.parametrize("texto", [" ", "   \n\t \n", "\n\n", "\t", "\r\n"])
def test_apenas_espacos(enviar, texto):
    checar_erro(enviar(texto), 422, "CODIGO_APENAS_ESPACOS")


def test_codigo_acima_do_limite(enviar):
    d = checar_erro(enviar("a" * (LIMITE_CARACTERES + 1)), 413, "CODIGO_MUITO_LONGO")
    assert str(LIMITE_CARACTERES) in d["erro"]["mensagem"]


# ---- campo obrigatório ausente ou inválido ----
def test_campo_obrigatorio_ausente(client):
    d = checar_erro(client.post("/api/analisar", json={}), 422, "CAMPO_OBRIGATORIO")
    assert d["erro"]["detalhes"][0]["campo"] == "codigo"


def test_campo_com_outro_nome_equivale_a_ausente(client):
    checar_erro(client.post("/api/analisar", json={"code": "x = 1"}), 422, "CAMPO_OBRIGATORIO")


@pytest.mark.parametrize("valor", [123, 1.5, True, None, ["x = 1"], {"a": 1}])
def test_campo_com_tipo_invalido(client, valor):
    d = checar_erro(client.post("/api/analisar", json={"codigo": valor}), 422, "CAMPO_INVALIDO")
    assert d["erro"]["detalhes"][0]["campo"] == "codigo"


# ---- corpo inválido ----
def test_corpo_que_nao_e_json(client):
    checar_erro(
        client.post("/api/analisar", content="isto não é json", headers={"content-type": "application/json"}),
        400, "CORPO_INVALIDO")


def test_corpo_ausente(client):
    checar_erro(client.post("/api/analisar"), 400, "CORPO_INVALIDO")


@pytest.mark.parametrize("corpo", [[1, 2], "texto", 42, None])
def test_json_que_nao_e_objeto(client, corpo):
    checar_erro(client.post("/api/analisar", json=corpo), 400, "CORPO_INVALIDO")


def test_texto_puro_sem_content_type_json(client):
    checar_erro(client.post("/api/analisar", content="x = 1"), 400, "CORPO_INVALIDO")


# ---- rotas e métodos ----
@pytest.mark.parametrize("metodo", ["get", "put", "delete", "patch"])
def test_metodo_nao_permitido(client, metodo):
    checar_erro(getattr(client, metodo)("/api/analisar"), 405, "METODO_NAO_PERMITIDO")


def test_rota_inexistente(client):
    checar_erro(client.get("/api/nao-existe"), 404, "ROTA_NAO_ENCONTRADA")
    checar_erro(client.post("/api/analisar/outra"), 404, "ROTA_NAO_ENCONTRADA")


# ---- falha interna ----
def test_falha_interna_gera_500_padronizado(client_tolerante, monkeypatch):
    import main

    def quebrar(_):
        raise RuntimeError("falha simulada")

    monkeypatch.setattr(main, "processar", quebrar)
    r = client_tolerante.post("/api/analisar", json={"codigo": "x = 1"})
    d = checar_erro(r, 500, "ERRO_INTERNO")
    assert "falha simulada" not in r.text        # detalhes internos não vazam


# ---- texto que não pode ser codificado (JSON aceita surrogates isolados) ----
def test_surrogate_isolado_e_422_e_nao_500(client_tolerante):
    # Enviado como bytes: o JSON aceita o escape \ud800, mas o cliente de teste não
    # consegue codificar o caractere isolado ao serializar por conta própria.
    r = client_tolerante.post("/api/analisar", content=b'{"codigo": "x = \\ud800"}',
                              headers={"content-type": "application/json"})
    d = checar_erro(r, 422, "CODIGO_INVALIDO")
    assert d["erro"]["detalhes"][0]["campo"] == "codigo"
