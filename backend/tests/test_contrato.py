"""O contrato documentado (OpenAPI gerado) corresponde ao que a API realmente faz."""


def test_openapi_descreve_o_endpoint(client):
    op = client.get("/api/openapi.json").json()["paths"]["/api/analisar"]["post"]
    assert set(op["responses"]) >= {"200", "400", "413", "422", "500"}
    req = op["requestBody"]["content"]["application/json"]["schema"]
    assert req["$ref"].endswith("EntradaCodigo")


def test_esquema_de_entrada_exige_codigo(client):
    esquemas = client.get("/api/openapi.json").json()["components"]["schemas"]
    assert esquemas["EntradaCodigo"]["required"] == ["codigo"]
    assert esquemas["EntradaCodigo"]["properties"]["codigo"]["type"] == "string"


def test_codigos_de_erro_documentados_existem_no_codigo():
    """docs/API.md lista os códigos de erro; todos devem ser realmente emitidos."""
    from pathlib import Path
    doc = (Path(__file__).resolve().parents[2] / "docs" / "API.md").read_text(encoding="utf-8")
    codigos = ["CORPO_INVALIDO", "CAMPO_OBRIGATORIO", "CAMPO_INVALIDO", "CODIGO_VAZIO",
               "CODIGO_APENAS_ESPACOS", "CODIGO_INVALIDO", "CODIGO_MUITO_LONGO", "ROTA_NAO_ENCONTRADA",
               "METODO_NAO_PERMITIDO", "ERRO_INTERNO"]
    fonte = "".join(p.read_text(encoding="utf-8") for p in Path(__file__).resolve().parents[1].glob("*.py"))
    for c in codigos:
        assert c in doc, f"{c} não está documentado"
        assert c in fonte, f"{c} não é emitido pelo backend"


def test_codigos_de_erro_lexico_documentados_e_emitidos():
    from pathlib import Path
    raiz = Path(__file__).resolve().parents[2]
    api = (raiz / "docs" / "API.md").read_text(encoding="utf-8")
    lexica = (raiz / "docs" / "ANALISE-LEXICA.md").read_text(encoding="utf-8")
    fonte = (raiz / "backend" / "scanner.py").read_text(encoding="utf-8")
    for c in ["CARACTERE_INVALIDO", "NUMERO_MALFORMADO", "STRING_NAO_FECHADA", "STRING_NAO_SUPORTADA"]:
        assert c in api and c in lexica and c in fonte, c


def test_openapi_descreve_analise_e_gramatica(client):
    esquema = client.get("/api/openapi.json").json()
    assert "/api/gramatica" in esquema["paths"]
    resp = esquema["components"]["schemas"]["RespostaRecebimento"]["properties"]
    assert {"recebido", "mensagem", "codigo", "estatisticas", "sucesso", "lexico", "sintatico"} <= set(resp)
