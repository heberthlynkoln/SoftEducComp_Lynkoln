"""Parser LL(1) e AST: construções válidas, precedência, associatividade, posições e erros.

As ASTs esperadas foram escritas à mão a partir da gramática (docs/gramatica.md), em
notação compacta: (TIPO filho filho...), com folhas como x, 5 ou "texto". Elas NÃO
foram geradas a partir da saída do parser.
Casos CT-xx: docs/etapa4/casos-de-teste.md.
"""
import pytest

from parser import LIMITE_ANINHAMENTO, LIMITE_PASSOS, LIMITE_PROFUNDIDADE_AST, analisar_sintatico
from scanner import analisar_lexico

ABREV = {"ADICAO": "+", "SUBTRACAO": "-", "MULTIPLICACAO": "*", "DIVISAO": "/", "AGRUPAMENTO": "()",
         "ATRIBUICAO": "=", "PROGRAMA": "PROGRAMA"}


def sint(codigo):
    lex = analisar_lexico(codigo)
    assert lex["sucesso"], lex["erros"]
    return analisar_sintatico(lex["tokens"], codigo)


def compacta(no):
    t = no["tipo"]
    if t == "IDENTIFICADOR":
        return no["atributos"]["nome"]
    if t in ("NUMERO", "TEXTO"):
        return no["atributos"]["valor"]
    return "(" + " ".join([ABREV[t]] + [compacta(f) for f in no["filhos"]]) + ")"


def arvore(codigo):
    r = sint(codigo)
    assert r["sucesso"], r["erros"]
    return compacta(r["ast"])


def erro(codigo):
    r = sint(codigo)
    assert r["sucesso"] is False and r["ast"] is None
    assert len(r["erros"]) == 1            # D4: só o primeiro erro
    return r["erros"][0]


# ------------------------------------------------------------ válidos
@pytest.mark.parametrize("ct,codigo,esperada", [
    ("CT-01", "x = 5", "(PROGRAMA (= x 5))"),
    ("CT-02", "resultado = 10 + 5", "(PROGRAMA (= resultado (+ 10 5)))"),
    ("CT-03", "r = 2 + 3 * 4", "(PROGRAMA (= r (+ 2 (* 3 4))))"),
    ("CT-04", "r = (2 + 3) * 4", "(PROGRAMA (= r (* (() (+ 2 3)) 4)))"),
    ("CT-05", "preco = 10\nqtd = 3\ntotal = preco * (qtd + 1)\n",
     "(PROGRAMA (= preco 10) (= qtd 3) (= total (* preco (() (+ qtd 1)))))"),
    ("CT-06", 'msg = "Olá, mundo"', '(PROGRAMA (= msg "Olá, mundo"))'),
    ("CT-07", "preço_2 = _x", "(PROGRAMA (= preço_2 _x))"),
    ("CT-25", "x = 1", "(PROGRAMA (= x 1))"),
    ("CT-26", "r = ((((1))))", "(PROGRAMA (= r (() (() (() (() 1))))))"),
])
def test_casos_validos(ct, codigo, esperada):
    assert arvore(codigo) == esperada, ct


@pytest.mark.parametrize("codigo,esperada", [
    ("r = 10 + 5 * 2", "(+ 10 (* 5 2))"),             # * antes de +
    ("r = 10 * 5 + 2", "(+ (* 10 5) 2)"),
    ("r = 20 - 5 - 3", "(- (- 20 5) 3)"),             # associatividade à esquerda
    ("r = 100 / 10 / 2", "(/ (/ 100 10) 2)"),
    ("r = 8 / 4 * 2", "(* (/ 8 4) 2)"),
    ("r = 1 + 2 - 3 + 4", "(+ (- (+ 1 2) 3) 4)"),
    ("r = (10 + 5) * 2", "(* (() (+ 10 5)) 2)"),       # parênteses mudam a organização
    ("r = 2 * (3 + 4) * 5", "(* (* 2 (() (+ 3 4))) 5)"),
    ("r = a - (b - c)", "(- a (() (- b c)))"),
    ("r = 1 + 2 * 3 - 4 / 2", "(- (+ 1 (* 2 3)) (/ 4 2))"),
    ('s = "Olá, " + nome', '(+ "Olá, " nome)'),
    ("x = 3.14 * r", "(* 3.14 r)"),
])
def test_precedencia_e_associatividade(codigo, esperada):
    assert arvore(codigo) == f"(PROGRAMA (= r {esperada}))".replace("(= r", "(= " + codigo.split()[0])


