"""Árvore Sintática Abstrata (AST) e sua serialização para JSON.

(O arquivo se chama arvore.py, e não ast.py, para não ocultar o módulo `ast` da
biblioteca padrão do Python.)

Cada nó guarda: id único, tipo, rótulo legível, posição inicial e final (linha e
coluna, com coluna_fim inclusiva), a regra gramatical que o reconheceu,
atributos próprios do tipo e a lista de filhos. Formato documentado em
docs/gramatica.md (seção "Estrutura da AST") e docs/API.md.
"""

# Tipos de nó, com rótulo, regra gramatical associada e atributos.
PROGRAMA = "PROGRAMA"
ATRIBUICAO = "ATRIBUICAO"
IDENTIFICADOR = "IDENTIFICADOR"
NUMERO = "NUMERO"
TEXTO = "TEXTO"
ADICAO = "ADICAO"
SUBTRACAO = "SUBTRACAO"
MULTIPLICACAO = "MULTIPLICACAO"
DIVISAO = "DIVISAO"
AGRUPAMENTO = "AGRUPAMENTO"

TIPOS = {
    PROGRAMA: {"rotulo": "Programa", "categoria": "estrutura", "atributos": ["quantidade_atribuicoes"]},
    ATRIBUICAO: {"rotulo": "Atribuição", "categoria": "comando", "atributos": ["nome"]},
    IDENTIFICADOR: {"rotulo": "Identificador", "categoria": "identificador", "atributos": ["nome", "papel"]},
    NUMERO: {"rotulo": "Número", "categoria": "literal", "atributos": ["valor", "tipo_numero"]},
    TEXTO: {"rotulo": "Texto (string)", "categoria": "literal", "atributos": ["valor", "conteudo"]},
    ADICAO: {"rotulo": "Adição", "categoria": "operacao", "atributos": ["operador"]},
    SUBTRACAO: {"rotulo": "Subtração", "categoria": "operacao", "atributos": ["operador"]},
    MULTIPLICACAO: {"rotulo": "Multiplicação", "categoria": "operacao", "atributos": ["operador"]},
    DIVISAO: {"rotulo": "Divisão", "categoria": "operacao", "atributos": ["operador"]},
    AGRUPAMENTO: {"rotulo": "Agrupamento (parênteses)", "categoria": "agrupamento", "atributos": []},
}

OPERADOR_PARA_TIPO = {"+": ADICAO, "-": SUBTRACAO, "*": MULTIPLICACAO, "/": DIVISAO}


class No:
    __slots__ = ("id", "tipo", "linha", "coluna", "linha_fim", "coluna_fim", "regra", "atributos",
                 "filhos", "profundidade")

    def __init__(self, id_, tipo, inicio, fim, regra, atributos=None, filhos=None):
        self.id = id_
        self.tipo = tipo
        self.linha, self.coluna = inicio
        self.linha_fim, self.coluna_fim = fim
        self.regra = regra
        self.atributos = atributos or {}
        self.filhos = filhos or []
        self.profundidade = 1 + max((f.profundidade for f in self.filhos), default=0)

    @property
    def inicio(self):
        return (self.linha, self.coluna)

    @property
    def fim(self):
        return (self.linha_fim, self.coluna_fim)


def para_dict(raiz: No) -> dict:
    """Serializa a árvore SEM recursão (uma expressão longa gera uma árvore funda)."""
    resultado = {}
    pilha = [(raiz, False)]
    while pilha:
        no, filhos_prontos = pilha.pop()
        if not filhos_prontos:
            pilha.append((no, True))
            pilha.extend((f, False) for f in reversed(no.filhos))
            continue
        resultado[id(no)] = {
            "id": no.id,
            "tipo": no.tipo,
            "rotulo": TIPOS[no.tipo]["rotulo"],
            "linha": no.linha,
            "coluna": no.coluna,
            "linha_fim": no.linha_fim,
            "coluna_fim": no.coluna_fim,
            "regra": no.regra,
            "atributos": dict(no.atributos),
            "filhos": [resultado.pop(id(f)) for f in no.filhos],
        }
    return resultado[id(raiz)]


def contar_nos(raiz: No) -> int:
    total, pilha = 0, [raiz]
    while pilha:
        no = pilha.pop()
        total += 1
        pilha.extend(no.filhos)
    return total
