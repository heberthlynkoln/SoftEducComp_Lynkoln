"""As respostas usadas como fixtures nos testes da interface são as que o backend produz hoje."""
import importlib.util
import json
from pathlib import Path

import pytest

import gramatica
from processamento import processar

RAIZ = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("gerar_fixtures", RAIZ / "scripts" / "gerar-fixtures.py")
gerador = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gerador)


@pytest.mark.parametrize("nome,codigo", list(gerador.CASOS.items()))
def test_fixture_atualizada(nome, codigo):
    salvo = json.loads((gerador.DESTINO / f"{nome}.json").read_text(encoding="utf-8"))
    assert salvo == json.loads(json.dumps(processar(codigo))), \
        f"fixture {nome} desatualizada: rode python scripts/gerar-fixtures.py"


def test_fixture_da_gramatica_atualizada():
    salvo = json.loads((gerador.DESTINO / "gramatica.json").read_text(encoding="utf-8"))
    assert salvo == json.loads(json.dumps(gramatica.descrever()))