def test_comentarios_e_linhas_em_branco_sao_ignorados():
    assert arvore("# início\n\nx = 1  # um\n\n# fim\ny = x\n") == "(PROGRAMA (= x 1) (= y x))"


def test_ct22_programa_so_com_comentario_e_valido_e_vazio():
    r = sint("# comentário")
    assert r["sucesso"] and r["ast"]["filhos"] == [] and r["ast"]["atributos"]["quantidade_atribuicoes"] == 0


def test_crlf_e_cr():
    assert arvore("a = 1\r\nb = 2\r\n") == arvore("a = 1\rb = 2\r") == "(PROGRAMA (= a 1) (= b 2))"


# ------------------------------------------------------------ estrutura dos nós
def test_formato_e_atributos_dos_nos():
    ast = sint('x = y + 2.5 * "a"\n')["ast"]
    campos = {"id", "tipo", "rotulo", "linha", "coluna", "linha_fim", "coluna_fim", "regra", "atributos", "filhos"}
    pilha, ids = [ast], set()
    while pilha:
        no = pilha.pop()
        assert set(no) == campos
        assert no["id"] not in ids
        ids.add(no["id"])
        pilha.extend(no["filhos"])
    atrib = ast["filhos"][0]
    alvo, soma = atrib["filhos"]
    assert atrib["atributos"] == {"nome": "x"}
    assert alvo["atributos"] == {"nome": "x", "papel": "alvo"}
    assert soma["filhos"][0]["atributos"] == {"nome": "y", "papel": "uso"}
    mult = soma["filhos"][1]
    assert mult["filhos"][0]["atributos"] == {"valor": "2.5", "tipo_numero": "real"}
    assert mult["filhos"][1]["atributos"] == {"valor": '"a"', "conteudo": "a"}
    assert soma["regra"] == "EXPR' → + TERMO EXPR'"
    assert mult["regra"] == "TERMO' → * FATOR TERMO'"
    assert alvo["regra"] == atrib["regra"] == "ATRIB → identificador = EXPR NOVA_LINHA"


def test_posicoes_dos_nos():
    # linha 2: t=1 ... l=5, '='=7, '('=9, x=10, '+'=12, 10=14-15, ')'=16, '*'=18, y=20
    codigo = "a = 1\ntotal = (x + 10) * y\n"
    ast = sint(codigo)["ast"]
    a2 = ast["filhos"][1]
    pos = lambda n: (n["linha"], n["coluna"], n["linha_fim"], n["coluna_fim"])  # noqa: E731
    assert pos(a2) == (2, 1, 2, 20)
    alvo, mult = a2["filhos"]
    assert pos(alvo) == (2, 1, 2, 5)
    assert pos(mult) == (2, 9, 2, 20)
    grupo, y = mult["filhos"]
    assert pos(grupo) == (2, 9, 2, 16)
    assert pos(grupo["filhos"][0]) == (2, 10, 2, 15)
    assert pos(grupo["filhos"][0]["filhos"][1]) == (2, 14, 2, 15)
    assert pos(y) == (2, 20, 2, 20)


def test_posicoes_dos_nos_coincidem_com_os_tokens():
    """Cada folha começa exatamente onde o scanner localizou o token correspondente (C9)."""
    codigo = 'preco = 10\nnome = "Olá, João"\ntotal = preco * (qtd + 1)\n'
    lex = analisar_lexico(codigo)
    posicoes = {(t["linha"], t["coluna"]): t["lexema"] for t in lex["tokens"]}
    pilha = [analisar_sintatico(lex["tokens"], codigo)["ast"]]
    folhas = 0
    while pilha:
        no = pilha.pop()
        pilha.extend(no["filhos"])
        if no["tipo"] in ("IDENTIFICADOR", "NUMERO", "TEXTO"):
            folhas += 1
            lexema = no["atributos"].get("nome") or no["atributos"]["valor"]
            assert posicoes[(no["linha"], no["coluna"])] == lexema
            assert no["coluna_fim"] - no["coluna"] + 1 == len(lexema)
    assert folhas == 8   # preco 10 nome "Olá, João" total preco qtd 1


