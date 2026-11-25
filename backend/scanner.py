"""Analisador léxico (scanner) do subconjunto de Python.

Transforma o código-fonte em uma lista de tokens (tipo, lexema, linha, coluna) e
uma lista de erros léxicos. O scanner reconhece MAIS do que o parser aceita
(palavras reservadas, operadores relacionais e compostos, delimitadores extras):
um token válido não significa uma construção válida, e a recusa de estruturas
fora do subconjunto é tarefa do parser (docs/ANALISE-LEXICA.md).

Convenções de posição:
  * linhas e colunas começam em 1;
  * a coluna conta pontos de código Unicode (um acento ou um emoji contam 1;
    uma tabulação conta 1);
  * \\n, \\r\\n e \\r terminam uma linha (a mesma regra de contar_linhas).

Implementação manual, só com a biblioteca padrão (re, keyword), para que cada
regra fique visível ao estudante. O código nunca é executado.
"""
import keyword
import re

# ------------------------------------------------------------ categorias
PALAVRA_RESERVADA = "PALAVRA_RESERVADA"
IDENTIFICADOR = "IDENTIFICADOR"
LITERAL_INTEIRO = "LITERAL_INTEIRO"
LITERAL_REAL = "LITERAL_REAL"
LITERAL_STRING = "LITERAL_STRING"
OPERADOR_ARITMETICO = "OPERADOR_ARITMETICO"
OPERADOR_ATRIBUICAO = "OPERADOR_ATRIBUICAO"
OPERADOR_RELACIONAL = "OPERADOR_RELACIONAL"
DELIMITADOR = "DELIMITADOR"
QUEBRA_DE_LINHA = "QUEBRA_DE_LINHA"

CATEGORIAS = [
    PALAVRA_RESERVADA, IDENTIFICADOR, LITERAL_INTEIRO, LITERAL_REAL, LITERAL_STRING,
    OPERADOR_ARITMETICO, OPERADOR_ATRIBUICAO, OPERADOR_RELACIONAL, DELIMITADOR, QUEBRA_DE_LINHA,
]

# Códigos de erro léxico (campo "codigo" de cada erro)
CARACTERE_INVALIDO = "CARACTERE_INVALIDO"
NUMERO_MALFORMADO = "NUMERO_MALFORMADO"
STRING_NAO_FECHADA = "STRING_NAO_FECHADA"
STRING_NAO_SUPORTADA = "STRING_NAO_SUPORTADA"

# Palavras reservadas do interpretador em uso (Python 3.12 no contêiner).
# As "soft keywords" (match, case, type, _) continuam sendo identificadores, como no Python.
PALAVRAS_RESERVADAS = frozenset(keyword.kwlist)

# Operadores e delimitadores, do mais longo para o mais curto (casamento mais longo).
SIMBOLOS = [
    ("**=", OPERADOR_ATRIBUICAO), ("//=", OPERADOR_ATRIBUICAO),
    ("+=", OPERADOR_ATRIBUICAO), ("-=", OPERADOR_ATRIBUICAO), ("*=", OPERADOR_ATRIBUICAO),
    ("/=", OPERADOR_ATRIBUICAO), ("%=", OPERADOR_ATRIBUICAO),
    ("==", OPERADOR_RELACIONAL), ("!=", OPERADOR_RELACIONAL),
    ("<=", OPERADOR_RELACIONAL), (">=", OPERADOR_RELACIONAL),
    ("**", OPERADOR_ARITMETICO), ("//", OPERADOR_ARITMETICO),
    ("<", OPERADOR_RELACIONAL), (">", OPERADOR_RELACIONAL),
    ("+", OPERADOR_ARITMETICO), ("-", OPERADOR_ARITMETICO), ("*", OPERADOR_ARITMETICO),
    ("/", OPERADOR_ARITMETICO), ("%", OPERADOR_ARITMETICO),
    ("=", OPERADOR_ATRIBUICAO),
    ("(", DELIMITADOR), (")", DELIMITADOR), ("[", DELIMITADOR), ("]", DELIMITADOR),
    ("{", DELIMITADOR), ("}", DELIMITADOR), (",", DELIMITADOR), (":", DELIMITADOR),
    (";", DELIMITADOR), (".", DELIMITADOR),
]

# Expressões regulares (ancoradas na posição atual com .match(texto, pos)).
RE_IDENTIFICADOR = re.compile(r"[^\W\d]\w*")        # letra ou _ seguida de letras, dígitos ou _ (Unicode)
RE_NUMERO = re.compile(r"\d+\.\d*|\.\d+|\d+")         # 10, 3.14, 5., .5 (sem notação científica)
RE_CAUDA_NUMERO = re.compile(r"[\w.]+")               # o que "gruda" num número e o torna malformado
RE_ESPACO = re.compile(r"[ \t\f]+")
RE_QUEBRA = re.compile(r"\r\n|\r|\n")


def _erro(codigo, lexema, linha, coluna, mensagem):
    return {"tipo": "ERRO_LEXICO", "codigo": codigo, "lexema": lexema,
            "linha": linha, "coluna": coluna, "mensagem": mensagem}


