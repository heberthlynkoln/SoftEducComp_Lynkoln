"""Backend do visualizador de análise sintática (Etapa 1: Hello, World!).

Nesta etapa a API só prova que o backend está no ar e que o frontend
consegue se comunicar com ele. As funcionalidades de análise léxica e
sintática serão adicionadas nas próximas etapas.
"""
from fastapi import FastAPI

app = FastAPI(title="Visualizador de Análise Sintática - API")


@app.get("/api/hello")
def hello():
    """Rota usada pelo frontend para exibir a mensagem na tela."""
    return {"message": "Hello, World!"}


@app.get("/api/health")
def health():
    """Rota usada pelo Docker para saber se o backend está saudável."""
    return {"status": "ok"}
