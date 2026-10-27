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


class Token(BaseModel):
    """Unidade reconhecida pelo analisador léxico."""

    tipo: str = Field(description="Categoria: PALAVRA_RESERVADA, IDENTIFICADOR, LITERAL_INTEIRO, "
                                  "LITERAL_REAL, LITERAL_STRING, OPERADOR, DELIMITADOR ou QUEBRA_DE_LINHA.")
    lexema: str = Field(description="Trecho exato do código que originou o token.")
    linha: int = Field(ge=1, description="Linha em que o token começa (base 1).")
    coluna: int = Field(ge=1, description="Coluna em que o token começa (base 1; conta caracteres).")


class ErroLexico(BaseModel):
    """Caractere ou sequência que o analisador léxico não consegue classificar."""

    tipo: str = Field(default="ERRO_LEXICO")
    lexema: str = Field(description="Trecho problemático.")
    linha: int = Field(ge=1)
    coluna: int = Field(ge=1)
    mensagem: str = Field(description="Mensagem legível, pensada para ser exibida ao usuário.")


class RespostaRecebimento(BaseModel):
    """Resposta 200: o código foi recebido, validado e submetido à análise léxica."""

    recebido: bool = True
    sucesso: bool = Field(description="True quando a análise léxica não encontrou erros (`erros` vazio).")
    mensagem: str
    codigo: str = Field(description="Eco do código recebido, sem nenhuma alteração.")
    estatisticas: Estatisticas
    tokens: list[Token] = Field(default_factory=list, description="Tokens em ordem de aparição.")
    erros: list[ErroLexico] = Field(default_factory=list, description="Erros léxicos em ordem de aparição.")


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
