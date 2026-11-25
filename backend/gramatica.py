"""Gramática LL(1) do subconjunto e construção da tabela de análise preditiva M.

Os conjuntos FIRST e FOLLOW e a tabela M são CALCULADOS a partir das produções
(algoritmos clássicos de Aho et al.), e não escritos à mão: se alguém alterar a
gramática e ela deixar de ser LL(1), `construir_tabela` acusa o conflito e o
teste tests/test_gramatica.py falha.

Símbolos que começam com "@" são AÇÕES SEMÂNTICAS: não fazem parte da gramática
(são ignoradas em FIRST/FOLLOW e na exibição) e servem para o parser construir a
AST enquanto reconhece a entrada (esquema de tradução dirigido pela sintaxe).
Documentação: docs/gramatica.md.
"""
from functools import lru_cache

EPSILON = "ε"
FIM = "$"
SIMBOLO_INICIAL = "PROGRAMA"

# Terminais da gramática: símbolo interno -> descrição usada nas mensagens.
TERMINAIS = {
    "identificador": "identificador",
    "numero": "número",
    "string": "string",
    "=": "'='",
    "+": "'+'",
    "-": "'-'",
    "*": "'*'",
    "/": "'/'",
    "(": "'('",
    ")": "')'",
    "NOVA_LINHA": "fim da linha",
    FIM: "fim do código",
}

# Correspondência com as categorias do scanner (docs/ANALISE-LEXICA.md).
CORRESPONDENCIA_TOKENS = {
    "identificador": "IDENTIFICADOR",
    "numero": "LITERAL_INTEIRO ou LITERAL_REAL",
    "string": "LITERAL_STRING",
    "=": "OPERADOR_ATRIBUICAO com lexema =",
    "+": "OPERADOR_ARITMETICO com lexema +",
    "-": "OPERADOR_ARITMETICO com lexema -",
    "*": "OPERADOR_ARITMETICO com lexema *",
    "/": "OPERADOR_ARITMETICO com lexema /",
    "(": "DELIMITADOR com lexema (",
    ")": "DELIMITADOR com lexema )",
    "NOVA_LINHA": "QUEBRA_DE_LINHA (ou o fim do código, se a última linha não terminar com quebra)",
    FIM: "fim da entrada (não é um token do scanner)",
}

NAO_TERMINAIS = ["PROGRAMA", "LISTA_ATRIB", "ATRIB", "EXPR", "EXPR'", "TERMO", "TERMO'", "FATOR"]

# Produções numeradas a partir de 1. Lista vazia = ε.
PRODUCOES = [
    ("PROGRAMA", ["LISTA_ATRIB"]),
    ("LISTA_ATRIB", ["ATRIB", "LISTA_ATRIB"]),
    ("LISTA_ATRIB", []),
    ("ATRIB", ["identificador", "@alvo", "=", "EXPR", "NOVA_LINHA", "@atrib"]),
    ("EXPR", ["TERMO", "EXPR'"]),
    ("EXPR'", ["+", "@op", "TERMO", "@bin", "EXPR'"]),
    ("EXPR'", ["-", "@op", "TERMO", "@bin", "EXPR'"]),
    ("EXPR'", []),
    ("TERMO", ["FATOR", "TERMO'"]),
    ("TERMO'", ["*", "@op", "FATOR", "@bin", "TERMO'"]),
    ("TERMO'", ["/", "@op", "FATOR", "@bin", "TERMO'"]),
    ("TERMO'", []),
    ("FATOR", ["identificador", "@id"]),
    ("FATOR", ["numero", "@num"]),
    ("FATOR", ["string", "@str"]),
    ("FATOR", ["(", "@abre", "EXPR", ")", "@agrupa"]),
]

# O que cada ação semântica faz (exibido no passo a passo).
ACOES = {
    "@alvo": "cria o nó IDENTIFICADOR do lado esquerdo da atribuição",
    "@atrib": "cria o nó ATRIBUICAO com o alvo e a expressão",
    "@op": "guarda o operador lido",
    "@bin": "cria o nó da operação com o operando da esquerda e o da direita",
    "@id": "cria o nó IDENTIFICADOR",
    "@num": "cria o nó NUMERO",
    "@str": "cria o nó TEXTO",
    "@abre": "marca a abertura do parêntese",
    "@agrupa": "cria o nó AGRUPAMENTO (parênteses)",
}


def eh_acao(simbolo: str) -> bool:
    return simbolo.startswith("@")


def eh_terminal(simbolo: str) -> bool:
    return simbolo in TERMINAIS


