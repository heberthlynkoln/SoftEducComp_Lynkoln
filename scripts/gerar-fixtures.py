"""Gera as respostas reais do backend usadas como fixtures nos testes da interface.

Uso (na raiz do repositório):  python scripts/gerar-fixtures.py
O teste backend/tests/test_fixtures_frontend.py falha se as fixtures ficarem
desatualizadas em relação ao backend; nesse caso, rode este script de novo.
"""
import json
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "backend"))

import gramatica  # noqa: E402
from processamento import processar  # noqa: E402

CASOS = {
    "valido": "total = 2 + 3 * 4\nmedia = (2 + 3) * 4 / 2 - 1\n",
    "erro-sintatico": "a = 1\nb = 2 * (3 + * 4)\n",
    "erro-fim": "x = (2 + 3",
    "erro-lexico": "a = 1 @ 2\nb = 3\n",
    "comentario": "# só comentário\n",
}

DESTINO = RAIZ / "frontend" / "tests" / "fixtures"


def gerar():
    DESTINO.mkdir(parents=True, exist_ok=True)
    for nome, codigo in CASOS.items():
        (DESTINO / f"{nome}.json").write_text(
            json.dumps(processar(codigo), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (DESTINO / "gramatica.json").write_text(
        json.dumps(gramatica.descrever(), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


if __name__ == "__main__":
    gerar()
    print(f"Fixtures gravadas em {DESTINO.relative_to(RAIZ)}")
