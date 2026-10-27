"""Backend do visualizador de análise sintática.

Contrato completo em docs/API.md. Organização:
  main.py          rotas e tratamento padronizado de erros
  schemas.py       modelos de entrada, saída e erro
  processamento.py validações iniciais e orquestração da análise
  scanner.py       analisador léxico (tokens e erros léxicos)

Etapa 3 do roteiro: a API valida o código e executa a análise léxica. A análise
sintática (Etapa 4) e a semântica ainda não existem.
"""
import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from processamento import EntradaRejeitada, processar, validar_entrada
from schemas import EntradaCodigo, RespostaErro, RespostaRecebimento

logger = logging.getLogger("api")

app = FastAPI(
    title="Visualizador de Análise Sintática - API",
    description="Recebe código Python (subconjunto de atribuições), executa a análise léxica e devolve tokens e erros.",
    docs_url="/api/docs",        # acessível também pelo Nginx em http://localhost:8080/api/docs
    openapi_url="/api/openapi.json",
    redoc_url=None,
)


def resposta_erro(status: int, codigo: str, mensagem: str, detalhes=None) -> JSONResponse:
    corpo = {"recebido": False, "erro": {"codigo": codigo, "mensagem": mensagem, "detalhes": detalhes or []}}
    return JSONResponse(status_code=status, content=corpo)


# ---------------------------------------------------------------- rotas
@app.post(
    "/api/analisar",
    response_model=RespostaRecebimento,
    summary="Recebe o código-fonte e executa a análise léxica",
    responses={
        200: {"description": "Código recebido. `sucesso` é false quando há erros léxicos (a lista `erros` os descreve)."},
        400: {"model": RespostaErro, "description": "Corpo ausente, não é JSON ou não é um objeto JSON."},
        413: {"model": RespostaErro, "description": "Código acima do limite de caracteres."},
        422: {"model": RespostaErro, "description": "Campo `codigo` ausente, de tipo inválido, vazio ou só com espaços."},
        500: {"model": RespostaErro, "description": "Erro interno inesperado."},
    },
)
def receber_codigo(entrada: EntradaCodigo):
    """Valida a entrada, executa a análise léxica e devolve tokens e erros. Não executa o programa."""
    validar_entrada(entrada.codigo)
    return processar(entrada.codigo)


@app.get("/api/hello")
def hello():
    """Rota da Etapa 1, mantida para teste rápido da API."""
    return {"message": "Hello, World!"}


@app.get("/api/health")
def health():
    """Rota usada pelo Docker e pela interface para saber se o backend está no ar."""
    return {"status": "ok"}


# ------------------------------------------------- tratamento de erros
@app.exception_handler(EntradaRejeitada)
async def tratar_entrada_rejeitada(_: Request, exc: EntradaRejeitada):
    return resposta_erro(
        exc.status, exc.codigo, exc.mensagem, [{"campo": exc.campo, "problema": exc.mensagem}]
    )


@app.exception_handler(RequestValidationError)
async def tratar_validacao(_: Request, exc: RequestValidationError):
    erros = exc.errors()
    # Corpo que não é JSON, ou JSON que não é um objeto: problema no corpo como um todo.
    # (corpo ausente ou JSON `null` aparecem como "missing" no próprio corpo, sem nome de campo)
    if any(e["type"] in ("json_invalid", "model_attributes_type")
           or (e["type"] == "missing" and tuple(e["loc"]) == ("body",)) for e in erros):
        return resposta_erro(
            400, "CORPO_INVALIDO",
            'O corpo da requisição deve ser um objeto JSON, por exemplo {"codigo": "x = 5"}.',
        )
    detalhes = []
    for e in erros:
        campo = ".".join(str(p) for p in e["loc"] if p != "body") or None
        detalhes.append({"campo": campo, "problema": e["msg"]})
    if any(e["type"] == "missing" for e in erros):
        return resposta_erro(422, "CAMPO_OBRIGATORIO", 'O campo "codigo" é obrigatório.', detalhes)
    return resposta_erro(422, "CAMPO_INVALIDO", 'O campo "codigo" deve ser um texto.', detalhes)


@app.exception_handler(StarletteHTTPException)
async def tratar_http(_: Request, exc: StarletteHTTPException):
    mapa = {404: ("ROTA_NAO_ENCONTRADA", "Rota não encontrada."),
            405: ("METODO_NAO_PERMITIDO", "Método HTTP não permitido para esta rota.")}
    codigo, mensagem = mapa.get(exc.status_code, ("ERRO_HTTP", str(exc.detail)))
    return resposta_erro(exc.status_code, codigo, mensagem)


@app.exception_handler(Exception)
async def tratar_erro_interno(_: Request, exc: Exception):
    logger.exception("Erro interno ao processar a requisição", exc_info=exc)
    return resposta_erro(500, "ERRO_INTERNO", "Erro interno ao processar o código. Tente novamente.")