# ------------------------------------------------------------ erros sintáticos
def campos(e):
    return (e["linha"], e["coluna"], e["encontrado"], e["esperado"])


OPERANDO = ["identificador", "número", "string", "("]


@pytest.mark.parametrize("ct,codigo,linha,coluna,encontrado,esperado", [
    ("CT-11", "x 5", 1, 3, "5", ["="]),
    ("CT-12", "x = 5 +", 1, 8, "fim do código", OPERANDO),
    ("CT-13", "x = (2 + 3", 1, 11, "fim do código", ["+", "-", "*", "/", ")"]),
    ("CT-15", "x =\n", 1, 4, "fim da linha", OPERANDO),
    ("CT-16", "x = 1 + * 2", 1, 9, "*", OPERANDO),
    ("CT-17", "if = 5", 1, 1, "if", ["identificador", "fim do código"]),
    ("CT-18", "x = 5 +\ny = 2", 1, 8, "fim da linha", OPERANDO),
    ("CT-19", "if x > 3:\n    y = 1\n", 1, 1, "if", ["identificador", "fim do código"]),
])
def test_casos_de_erro_sintatico(ct, codigo, linha, coluna, encontrado, esperado):
    assert campos(erro(codigo)) == (linha, coluna, encontrado, esperado), ct


def test_ct17_explica_palavra_reservada_como_nome():
    e = erro("if = 5")
    assert "palavra reservada" in e["explicacao"] and "nome de variável" in e["explicacao"]


def test_ct19_explica_estrutura_fora_do_subconjunto():
    assert "Estruturas de controle" in erro("if x > 3:\n    y = 1\n")["explicacao"]


def test_ct18_para_no_primeiro_erro_e_nao_analisa_a_linha_2():
    r = sint("x = 5 +\ny = 2\n")
    assert [e["linha"] for e in r["erros"]] == [1]


def test_mensagem_segue_o_formato_didatico():
    e = erro("x 5")
    assert e["mensagem"] == ("Erro sintático na linha 1, coluna 3: era esperado '=', mas o parser "
                             "encontrou o número '5'.")
    assert "faltou o '='" in e["explicacao"]
    assert e["regra"] == "ATRIB → identificador = EXPR NOVA_LINHA"
    assert e["celula_tabela"] is None              # erro ao casar terminal, não célula vazia


def test_erro_em_celula_vazia_aponta_a_celula():
    e = erro("x = 1 + * 2")
    assert e["celula_tabela"] == {"nao_terminal": "TERMO", "terminal": "*"}
    assert "M[TERMO, *]" in e["explicacao"]
    assert e["regra"] == "TERMO → FATOR TERMO'"
    assert "dois operadores seguidos" in e["explicacao"]


def test_parentese_nao_fechado_indica_onde_foi_aberto():
    e = erro("total = preco * (qtd + 1\n")
    assert (e["linha"], e["coluna"], e["encontrado"]) == (1, 25, "fim da linha")
    assert ")" in e["esperado"]
    assert "linha 1, coluna 17" in e["explicacao"]


def test_parentese_sobrando():
    e = erro("x = (1))")
    assert (e["coluna"], e["encontrado"]) == (8, ")")
    assert ")" not in e["esperado"]                # fora de parênteses, ')' não é esperado
    assert "sem o '('" in e["explicacao"]


def test_esperados_fora_de_parenteses_nao_incluem_fecha_parentese():
    assert erro("x = 1 2")["esperado"] == ["+", "-", "*", "/", "fim da linha"]


