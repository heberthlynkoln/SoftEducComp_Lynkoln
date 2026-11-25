"""Analisador sintático LL(1) preditivo, dirigido pela tabela M.

Algoritmo (Aho et al., análise preditiva não recursiva):
  pilha = [$, PROGRAMA]; a = primeiro token
  repita:
    X = topo da pilha
    se X é ação semântica: executa (constrói um nó da AST)
    se X é terminal: se X == a, desempilha e avança; senão, ERRO
    se X é não-terminal: se M[X, a] tem produção, troca X pelo lado direito; senão, ERRO
    se X == $ e a == $: ACEITA

Decisões (docs/gramatica.md):
  * D4: sem recuperação de erros: a análise para no PRIMEIRO erro sintático.
  * Os tokens esperados num erro são calculados pela própria tabela M: a partir do
    estado da pilha logo após o último token consumido, testa-se cada terminal e
    guardam-se os que seriam aceitos. Assim, o conjunto é exato (inclui o que as
    produções ε aplicadas antes do erro permitiriam, e não inclui ')' fora de
    parênteses).
  * Se a última linha não termina com quebra de linha, o parser acrescenta uma
    NOVA_LINHA implícita (como o tokenizador do Python), que não aparece na lista
    de tokens do scanner.
"""
import gramatica as G
from arvore import (AGRUPAMENTO, ATRIBUICAO, IDENTIFICADOR, NUMERO, OPERADOR_PARA_TIPO, PROGRAMA,
                    TEXTO, No, contar_nos, para_dict)

LIMITE_PASSOS = 2000            # passos guardados para o "passo a passo" (a análise continua além disso)
LIMITE_PILHA_EXIBIDA = 30       # símbolos do topo mostrados em cada passo
LIMITE_ENTRADA_EXIBIDA = 8      # próximos tokens mostrados em cada passo
LIMITE_ANINHAMENTO = 200        # parênteses aninhados (o CPython usa o mesmo limite)
LIMITE_PROFUNDIDADE_AST = 100   # acima disso a árvore não é enviada (ilegível; e o serializador JSON limita o aninhamento)

OPERANDOS = {"identificador", "numero", "string", "("}
OPERADORES = {"+", "-", "*", "/"}

# Construções que o scanner reconhece mas que estão fora do subconjunto.
_CONTROLE = {"if", "elif", "else", "while", "for", "break", "continue", "pass"}
_FUNCOES = {"def", "class", "return", "lambda", "yield"}
_MODULOS = {"import", "from", "as"}
_VALORES = {"True", "False", "None"}
_LOGICOS = {"and", "or", "not", "is", "in"}


def _fora_do_escopo(tok, anterior):
    """Explicação para um token reconhecido pelo scanner que o subconjunto não aceita."""
    lex, tipo = tok["lexema"], tok["tipo"]
    if tipo == "PALAVRA_RESERVADA":
        if lex in _CONTROLE:
            return ("Estruturas de controle (if, while, for...) não fazem parte do subconjunto "
                    "analisado, que aceita apenas atribuições.")
        if lex in _FUNCOES:
            return "Definição de funções e classes não faz parte do subconjunto analisado."
        if lex in _MODULOS:
            return "O comando import e o uso de módulos não fazem parte do subconjunto analisado."
        if lex in _VALORES:
            return f"O valor especial {lex} não faz parte do subconjunto: use números ou strings."
        if lex in _LOGICOS:
            return f"O operador lógico '{lex}' não faz parte do subconjunto: só há expressões aritméticas."
        return f"O comando '{lex}' não faz parte do subconjunto analisado."
    if tipo == "OPERADOR_RELACIONAL":
        return (f"Comparações como '{lex}' não fazem parte do subconjunto: o parser só aceita "
                "expressões aritméticas com +, -, * e /.")
    if tipo == "OPERADOR_ARITMETICO" and lex not in OPERADORES:
        return f"O operador '{lex}' não faz parte do subconjunto: use apenas +, -, * e /."
    if tipo == "OPERADOR_ATRIBUICAO" and lex != "=":
        nome = anterior["lexema"] if anterior and anterior["tipo"] == "IDENTIFICADOR" else "x"
        return (f"A atribuição composta '{lex}' não faz parte do subconjunto: escreva, por exemplo, "
                f"{nome} = {nome} {lex[:-1]} 1.")
    if tipo == "DELIMITADOR":
        return {
            "[": "Listas ([ ]) não fazem parte do subconjunto analisado.",
            "]": "Listas ([ ]) não fazem parte do subconjunto analisado.",
            "{": "Dicionários e conjuntos ({ }) não fazem parte do subconjunto analisado.",
            "}": "Dicionários e conjuntos ({ }) não fazem parte do subconjunto analisado.",
            ",": "Valores separados por vírgula (tuplas, atribuição múltipla) não fazem parte do subconjunto.",
            ":": "O ':' só aparece em estruturas de bloco (if, while, def...), que estão fora do subconjunto.",
            ";": "Várias atribuições na mesma linha, separadas por ';', não fazem parte do subconjunto: "
                 "use uma atribuição por linha.",
            ".": "Acesso a atributos e métodos (como nome.metodo) não faz parte do subconjunto.",
        }.get(lex)
    return None


