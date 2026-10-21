import sys
import warnings
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
warnings.filterwarnings("ignore", category=DeprecationWarning)

from fastapi.testclient import TestClient  # noqa: E402

from main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def client_tolerante():
    """Cliente que devolve a resposta 500 em vez de relançar a exceção do servidor."""
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def enviar(client):
    def _enviar(codigo):
        return client.post("/api/analisar", json={"codigo": codigo})
    return _enviar
