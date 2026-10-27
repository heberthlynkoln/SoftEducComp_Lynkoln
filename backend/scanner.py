"""Analisador léxico (scanner) do subconjunto de Python aceito pelo visualizador.

Lê o texto-fonte caractere a caractere, agrupa os caracteres em lexemas e
classifica cada lexema em um tipo de token, registrando linha e coluna (base 1).

Erros léxicos não interrompem a análise: são acumulados e o scanner segue em
frente, para que o usuário veja todos os problemas de uma vez.

Usa apenas a biblioteca padrão. O escopo está documentado em docs/ANALISE-LEXICA.md.
"""
import keyword
import re

# ---------------------------------------------------------------- tipos de token
PALAVRA_RESERVADA = "PALAVRA_RESERVADA"
IDENTIFICADOR = "IDENTIFICADOR"
LITERAL_INTEIRO = "LITERAL_INTEIRO"
LITERAL_REAL = "LITERAL_REAL"
LITERAL_STRING = "LITERAL_STRING"
OPERADOR = "OPERADOR"
DELIMITADOR = "DELIMITADOR"
QUEBRA_DE_LINHA = "QUEBRA_DE_LINHA"
ERRO_LEXICO = "ERRO_LEXICO"

TIPOS_DE_TOKEN = (
    PALAVRA_RESERVADA, IDENTIFICADOR, LITERAL_INTEIRO, LITERAL_REAL,
    LITERAL_STRING, OPERADOR, DELIMITADOR, QUEBRA_DE_LINHA,
)

# ------------------------------------------------------------------- vocabulário
# Palavras reservadas: as do próprio Python (inclui and, or, not, True, None...).
PALAVRAS_RESERVADAS = frozenset(keyword.kwlist)

# Operadores reconhecidos. Ordenados do mais longo para o mais curto na regex,
# para que "**=" seja lido antes de "**" e "*".
OPERADORES = (
    "**=", "//=", "<<=", ">>=",                 # atribuição composta
    "**", "//", "<<", ">>", "==", "!=", "<=", ">=", "->", ":=",
    "+=", "-=", "*=", "/=", "%=",
    "+", "-", "*", "/", "%", "<", ">", "=",
)
DELIMITADORES = frozenset("()[]{},:;.")

_DIGITOS = "0123456789"
_ABERTURAS_DE_TEXTO = frozenset("\"'")

# ------------------------------------------------------------------- expressões
_QUEBRA = re.compile(r"\r\n|\r|\n")
_ESPACOS = re.compile(r"[ \t\f]+")
_COMENTARIO = re.compile(r"#[^\r\n]*")
_IDENTIFICADOR = re.compile(r"[^\W\d]\w*")          # letra ou _ seguida de letras, dígitos ou _
_REAL = re.compile(r"[0-9]+\.[0-9]+")
_INTEIRO = re.compile(r"[0-9]+")
_RESTO_NUMERO = re.compile(r"[\w.]*")               # sufixo que torna o número malformado
_TEXTO = re.compile(r'"(?:[^"\\\r\n]|\\.)*"|\'(?:[^\'\\\r\n]|\\.)*\'')
_RESTO_DA_LINHA = re.compile(r"[^\r\n]*")
_OPERADOR = re.compile("|".join(re.escape(op) for op in sorted(OPERADORES, key=len, reverse=True)))


# ------------------------------------------------------------------- utilitários
def _token(tipo: str, lexema: str, linha: int, coluna: int) -> dict:
    return {"tipo": tipo, "lexema": lexema, "linha": linha, "coluna": coluna}


def _erro(lexema: str, linha: int, coluna: int, mensagem: str) -> dict:
    return {"tipo": ERRO_LEXICO, "lexema": lexema, "linha": linha, "coluna": coluna, "mensagem": mensagem}


def _representar(ch: str) -> str:
    """Caractere para mensagem: caracteres invisíveis aparecem escapados (ex.: \\x00)."""
    return ch if ch.isprintable() else ascii(ch)[1:-1]


# ------------------------------------------------------------------- scanner
def analisar_lexico(codigo: str) -> tuple[list[dict], list[dict]]:
    """Devolve (tokens, erros) do código informado.

    Espaços e comentários são descartados. Quebras de linha viram tokens
    QUEBRA_DE_LINHA, pois a gramática usa a quebra para terminar atribuições.
    """
    tokens: list[dict] = []
    erros: list[dict] = []
    pos = 0
    linha = 1
    inicio_linha = 0          # índice do primeiro caractere da linha atual
    fim = len(codigo)

    while pos < fim:
        coluna = pos - inicio_linha + 1
        ch = codigo[pos]

        if m := _QUEBRA.match(codigo, pos):
            tokens.append(_token(QUEBRA_DE_LINHA, m.group(), linha, coluna))
            pos = m.end()
            linha += 1
            inicio_linha = pos

        elif m := (_ESPACOS.match(codigo, pos) or _COMENTARIO.match(codigo, pos)):
            pos = m.end()    # espaços e comentários são ignorados

        elif m := _IDENTIFICADOR.match(codigo, pos):
            lexema = m.group()
            tipo = PALAVRA_RESERVADA if lexema in PALAVRAS_RESERVADAS else IDENTIFICADOR
            tokens.append(_token(tipo, lexema, linha, coluna))
            pos = m.end()

        elif ch in _DIGITOS:
            m = _REAL.match(codigo, pos) or _INTEIRO.match(codigo, pos)
            resto = _RESTO_NUMERO.match(codigo, m.end())
            if resto.end() > m.end():
                # Ex.: 2x, 3.abc, 1.: o número colado a letras ou pontos não é um literal válido.
                lexema = codigo[pos:resto.end()]
                erros.append(_erro(lexema, linha, coluna, f"Número malformado: '{lexema}'"))
                pos = resto.end()
            else:
                lexema = m.group()
                tipo = LITERAL_REAL if "." in lexema else LITERAL_INTEIRO
                tokens.append(_token(tipo, lexema, linha, coluna))
                pos = m.end()

        elif ch in _ABERTURAS_DE_TEXTO:
            m = _TEXTO.match(codigo, pos)
            if m:
                tokens.append(_token(LITERAL_STRING, m.group(), linha, coluna))
                pos = m.end()
            else:
                # Texto não fechado: o trecho vai até o fim da linha e a análise continua na linha seguinte.
                fim_linha = _RESTO_DA_LINHA.match(codigo, pos).end()
                lexema = codigo[pos:fim_linha]
                erros.append(_erro(
                    lexema, linha, coluna,
                    f"String não fechada: falta a aspa {ch} para terminar o texto nesta linha",
                ))
                pos = fim_linha

        elif m := _OPERADOR.match(codigo, pos):
            tokens.append(_token(OPERADOR, m.group(), linha, coluna))
            pos = m.end()

        elif ch in DELIMITADORES:
            tokens.append(_token(DELIMITADOR, ch, linha, coluna))
            pos += 1

        else:
            erros.append(_erro(ch, linha, coluna, f"Caractere não reconhecido: '{_representar(ch)}'"))
            pos += 1

    return tokens, erros