def _terminal_de(tok):
    """Terminal da gramática correspondente a um token do scanner."""
    tipo, lex = tok["tipo"], tok["lexema"]
    if tipo == "IDENTIFICADOR":
        return "identificador"
    if tipo in ("LITERAL_INTEIRO", "LITERAL_REAL"):
        return "numero"
    if tipo == "LITERAL_STRING":
        return "string"
    if tipo == "QUEBRA_DE_LINHA":
        return "NOVA_LINHA"
    if lex in G.TERMINAIS:
        return lex
    return "«" + lex + "»"      # token sem terminal na gramática: nunca casa e não tem entrada em M


def _comprimento(texto):
    return len(texto)           # str do Python já conta pontos de código


def _fim_token(tok):
    if tok["tipo"] == "QUEBRA_DE_LINHA" or tok.get("implicito"):
        return (tok["linha"], tok["coluna"])
    return (tok["linha"], tok["coluna"] + _comprimento(tok["lexema"]) - 1)


def _posicao_final_do_codigo(codigo):
    import re
    linhas = re.split(r"\r\n|\r|\n", codigo)
    return len(linhas), _comprimento(linhas[-1]) + 1


def _descrever_token(tok):
    """Descrição usada nas mensagens: "o identificador 'x'", "o fim da linha"..."""
    if tok.get("implicito") or tok["terminal"] == G.FIM:
        return "o fim do código"
    tipo, lex = tok["tipo"], tok["lexema"]
    return {
        "QUEBRA_DE_LINHA": "o fim da linha",
        "IDENTIFICADOR": f"o identificador '{lex}'",
        "LITERAL_INTEIRO": f"o número '{lex}'",
        "LITERAL_REAL": f"o número '{lex}'",
        "LITERAL_STRING": f"a string {lex}",
        "PALAVRA_RESERVADA": f"a palavra reservada '{lex}'",
        "DELIMITADOR": f"o símbolo '{lex}'",
    }.get(tipo, f"o operador '{lex}'")


def _encontrado_curto(tok):
    if tok.get("implicito") or tok["terminal"] == G.FIM:
        return "fim do código"
    if tok["tipo"] == "QUEBRA_DE_LINHA":
        return "fim da linha"
    return tok["lexema"]


def _juntar(itens):
    itens = list(itens)
    if len(itens) <= 1:
        return "".join(itens)
    return ", ".join(itens[:-1]) + " ou " + itens[-1]


def _nome_simbolo(s):
    if G.eh_acao(s):
        return "{" + s[1:] + "}"
    return s


class _ErroSintatico(Exception):
    def __init__(self, dados):
        super().__init__(dados["mensagem"])
        self.dados = dados


