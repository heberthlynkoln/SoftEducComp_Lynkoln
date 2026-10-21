"""Testes unitários da camada de processamento (independentes de HTTP)."""
import pytest

from processamento import (EntradaRejeitada, contar_linhas, processar, validar_entrada)


@pytest.mark.parametrize("texto,esperado", [
    ("", 0), ("a", 1), ("a\n", 1), ("a\nb", 2), ("a\nb\n", 2),
    ("a\r\nb\r\n", 2), ("a\rb", 2), ("\n", 1), ("\n\n", 2), ("a\n\n", 2),
])
def test_contagem_de_linhas(texto, esperado):
    assert contar_linhas(texto) == esperado


@pytest.mark.parametrize("texto,codigo,status", [
    ("", "CODIGO_VAZIO", 422),
    (" \n\t", "CODIGO_APENAS_ESPACOS", 422),
    ("a" * 100_001, "CODIGO_MUITO_LONGO", 413),
])
def test_validar_entrada_rejeita(texto, codigo, status):
    with pytest.raises(EntradaRejeitada) as exc:
        validar_entrada(texto)
    assert (exc.value.codigo, exc.value.status) == (codigo, status)


@pytest.mark.parametrize("texto", ["x = 1", "x = (", "   x   ", "if :"])
def test_validar_entrada_aceita(texto):
    assert validar_entrada(texto) is None


def test_processar_nao_altera_o_texto():
    texto = "  x\t= 'á'\r\n"
    assert processar(texto)["codigo"] == texto


@pytest.mark.parametrize("texto", ["\ud800", "x = \udfff", "a\ud83d"])
def test_validar_entrada_rejeita_surrogates_isolados(texto):
    with pytest.raises(EntradaRejeitada) as exc:
        validar_entrada(texto)
    assert (exc.value.codigo, exc.value.status) == ("CODIGO_INVALIDO", 422)


@pytest.mark.parametrize("texto", ["x = \"á😀\"", "π = 3", "\u00a0x = 1"])
def test_validar_entrada_aceita_unicode_valido(texto):
    assert validar_entrada(texto) is None