def sem_acoes(direita):
    return [s for s in direita if not eh_acao(s)]


def texto_producao(indice: int) -> str:
    """Produção legível, sem ações semânticas. Ex.: "EXPR' → + TERMO EXPR'"."""
    esquerda, direita = PRODUCOES[indice]
    simbolos = sem_acoes(direita)
    return f"{esquerda} → {' '.join(simbolos) if simbolos else EPSILON}"


def texto_alternativas(nao_terminal: str) -> str:
    """Todas as alternativas de um não-terminal. Ex.: "FATOR → identificador | numero | ..."."""
    alts = [" ".join(sem_acoes(d)) or EPSILON for e, d in PRODUCOES if e == nao_terminal]
    return f"{nao_terminal} → {' | '.join(alts)}"


def _first_de_sequencia(sequencia, first):
    resultado = set()
    for s in sem_acoes(sequencia):
        if eh_terminal(s):
            resultado.add(s)
            return resultado
        resultado |= first[s] - {EPSILON}
        if EPSILON not in first[s]:
            return resultado
    resultado.add(EPSILON)
    return resultado


@lru_cache(maxsize=1)
def calcular_first():
    first = {a: set() for a in NAO_TERMINAIS}
    mudou = True
    while mudou:
        mudou = False
        for esquerda, direita in PRODUCOES:
            novo = _first_de_sequencia(direita, first)
            if not novo <= first[esquerda]:
                first[esquerda] |= novo
                mudou = True
    return {a: frozenset(v) for a, v in first.items()}


@lru_cache(maxsize=1)
def calcular_follow():
    first = calcular_first()
    follow = {a: set() for a in NAO_TERMINAIS}
    follow[SIMBOLO_INICIAL].add(FIM)
    mudou = True
    while mudou:
        mudou = False
        for esquerda, direita in PRODUCOES:
            simbolos = sem_acoes(direita)
            for i, s in enumerate(simbolos):
                if eh_terminal(s):
                    continue
                resto = _first_de_sequencia(simbolos[i + 1:], first)
                novo = (resto - {EPSILON}) | (follow[esquerda] if EPSILON in resto else set())
                if not novo <= follow[s]:
                    follow[s] |= novo
                    mudou = True
    return {a: frozenset(v) for a, v in follow.items()}


class GramaticaNaoLL1(Exception):
    pass


@lru_cache(maxsize=1)
def construir_tabela():
    """Tabela M[A][a] -> índice da produção. Lança GramaticaNaoLL1 se houver conflito."""
    first, follow = calcular_first(), calcular_follow()
    tabela = {a: {} for a in NAO_TERMINAIS}
    for i, (esquerda, direita) in enumerate(PRODUCOES):
        f = _first_de_sequencia(direita, first)
        destinos = (f - {EPSILON}) | (follow[esquerda] if EPSILON in f else set())
        for a in destinos:
            if a in tabela[esquerda]:
                raise GramaticaNaoLL1(
                    f"Conflito em M[{esquerda}, {a}]: produções {tabela[esquerda][a] + 1} e {i + 1}")
            tabela[esquerda][a] = i
    return tabela


def _ordenar(terminais):
    ordem = list(TERMINAIS)
    return sorted(terminais, key=lambda t: ordem.index(t) if t in ordem else len(ordem))


def descrever():
    """Gramática completa em formato serializável (GET /api/gramatica)."""
    first, follow, tabela = calcular_first(), calcular_follow(), construir_tabela()

    def ordenar_com_epsilon(conjunto):
        return _ordenar([x for x in conjunto if x != EPSILON]) + ([EPSILON] if EPSILON in conjunto else [])

    return {
        "simbolo_inicial": SIMBOLO_INICIAL,
        "nao_terminais": NAO_TERMINAIS,
        "terminais": [
            {"simbolo": t, "descricao": d, "token": CORRESPONDENCIA_TOKENS[t]} for t, d in TERMINAIS.items()
        ],
        "producoes": [
            {"numero": i + 1, "esquerda": e, "direita": sem_acoes(d), "texto": texto_producao(i)}
            for i, (e, d) in enumerate(PRODUCOES)
        ],
        "first": {a: ordenar_com_epsilon(first[a]) for a in NAO_TERMINAIS},
        "follow": {a: _ordenar(follow[a]) for a in NAO_TERMINAIS},
        "tabela": {a: {t: tabela[a][t] + 1 for t in _ordenar(tabela[a])} for a in NAO_TERMINAIS},
        "ll1": True,
    }