class Parser:
    def __init__(self, tokens_lexicos, codigo):
        self.tabela = G.construir_tabela()
        self.codigo = codigo
        self.entrada = []
        for i, t in enumerate(tokens_lexicos):
            self.entrada.append({**t, "terminal": _terminal_de(t), "indice": i})
        linha_fim, coluna_fim = _posicao_final_do_codigo(codigo)
        if self.entrada and self.entrada[-1]["terminal"] != "NOVA_LINHA":
            ultimo = self.entrada[-1]
            l, c = _fim_token(ultimo)
            self.entrada.append({"tipo": "QUEBRA_DE_LINHA", "lexema": "", "linha": l, "coluna": c + 1,
                                 "terminal": "NOVA_LINHA", "implicito": True, "indice": None})
        self.entrada.append({"tipo": "FIM", "lexema": "", "linha": linha_fim, "coluna": coluna_fim,
                             "terminal": G.FIM, "indice": None})
        self.pos = 0
        self.pilha = [(G.FIM, None), (G.SIMBOLO_INICIAL, None)]   # (símbolo, produção que o empilhou)
        self.valores = []          # pilha semântica: ("no", No) ou ("tok", token)
        self.ultimo = None         # último token consumido
        self.instantaneo = list(self.pilha)
        self.passos = []
        self.total_passos = 0
        self.contador_nos = 0
        self.aninhamento = 0

    # ------------------------------------------------------------ registro
    def _registrar(self, tipo, acao, **extra):
        self.total_passos += 1
        if len(self.passos) >= LIMITE_PASSOS:
            return
        simbolos = [_nome_simbolo(s) for s, _ in self.pilha]
        if len(simbolos) > LIMITE_PILHA_EXIBIDA:
            simbolos = [f"… (+{len(simbolos) - LIMITE_PILHA_EXIBIDA})"] + simbolos[-LIMITE_PILHA_EXIBIDA:]
        restante = self.entrada[self.pos:self.pos + LIMITE_ENTRADA_EXIBIDA]
        entrada = [G.FIM if t["terminal"] == G.FIM else (
            "NOVA_LINHA" if t["terminal"] == "NOVA_LINHA" else t["lexema"]) for t in restante]
        if len(self.entrada) - self.pos > LIMITE_ENTRADA_EXIBIDA:
            entrada.append("…")
        passo = {"numero": self.total_passos, "tipo": tipo, "pilha": simbolos, "entrada": entrada,
                 "acao": acao, "producao": None, "celula": None, "token": None, "no_criado": None}
        passo.update(extra)
        self.passos.append(passo)

    # ------------------------------------------------------------ AST
    def _novo_no(self, tipo, inicio, fim, regra, atributos=None, filhos=None):
        self.contador_nos += 1
        return No(f"n{self.contador_nos}", tipo, inicio, fim, regra, atributos, filhos)

    def _pop_no(self):
        return self.valores.pop()[1]

    def _executar_acao(self, acao):
        t = self.ultimo
        no = None
        if acao == "@alvo":
            no = self._novo_no(IDENTIFICADOR, (t["linha"], t["coluna"]), _fim_token(t),
                               G.texto_producao(3), {"nome": t["lexema"], "papel": "alvo"})
        elif acao == "@id":
            no = self._novo_no(IDENTIFICADOR, (t["linha"], t["coluna"]), _fim_token(t),
                               G.texto_producao(12), {"nome": t["lexema"], "papel": "uso"})
        elif acao == "@num":
            no = self._novo_no(NUMERO, (t["linha"], t["coluna"]), _fim_token(t), G.texto_producao(13),
                               {"valor": t["lexema"],
                                "tipo_numero": "real" if t["tipo"] == "LITERAL_REAL" else "inteiro"})
        elif acao == "@str":
            no = self._novo_no(TEXTO, (t["linha"], t["coluna"]), _fim_token(t), G.texto_producao(14),
                               {"valor": t["lexema"], "conteudo": t["lexema"][1:-1]})
        elif acao in ("@op", "@abre"):
            self.valores.append(("tok", t))
            if acao == "@abre":
                self.aninhamento += 1
                if self.aninhamento > LIMITE_ANINHAMENTO:
                    self._erro_aninhamento(t)
            return None
        elif acao == "@bin":
            direita = self._pop_no()
            op = self.valores.pop()[1]
            esquerda = self._pop_no()
            prod = {"+": 5, "-": 6, "*": 9, "/": 10}[op["lexema"]]
            no = self._novo_no(OPERADOR_PARA_TIPO[op["lexema"]], esquerda.inicio, direita.fim,
                               G.texto_producao(prod), {"operador": op["lexema"]}, [esquerda, direita])
        elif acao == "@agrupa":
            expr = self._pop_no()
            abre = self.valores.pop()[1]
            self.aninhamento -= 1
            no = self._novo_no(AGRUPAMENTO, (abre["linha"], abre["coluna"]), _fim_token(t),
                               G.texto_producao(15), {}, [expr])
        elif acao == "@atrib":
            expr = self._pop_no()
            alvo = self._pop_no()
            no = self._novo_no(ATRIBUICAO, alvo.inicio, expr.fim, G.texto_producao(3),
                               {"nome": alvo.atributos["nome"]}, [alvo, expr])
        self.valores.append(("no", no))
        return no

    # ------------------------------------------------------------ esperados
    def _aceita(self, terminal):
        """Simula, a partir da pilha logo após o último token consumido, se `terminal` seria aceito."""
        pilha = [s for s, _ in self.instantaneo]
        while pilha:
            x = pilha.pop()
            if G.eh_acao(x):
                continue
            if x == G.FIM:
                return terminal == G.FIM
            if G.eh_terminal(x):
                return x == terminal
            p = self.tabela[x].get(terminal)
            if p is None:
                return False
            pilha.extend(reversed(G.PRODUCOES[p][1]))
        return False

    def _esperados(self):
        return [t for t in G.TERMINAIS if self._aceita(t)]

    # ------------------------------------------------------------ erros
    def _parenteses_abertos(self):
        return [v[1] for v in self.valores if v[0] == "tok" and v[1]["lexema"] == "("]

    def _erro_aninhamento(self, tok):
        dados = self._base_erro(tok, [], None, None)
        dados["mensagem"] = (f"Erro sintático na linha {tok['linha']}, coluna {tok['coluna']}: há mais de "
                             f"{LIMITE_ANINHAMENTO} parênteses aninhados.")
        dados["explicacao"] = (f"O analisador aceita no máximo {LIMITE_ANINHAMENTO} níveis de parênteses "
                               "aninhados (o mesmo limite do interpretador Python). Simplifique a expressão.")
        raise _ErroSintatico(dados)

    def _base_erro(self, tok, esperados, regra, celula):
        return {
            "tipo": "ERRO_SINTATICO",
            "linha": tok["linha"],
            "coluna": tok["coluna"],
            "linha_fim": _fim_token(tok)[0],
            "coluna_fim": _fim_token(tok)[1],
            "encontrado": _encontrado_curto(tok),
            "encontrado_tipo": "FIM" if tok.get("implicito") or tok["terminal"] == G.FIM else tok["tipo"],
            "esperado": [G.TERMINAIS[t].strip("'") for t in esperados],
            "esperados_terminais": esperados,
            "regra": regra,
            "celula_tabela": celula,
            "token": tok["indice"],
        }

    def _erro(self, x, origem):
        tok = self.entrada[self.pos]
        esperados = self._esperados()
        a = tok["terminal"]
        if G.eh_terminal(x) or x == G.FIM:
            regra = G.texto_producao(origem) if origem is not None else None
            celula = None
            nome_x = x if x in ("NOVA_LINHA", G.FIM) else G.TERMINAIS[x]
            motivo_tabela = (f"O topo da pilha era o terminal {nome_x}"
                             + (f", vindo da regra {regra}," if regra else "")
                             + " e ele precisa ser igual ao próximo token da entrada.")
        else:
            regra = G.texto_alternativas(x)
            simbolo_col = a if a in G.TERMINAIS else tok["lexema"]
            celula = {"nao_terminal": x, "terminal": simbolo_col}
            motivo_tabela = (f"Na tabela M, a célula M[{x}, {simbolo_col}] está vazia: nenhuma alternativa "
                             f"de {x} pode começar com {G.TERMINAIS.get(a, repr(tok['lexema']))}.")
        dados = self._base_erro(tok, esperados, regra, celula)

        lista = _juntar(G.TERMINAIS[t] for t in esperados) or "nada"
        desc = _descrever_token(tok)
        fim_cod = tok.get("implicito") or a == G.FIM
        if fim_cod:
            dados["mensagem"] = (f"Erro sintático na linha {tok['linha']}, coluna {tok['coluna']}: o código "
                                 f"terminou antes de a construção ser concluída; era esperado {lista}.")
        else:
            dados["mensagem"] = (f"Erro sintático na linha {tok['linha']}, coluna {tok['coluna']}: era "
                                 f"esperado {lista}, mas o parser encontrou {desc}.")
        contexto = self._contexto(tok, set(esperados))
        escopo = _fora_do_escopo(tok, self.ultimo)
        partes = [contexto] if contexto else []
        if escopo and (not contexto or "subconjunto" not in contexto):
            partes.append(escopo)
        partes.append(motivo_tabela)
        dados["explicacao"] = " ".join(partes)
        return _ErroSintatico(dados)

    def _contexto(self, tok, esperados):
        """Frase didática que explica o erro a partir do que vinha antes e do que foi encontrado."""
        ant = self.ultimo
        a = tok["terminal"]
        ant_t = ant["terminal"] if ant else None
        ant_lex = ant["lexema"] if ant else ""
        fim_linha = a == "NOVA_LINHA" and not tok.get("implicito")
        fim_cod = tok.get("implicito") or a == G.FIM
        prox = self.entrada[self.pos + 1] if self.pos + 1 < len(self.entrada) else None

        if esperados == OPERANDOS:
            if ant_t == "=":
                frase = "Depois do '=' deve vir a expressão cujo valor será atribuído à variável"
            elif ant_t in OPERADORES:
                frase = f"O operador '{ant_lex}' precisa de um operando à direita"
            elif ant_t == "(":
                frase = "Depois de '(' deve vir uma expressão: parênteses vazios não são permitidos"
            else:
                frase = "Neste ponto deve começar uma expressão"
            if fim_cod:
                frase += ", mas o código terminou."
            elif fim_linha:
                frase += ", mas a linha terminou."
            elif a in OPERADORES and ant_t == "=" and a == "-":
                frase += (". O sinal negativo unário (como em -5) não faz parte do subconjunto: "
                          "escreva 0 - 5.")
            elif a in OPERADORES and ant_t in OPERADORES:
                frase += f": dois operadores seguidos ('{ant_lex}' e '{tok['lexema']}') não formam uma expressão."
            elif a in OPERADORES:
                frase += f", mas foi encontrado o operador '{tok['lexema']}', que não pode iniciar uma expressão."
            else:
                frase += "."
            return frase + " Uma expressão começa por um identificador, um número, uma string ou '('."

        if esperados == {"="}:
            frase = f"Depois do nome '{ant_lex}', no início da linha, deve vir o sinal '=' da atribuição"
            if fim_linha or fim_cod:
                return frase + ": uma linha com apenas um nome não é uma atribuição."
            if a == "(":
                return frase + ". Chamadas de função, como nome(...), não fazem parte do subconjunto."
            if tok["tipo"] == "OPERADOR_ATRIBUICAO":
                return None          # atribuição composta: explicada por _fora_do_escopo
            if a in OPERANDOS:
                return frase + ": faltou o '=' entre o nome da variável e o valor."
            return frase + "."

        if OPERADORES <= esperados:
            abertos = self._parenteses_abertos()
            if a == "(" and ant_t == "identificador":
                return (f"Depois de '{ant_lex}' foi aberto um parêntese, como numa chamada de função. "
                        "Chamadas de função, como nome(...), não fazem parte do subconjunto.")
            if a in OPERANDOS:
                return (f"A expressão já estava completa em '{ant_lex}' e veio {_descrever_token(tok)}: "
                        "faltou um operador (+, -, * ou /) entre os dois.")
            if a == ")" and ")" not in esperados:
                return "Há um ')' sem o '(' correspondente: confira se os parênteses estão balanceados."
            if (fim_linha or fim_cod) and ")" in esperados and abertos:
                p = abertos[-1]
                onde = "o código terminou" if fim_cod else "a linha terminou"
                return (f"O parêntese aberto na linha {p['linha']}, coluna {p['coluna']} não foi fechado: "
                        f"{onde} antes do ')'. Cada '(' precisa de um ')' correspondente na mesma linha.")
            if a == "=":
                return ("O sinal '=' só pode aparecer uma vez, logo depois do nome da variável. "
                        "Atribuições encadeadas (x = y = 1) não fazem parte do subconjunto.")
            return None

        if esperados == {"identificador", G.FIM}:
            if tok["tipo"] == "PALAVRA_RESERVADA" and prox and prox["terminal"] == "=":
                return (f"'{tok['lexema']}' é uma palavra reservada do Python e não pode ser usada como "
                        "nome de variável.")
            if tok["tipo"] == "PALAVRA_RESERVADA":
                return None          # explicado por _fora_do_escopo (if, while, def...)
            if a == "=":
                return "A linha começou com '=': faltou o nome da variável que receberá o valor."
            if a in OPERANDOS or a in OPERADORES:
                return ("Cada linha deve ser uma atribuição, que começa pelo nome de uma variável "
                        "(identificador), como em x = 5.")
            return "Cada linha deve ser uma atribuição no formato identificador = expressão."
        return None

    # ------------------------------------------------------------ laço principal
    def analisar(self):
        self._registrar("inicio", "Início: a pilha contém $ e o símbolo inicial PROGRAMA.")
        while True:
            x, origem = self.pilha[-1]
            tok = self.entrada[self.pos]
            a = tok["terminal"]
            if G.eh_acao(x):
                self.pilha.pop()
                no = self._executar_acao(x)
                self._registrar("acao", f"Ação {_nome_simbolo(x)}: {G.ACOES[x]}"
                                + (f" ({no.tipo})." if no else "."), no_criado=no.id if no else None)
                continue
            if x == G.FIM and a == G.FIM:
                self._registrar("aceitar", "Topo $ e entrada $: a entrada foi aceita.")
                break
            if G.eh_terminal(x) or x == G.FIM:
                if x != a:
                    raise self._erro(x, origem)
                self.pilha.pop()
                self.ultimo = tok
                self.pos += 1
                self.instantaneo = list(self.pilha)
                lexema = "fim da linha" if a == "NOVA_LINHA" else tok["lexema"]
                self._registrar("casar", f"Casa o terminal {G.TERMINAIS[a]} com '{lexema}' e avança na entrada."
                                if a != "NOVA_LINHA" else "Casa NOVA_LINHA com o fim da linha e avança.",
                                token=tok["indice"])
                continue
            p = self.tabela[x].get(a)
            if p is None:
                raise self._erro(x, origem)
            self.pilha.pop()
            for s in reversed(G.PRODUCOES[p][1]):
                self.pilha.append((s, p))
            self._registrar("expandir", f"M[{x}, {a}] = {p + 1}: aplica {G.texto_producao(p)}.",
                            producao=p + 1, celula={"nao_terminal": x, "terminal": a})

        filhos = [v[1] for v in self.valores]
        if filhos:      # o programa vai do início da primeira atribuição ao fim da última
            inicio, fim = filhos[0].inicio, filhos[-1].fim
        else:           # programa vazio (só comentários): a posição é o início do código
            inicio = fim = (1, 1)
        raiz = self._novo_no(PROGRAMA, inicio, fim,
                             G.texto_producao(0) + "; " + G.texto_alternativas("LISTA_ATRIB"),
                             {"quantidade_atribuicoes": len(filhos)}, filhos)
        return raiz


