"""Modelos do contrato da API (entrada, saída e erros). Documentados em docs/API.md."""
from typing import Any, Optional

from pydantic import BaseModel, Field


class EntradaCodigo(BaseModel):
    """Corpo de POST /api/analisar. O texto é guardado exatamente como enviado."""

    codigo: str = Field(description="Código-fonte informado pelo usuário, tratado como texto puro.")


class Estatisticas(BaseModel):
    linhas: int = Field(description="Número de linhas (\\n, \\r\\n ou \\r; um terminador final não conta).")
    caracteres: int = Field(description="Número de caracteres (pontos de código Unicode).")
    bytes: int = Field(description="Tamanho em bytes na codificação UTF-8.")


class Token(BaseModel):
    tipo: str = Field(description="Categoria do token (IDENTIFICADOR, LITERAL_INTEIRO, OPERADOR_ARITMETICO...).")
    lexema: str = Field(description="Trecho exato do código que formou o token.")
    linha: int
    coluna: int = Field(description="Coluna inicial, a partir de 1, contada em pontos de código Unicode.")


class ErroLexico(BaseModel):
    tipo: str = "ERRO_LEXICO"
    codigo: str = Field(description="CARACTERE_INVALIDO, NUMERO_MALFORMADO, STRING_NAO_FECHADA ou STRING_NAO_SUPORTADA.")
    lexema: str
    linha: int
    coluna: int
    mensagem: str


class ResultadoLexico(BaseModel):
    sucesso: bool
    tokens: list[Token]
    erros: list[ErroLexico]


class ErroSintatico(BaseModel):
    tipo: str = "ERRO_SINTATICO"
    linha: int
    coluna: int
    linha_fim: int
    coluna_fim: int
    encontrado: str = Field(description="Lexema encontrado, ou 'fim da linha' / 'fim do código'.")
    encontrado_tipo: str = Field(description="Categoria do token encontrado, ou FIM.")
    esperado: list[str] = Field(description="O que seria aceito naquele ponto, em linguagem legível.")
    esperados_terminais: list[str] = Field(description="Os mesmos itens, como terminais da gramática.")
    regra: Optional[str] = Field(description="Regra gramatical envolvida no erro.")
    celula_tabela: Optional[dict[str, str]] = Field(
        description="Célula vazia da tabela M que causou o erro ({nao_terminal, terminal}), se houver.")
    token: Optional[int] = Field(description="Índice do token encontrado em lexico.tokens (null no fim do código).")
    mensagem: str
    explicacao: str


class ResultadoSintatico(BaseModel):
    executado: bool = Field(description="false quando há erros léxicos (o parser não roda).")
    sucesso: bool
    ast: Optional[dict[str, Any]] = Field(description="Árvore sintática abstrata (formato em docs/API.md), ou null.")
    arvore_parcial: list[dict[str, Any]] = Field(
        default=[], description="Em caso de erro: subárvores já construídas antes do erro, na ordem do código.")
    erros: list[ErroSintatico]
    avisos: list[str] = []
    motivo: Optional[str] = Field(default=None, description="Por que o parser não foi executado.")
    estatisticas: Optional[dict[str, int]] = Field(description="nós e profundidade da AST.")
    passos: list[dict[str, Any]] = Field(description="Passo a passo do parser LL(1) (pilha, entrada e ação).")
    passos_truncados: bool
    total_passos: int


class RespostaRecebimento(BaseModel):
    """Resposta 200: o código foi recebido, validado e analisado (léxico e sintático)."""

    recebido: bool = True
    mensagem: str
    codigo: str = Field(description="Eco do código recebido, sem nenhuma alteração.")
    estatisticas: Estatisticas
    sucesso: bool = Field(description="true se não houve erro léxico nem sintático.")
    lexico: ResultadoLexico
    sintatico: ResultadoSintatico


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