@pytest.mark.parametrize("codigo,trecho", [
    ("x = 1 2", "faltou um operador"),
    ("x = -5", "negativo unário"),
    ("x = 2 ** 3", "'**' não faz parte"),
    ("x += 1", "atribuição composta"),
    ("print(x)", "Chamadas de função"),
    ("x = f(2)", "Chamadas de função"),
    ("x = y = 1", "encadeadas"),
    ("= 5", "faltou o nome da variável"),
    ("5 = x", "começa pelo nome de uma variável"),
    ("x = True", "True"),
    ("x = [1]", "Listas"),
    ("a = 1; b = 2", "';'"),
    ("x = a > b", "Comparações"),
    ("x = ()", "parênteses vazios"),
    ("x\n", "apenas um nome"),
    ("def f(x):\n", "funções"),
    ("import os\n", "import"),
    ("x = a.b", "atributos"),
    ("x = 1, 2", "vírgula"),
])
def test_combinacoes_invalidas_tem_explicacao_especifica(codigo, trecho):
    assert trecho in erro(codigo)["explicacao"]


def test_erro_nao_expoe_detalhes_internos():
    e = erro("x = 1 + * 2")
    texto = e["mensagem"] + e["explicacao"]
    for proibido in ("Traceback", "Exception", ".py", "self", "_Erro"):
        assert proibido not in texto


def test_indice_do_token_do_erro_aponta_para_o_scanner():
    codigo = "x = 1 + * 2"
    lex = analisar_lexico(codigo)
    e = analisar_sintatico(lex["tokens"], codigo)["erros"][0]
    tok = lex["tokens"][e["token"]]
    assert (tok["lexema"], tok["linha"], tok["coluna"]) == ("*", e["linha"], e["coluna"])


# ------------------------------------------------------------ passo a passo
def test_passo_a_passo_registra_pilha_entrada_e_acao():
    r = sint("x = 1")
    passos = r["passos"]
    assert passos[0]["tipo"] == "inicio" and passos[0]["pilha"] == ["$", "PROGRAMA"]
    assert passos[-1]["tipo"] == "aceitar"
    tipos = {p["tipo"] for p in passos}
    assert {"expandir", "casar", "acao"} <= tipos
    exp = next(p for p in passos if p["tipo"] == "expandir")
    assert exp["celula"] == {"nao_terminal": "PROGRAMA", "terminal": "identificador"}
    assert exp["producao"] == 1
    # cada nó da AST tem um passo em que foi criado
    criados = [p["no_criado"] for p in passos if p["no_criado"]]
    assert len(criados) == r["estatisticas"]["nos"] - 1      # PROGRAMA é montado no final
    assert r["passos_truncados"] is False


def test_arvore_parcial_mostra_o_que_foi_reconhecido_antes_do_erro():
    r = sint("a = 1\nb = 2 * (3 +\n")
    assert [compacta(n) for n in r["arvore_parcial"]] == ["(= a 1)", "b", "2", "3"]
    assert sint("x = 1")["arvore_parcial"] == []


def test_passo_a_passo_termina_em_erro():
    passos = sint("x = 5 +")["passos"]
    assert passos[-1]["tipo"] == "erro"


def test_passos_limitados_em_programas_grandes():
    r = sint("x = 1 + 2\n" * 400)
    assert r["sucesso"] and r["passos_truncados"] and len(r["passos"]) == LIMITE_PASSOS
    assert r["total_passos"] > LIMITE_PASSOS


# ------------------------------------------------------------ limites e bordas
def test_aninhamento_acima_do_limite_e_erro_claro():
    n = LIMITE_ANINHAMENTO + 1
    e = erro("x = " + "(" * n + "1" + ")" * n)
    assert f"mais de {LIMITE_ANINHAMENTO} parênteses" in e["mensagem"]


def test_arvore_muito_funda_e_valida_mas_nao_e_enviada():
    r = sint("x = " + "1 + " * (LIMITE_PROFUNDIDADE_AST + 5) + "1")
    assert r["sucesso"] is True and r["ast"] is None
    assert r["avisos"] and "não foi enviada" in r["avisos"][0]


def test_expressao_longa_nao_estoura_recursao():
    r = sint("linha = " + "1 + " * 5000 + "1")
    assert r["sucesso"] is True


def test_varias_atribuicoes_em_sequencia():
    r = sint("".join(f"v{i} = {i} * (v{i} + 1)\n" for i in range(300)))
    assert r["sucesso"] and r["ast"]["atributos"]["quantidade_atribuicoes"] == 300
