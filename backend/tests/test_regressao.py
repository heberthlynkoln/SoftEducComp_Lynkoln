"""Compatibilidade: rotas e comportamentos anteriores continuam funcionando."""


def test_hello(client):
    r = client.get("/api/hello")
    assert r.status_code == 200
    assert r.json() == {"message": "Hello, World!"}


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_documentacao_interativa_disponivel_sob_api(client):
    assert client.get("/api/docs").status_code == 200
    assert client.get("/api/openapi.json").status_code == 200


def test_todas_as_rotas_ficam_sob_o_prefixo_api(client):
    """O Nginx só encaminha /api/ ao backend; qualquer rota fora disso ficaria inacessível."""
    caminhos = client.get("/api/openapi.json").json()["paths"]
    assert caminhos and all(c.startswith("/api/") for c in caminhos)


def test_exemplos_do_frontend_sao_aceitos(enviar):
    """Os programas de exemplo da interface (válidos e com erro) trafegam normalmente."""
    import re
    from pathlib import Path

    js = (Path(__file__).resolve().parents[2] / "frontend" / "exemplos.js").read_text(encoding="utf-8")
    codigos = re.findall(r"codigo: '((?:[^'\\]|\\.)*)'", js)
    assert len(codigos) >= 8
    for bruto in codigos:
        codigo = bruto.encode().decode("unicode_escape").encode("latin-1").decode("utf-8")
        r = enviar(codigo)
        assert r.status_code == 200 and r.json()["codigo"] == codigo
