"""POST /api/analisar: requisições válidas, formato e conteúdo da resposta."""
import pytest

from processamento import LIMITE_CARACTERES, MENSAGEM_SUCESSO
from schemas import RespostaRecebimento


def test_requisicao_valida_retorna_200_e_json(enviar):
    r = enviar("x = 5\n")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/json")


def test_formato_da_resposta_segue_o_contrato(enviar):
    d = enviar("x = 5\ntotal = preco * (qtd + 1)\n").json()
    assert set(d) == {"recebido", "sucesso", "mensagem", "codigo", "estatisticas", "tokens", "erros"}
    assert set(d["estatisticas"]) == {"linhas", "caracteres", "bytes"}
    RespostaRecebimento.model_validate(d)  # também valida os tipos


def test_conteudo_da_resposta(enviar):
    codigo = "x = 5\ntotal = preco * (qtd + 1)\n"
    d = enviar(codigo).json()
    assert d["recebido"] is True
    assert d["mensagem"] == MENSAGEM_SUCESSO == "Código recebido com sucesso."
    assert d["codigo"] == codigo
    assert d["estatisticas"] == {"linhas": 2, "caracteres": len(codigo), "bytes": len(codigo.encode())}


@pytest.mark.parametrize("codigo", [
    'nome = "Olá, mundo ✓ 日本語"\n',
    "x = 5\r\ny = 6\r\n",
    "x\t=\t5",
    'a = "aspas \\" e \\\\ barra"',
    "<script>alert(1)</script> = 1",
    "x = '; DROP TABLE t; --",
    'emoji = "😀"',
    "\x00 = 1",
    "   x = 1   \n\n\n",
    "linha longa = " + "1 + " * 5000 + "1",
])
def test_texto_devolvido_sem_alteracao(enviar, codigo):
    r = enviar(codigo)
    assert r.status_code == 200
    d = r.json()
    assert d["codigo"] == codigo
    assert d["estatisticas"]["caracteres"] == len(codigo)
    assert d["estatisticas"]["bytes"] == len(codigo.encode("utf-8"))


@pytest.mark.parametrize("codigo", [
    "x = 5 +\ny = 2\n",
    "total = preco * (qtd + 1\n",
    "x 5\n",
    "if x > 3:\n    y = 1\n",
    "= = = (((",
    "def f(:\n",
])
def test_codigo_com_erros_nao_e_rejeitado(enviar, codigo):
    """O backend não presume código válido: erros serão tratados pela análise futura."""
    r = enviar(codigo)
    assert r.status_code == 200
    assert r.json()["recebido"] is True


def test_codigo_nao_e_executado(enviar, tmp_path):
    alvo = tmp_path / "executou.txt"
    r = enviar(f"open({str(alvo)!r}, 'w').write('x')\n")
    assert r.status_code == 200
    assert not alvo.exists()


def test_limite_exato_e_aceito(enviar):
    assert enviar("a" * LIMITE_CARACTERES).status_code == 200


def test_campos_extras_sao_ignorados(client):
    r = client.post("/api/analisar", json={"codigo": "x = 1", "extra": 123})
    assert r.status_code == 200
    assert "extra" not in r.json()


def test_resposta_e_deterministica(enviar):
    assert enviar("x = 1\n").json() == enviar("x = 1\n").json()
