"""Modelos do contrato da API (entrada, saída e erros). Documentados em docs/API.md."""
from typing import Optional

from pydantic import BaseModel, Field


class EntradaCodigo(BaseModel):
    """Corpo de POST /api/analisar. O texto é guardado exatamente como enviado."""

    codigo: str = Field(description="Código-fonte informado pelo usuário, tratado como texto puro.")


class Estatisticas(BaseModel):
    linhas: int = Field(description="Número de linhas (\\n, \\r\\n ou \\r; um terminador final não conta).")
    caracteres: int = Field(description="Número de caracteres (pontos de código Unicode).")
    bytes: int = Field(description="Tamanho em bytes na codificação UTF-8.")


class RespostaRecebimento(BaseModel):
    """Resposta 200: o código foi recebido e passou nas validações iniciais."""

    recebido: bool = True
    mensagem: str
    codigo: str = Field(description="Eco do código recebido, sem nenhuma alteração.")
    estatisticas: Estatisticas


class DetalheErro(BaseModel):
    campo: Optional[str] = None
    problema: str


class Erro(BaseModel):
    codigo: str = Field(description="Identificador estável do erro (veja a tabela em docs/API.md).")
    mensagem: str = Field(description="Mensagem legível, pensada para ser exibida ao usuário.")
    detalhes: list[DetalheErro] = []


class RespostaErro(BaseModel):
    """Formato único de todas as respostas de erro da API."""

    recebido: bool = False
    erro: Erro