def analisar_sintatico(tokens_lexicos, codigo):
    """Executa o parser sobre os tokens do scanner. Nunca lança exceção para entradas inválidas."""
    parser = Parser(tokens_lexicos, codigo)
    resultado = {"executado": True, "sucesso": False, "ast": None, "arvore_parcial": [], "erros": [],
                 "avisos": [], "estatisticas": None, "passos": parser.passos, "passos_truncados": False}
    try:
        raiz = parser.analisar()
    except _ErroSintatico as e:
        parser._registrar("erro", e.dados["mensagem"])
        resultado["erros"].append(e.dados)
        # Subárvores já construídas antes do erro (atribuições completas e partes da expressão atual).
        parciais = [v[1] for v in parser.valores if v[0] == "no"]
        if all(n.profundidade <= LIMITE_PROFUNDIDADE_AST for n in parciais):
            resultado["arvore_parcial"] = [para_dict(n) for n in parciais]
    else:
        resultado["sucesso"] = True
        resultado["estatisticas"] = {"nos": contar_nos(raiz), "profundidade": raiz.profundidade}
        if raiz.profundidade > LIMITE_PROFUNDIDADE_AST:
            resultado["avisos"].append(
                f"O programa é sintaticamente válido, mas a árvore tem {raiz.profundidade} níveis "
                f"(limite de exibição: {LIMITE_PROFUNDIDADE_AST}) e não foi enviada. Divida a expressão "
                "em atribuições menores para visualizá-la.")
        else:
            resultado["ast"] = para_dict(raiz)
    resultado["passos_truncados"] = parser.total_passos > len(parser.passos)
    resultado["total_passos"] = parser.total_passos
    return resultado