def _mensagem_caractere(ch: str) -> str:
    visivel = repr(ch)[1:-1] if not ch.isprintable() or ch.isspace() else ch
    base = f"o caractere '{visivel}' não pertence ao alfabeto da linguagem analisada"
    dicas = {
        "@": " (o operador @ não faz parte do subconjunto)",
        "&": " (operadores bit a bit não fazem parte do subconjunto)",
        "|": " (operadores bit a bit não fazem parte do subconjunto)",
        "^": " (operadores bit a bit não fazem parte do subconjunto)",
        "~": " (operadores bit a bit não fazem parte do subconjunto)",
        "\\": " (a continuação de linha com \\ não é suportada)",
        "$": "", "?": "", "!": " (para 'diferente de' use !=)",
        " ": " (espaço não separável: substitua por um espaço comum)",
    }
    return base + dicas.get(ch, "") + "."


def analisar_lexico(codigo: str) -> dict:
    """Executa a análise léxica. Retorna {"sucesso", "tokens", "erros"}.

    Depois de um erro, o scanner pula o trecho inválido e continua, para relatar
    todos os erros léxicos de uma vez.
    """
    tokens, erros = [], []
    pos, linha, inicio_linha = 0, 1, 0
    n = len(codigo)
    linha_tem_conteudo = False  # só emite QUEBRA_DE_LINHA depois de uma linha com tokens

    def coluna(p):
        return p - inicio_linha + 1

    def emitir(tipo, lexema, p):
        nonlocal linha_tem_conteudo
        tokens.append({"tipo": tipo, "lexema": lexema, "linha": linha, "coluna": coluna(p)})
        linha_tem_conteudo = True

    while pos < n:
        ch = codigo[pos]

        # espaços e tabulações: separam tokens e são descartados
        m = RE_ESPACO.match(codigo, pos)
        if m:
            pos = m.end()
            continue

        # quebra de linha: vira token só se a linha teve conteúdo (linhas em branco
        # e linhas só com comentário não geram QUEBRA_DE_LINHA, como no Python)
        m = RE_QUEBRA.match(codigo, pos)
        if m:
            if linha_tem_conteudo:
                tokens.append({"tipo": QUEBRA_DE_LINHA, "lexema": m.group(), "linha": linha,
                               "coluna": coluna(pos)})
            pos = m.end()
            linha += 1
            inicio_linha = pos
            linha_tem_conteudo = False
            continue

        # comentário: de # até o fim da linha, descartado
        if ch == "#":
            m = RE_QUEBRA.search(codigo, pos)
            pos = m.start() if m else n
            continue

        # string entre aspas simples ou duplas, na mesma linha
        if ch in "\"'":
            if codigo.startswith(ch * 3, pos):
                fim = RE_QUEBRA.search(codigo, pos)
                trecho = codigo[pos:fim.start() if fim else n]
                erros.append(_erro(STRING_NAO_SUPORTADA, trecho, linha, coluna(pos),
                                   "Strings com três aspas (''' ou \"\"\") não fazem parte do subconjunto."))
                pos = fim.start() if fim else n
                continue
            p = pos + 1
            fechou = False
            while p < n and codigo[p] not in "\r\n":
                if codigo[p] == "\\" and p + 1 < n and codigo[p + 1] not in "\r\n":
                    p += 2          # sequência de escape: \" não fecha a string
                    continue
                if codigo[p] == ch:
                    fechou = True
                    break
                p += 1
            if fechou:
                emitir(LITERAL_STRING, codigo[pos:p + 1], pos)
                pos = p + 1
            else:
                trecho = codigo[pos:p]
                erros.append(_erro(STRING_NAO_FECHADA, trecho, linha, coluna(pos),
                                   f"A string iniciada com {ch} não foi fechada antes do fim da linha."))
                pos = p
            continue

        # número (inteiro ou real); se letras, dígitos, _ ou . "grudam" nele, é malformado
        m = RE_NUMERO.match(codigo, pos)
        if m:
            fim = m.end()
            cauda = RE_CAUDA_NUMERO.match(codigo, fim)
            if cauda:
                lexema = codigo[pos:cauda.end()]
                dica = (" A notação científica não faz parte do subconjunto."
                        if re.fullmatch(r"[\d.]+[eE][+-]?\d*", lexema) else
                        " Um nome de variável não pode começar com dígito.")
                erros.append(_erro(NUMERO_MALFORMADO, lexema, linha, coluna(pos),
                                   f"'{lexema}' não é um número válido.{dica}"))
                pos = cauda.end()
                linha_tem_conteudo = True
                continue
            lexema = m.group()
            emitir(LITERAL_REAL if "." in lexema else LITERAL_INTEIRO, lexema, pos)
            pos = fim
            continue

        # identificador ou palavra reservada
        m = RE_IDENTIFICADOR.match(codigo, pos)
        if m:
            lexema = m.group()
            emitir(PALAVRA_RESERVADA if lexema in PALAVRAS_RESERVADAS else IDENTIFICADOR, lexema, pos)
            pos = m.end()
            continue

        # operadores e delimitadores (casamento mais longo primeiro)
        for simbolo, tipo in SIMBOLOS:
            if codigo.startswith(simbolo, pos):
                emitir(tipo, simbolo, pos)
                pos += len(simbolo)
                break
        else:
            erros.append(_erro(CARACTERE_INVALIDO, ch, linha, coluna(pos), _mensagem_caractere(ch)[0].upper()
                               + _mensagem_caractere(ch)[1:]))
            pos += 1
            linha_tem_conteudo = True

    return {"sucesso": not erros, "tokens": tokens, "erros": erros}
