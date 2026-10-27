"""Validações iniciais e processamento do código recebido.

Esta é a camada que as próximas etapas vão estender: `processar` executa a
análise léxica (scanner.py) e devolve tokens e erros; o parser entrará na Etapa 4.
Nada aqui executa o código informado.
"""
import re

from scanner import analisar_lexico

# Limite de tamanho aceito (a interface aplica o mesmo limite ao campo de texto).
LIMITE_CARACTERES = 100_000

MENSAGEM_SUCESSO = "Código recebido com sucesso."


class EntradaRejeitada(Exception):
    """Entrada que não pode ser processada. Vira uma resposta de erro padronizada."""

    def __init__(self, status: int, codigo: str, mensagem: str, campo: str = "codigo"):
        super().__init__(mensagem)
        self.status = status
        self.codigo = codigo
        self.mensagem = mensagem
        self.campo = campo


def validar_entrada(codigo: str) -> None:
    """Validações iniciais. Não verifica sintaxe: código com erros é aceito."""
    if codigo == "":
        raise EntradaRejeitada(422, "CODIGO_VAZIO", "Nenhum código foi informado.")
    if codigo.strip() == "":
        raise EntradaRejeitada(
            422, "CODIGO_APENAS_ESPACOS", "O código contém apenas espaços em branco."
        )
    if len(codigo) > LIMITE_CARACTERES:
        raise EntradaRejeitada(
            413,
            "CODIGO_MUITO_LONGO",
            f"O código excede o limite de {LIMITE_CARACTERES} caracteres.",
        )
    try:
        codigo.encode("utf-8")
    except UnicodeEncodeError:
        # Ex.: surrogates isolados (\ud800), válidos em JSON mas não em texto UTF-8.
        raise EntradaRejeitada(
            422,
            "CODIGO_INVALIDO",
            "O código contém caracteres que não podem ser processados como texto.",
        )


def contar_linhas(texto: str) -> int:
    """Conta linhas aceitando \\n, \\r\\n e \\r; um terminador final não cria linha extra.

    A interface usa a mesma regra, para que os números exibidos coincidam.
    """
    if texto == "":
        return 0
    sem_final = re.sub(r"(\r\n|\r|\n)$", "", texto, count=1)
    return len(re.split(r"\r\n|\r|\n", sem_final))


def processar(codigo: str) -> dict:
    """Recebe o código, executa a análise léxica e monta a resposta de sucesso.

    `sucesso` indica apenas a análise léxica: um código sem erros de tokens é
    considerado lexicamente válido, mesmo que a sintaxe ainda não tenha sido verificada.
    """
    tokens, erros = analisar_lexico(codigo)
    return {
        "recebido": True,
        "sucesso": not erros,
        "mensagem": MENSAGEM_SUCESSO,
        "codigo": codigo,  # devolvido sem alteração, para conferência pela interface
        "estatisticas": {
            "linhas": contar_linhas(codigo),
            "caracteres": len(codigo),
            "bytes": len(codigo.encode("utf-8")),
        },
        "tokens": tokens,
        "erros": erros,
    }
