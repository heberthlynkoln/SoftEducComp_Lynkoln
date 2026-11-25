# Visualizador de Análise Sintática com Explicação de Erros

Software educacional para o ensino de **análise sintática** na disciplina de Compiladores. A ferramenta, em formato de aplicação web, analisa atribuições escritas em Python, mostra os tokens, a **árvore sintática abstrata (AST)** e o **passo a passo do parser LL(1)** com a tabela M, e, quando o código está errado, explica **onde e por que o parser falha**, indicando os tokens esperados naquele ponto e a regra gramatical envolvida.

> **Status:** Etapa 4 do roteiro — análise sintática e AST. O botão **Analisar** envia o código ao backend, que executa a análise léxica (scanner) e, se não houver erro léxico, a análise sintática (parser LL(1) próprio), devolvendo tokens, AST e erros. A interface mostra os erros separados por fase, o código com os tokens destacados, a AST navegável (com destaque do trecho de cada nó), a tabela de tokens, o passo a passo e a tabela M. A análise semântica será feita na Etapa 5.

- **Autor(a):** [seu nome]
- **Disciplina:** Compiladores — [instituição]
- **Professor:** [nome do professor] (GitHub: `rocha3runo`)

## Linguagem escolhida e subconjunto

**Linguagem analisada:** Python.

**Motivo:** versatilidade, sintaxe simples e legível e escassez, nos trabalhos estudados, de ferramentas educacionais de análise sintática voltadas a essa linguagem.

**Subconjunto inicial:** comandos de **atribuição** no formato `identificador = expressão`, em que a expressão pode conter identificadores, números, textos (strings), os operadores `+`, `-`, `*`, `/` e parênteses.

Exemplos aceitos:

```python
x = 5
total = preco * (qtd + 1)
nome = "Ana"
```

**Fora do escopo:** estruturas de controle (`if`, `while`, `for`), funções e classes, listas e dicionários, comandos `import` e qualquer biblioteca. Como não há blocos, a indentação não é tratada. A ampliação do subconjunto fica como trabalho futuro.

Também ficam fora: comparações, o sinal negativo unário (`-5`; use `0 - 5`), chamadas de função, atribuição encadeada e várias atribuições na mesma linha. O scanner reconhece essas construções como tokens, e o parser as recusa explicando por quê.

**Gramática (LL(1)):**

```
PROGRAMA    → LISTA_ATRIB
LISTA_ATRIB → ATRIB LISTA_ATRIB | ε
ATRIB       → identificador = EXPR NOVA_LINHA
EXPR        → TERMO EXPR'
EXPR'       → + TERMO EXPR' | - TERMO EXPR' | ε
TERMO       → FATOR TERMO'
TERMO'      → * FATOR TERMO' | / FATOR TERMO' | ε
FATOR       → identificador | numero | string | ( EXPR )
```

`*` e `/` têm precedência sobre `+` e `-`; todos associam à esquerda (`20 - 5 - 3` = `(20 - 5) - 3`). Símbolo inicial, terminais, correspondência com os tokens do scanner, FIRST, FOLLOW, tabela M e exemplos válidos e inválidos: **[docs/gramatica.md](docs/gramatica.md)**.

## Análise léxica e sintática

| Fase | Como funciona | Documentação |
|---|---|---|
| Léxica | Scanner próprio (`re` e `keyword`): tokens com tipo, lexema, linha e coluna; erros léxicos posicionados, todos relatados | [docs/ANALISE-LEXICA.md](docs/ANALISE-LEXICA.md) |
| Sintática | **Parser LL(1) preditivo próprio**, com pilha e tabela M calculadas a partir das produções; ações semânticas constroem a AST | [docs/ANALISE-SINTATICA.md](docs/ANALISE-SINTATICA.md) |

Decisões principais (justificadas em `docs/ANALISE-SINTATICA.md`):

- **D1:** se houver erro léxico, o parser **não** é executado (a interface informa isso e mostra os erros léxicos).
- **D3:** a árvore exibida é a **AST** (sem `EXPR'`, `TERMO'`, `=` nem fim de linha); os parênteses aparecem como nó *Agrupamento*. A derivação completa aparece no passo a passo.
- **D4:** sem recuperação de erros: **só o primeiro erro sintático é reportado**.
- Os **tokens esperados** de cada erro são calculados pela tabela M a partir do estado do parser, e a explicação cita a regra e a célula vazia de M.
- **D8:** a AST é exibida como árvore hierárquica navegável, em HTML/JS puro, sem biblioteca.

## Arquitetura e comunicação

```
Navegador ──POST /api/analisar──▶ Nginx (:8080) ──proxy /api/──▶ Backend FastAPI (:8000)
          ◀──────── JSON ────────                ◀──────── JSON ────────
```

Frontend e backend são componentes separados, cada um em seu contêiner. O navegador só fala com o Nginx (mesma origem, sem CORS), que encaminha `/api/` ao backend.

Separação lógica para as próximas etapas:

| Camada | Arquivo | Responsabilidade |
|---|---|---|
| Interface | `frontend/app.js` | exibir, editar, escolher exemplos e mostrar resultados |
| Cliente da API | `frontend/api.js` | única camada que faz HTTP; classifica a resposta (sucesso / rejeitado / falha) |
| Rotas e erros | `backend/main.py` | endpoints e formato único de erro |
| Contrato | `backend/schemas.py` | modelos de entrada, saída e erro |
| Exibição da análise | `frontend/analise.js` | erros por fase, código destacado, AST navegável, tokens, passo a passo e tabela M |
| Orquestração | `backend/processamento.py` | validações e `processar()`: scanner → (sem erro léxico) parser; a análise semântica entrará aqui |
| Scanner | `backend/scanner.py` | análise léxica |
| Gramática | `backend/gramatica.py` | produções, FIRST, FOLLOW e tabela M (calculados e verificados) |
| Parser | `backend/parser.py` | parser LL(1), construção da AST, passo a passo e mensagens de erro |
| AST | `backend/arvore.py` | tipos de nó e serialização (o nome evita conflito com o módulo `ast` do Python) |

**Contrato resumido** — `POST /api/analisar` com `{"codigo": "<texto>"}`:

- `200` → `{"recebido": true, "mensagem": "Código recebido com sucesso.", "codigo": "...", "estatisticas": {"linhas", "caracteres", "bytes"}, "sucesso": bool, "lexico": {"sucesso", "tokens", "erros"}, "sintatico": {"executado", "sucesso", "ast", "erros", "passos", ...}}`. Erros léxicos e sintáticos no **código** também respondem 200: fazem parte do resultado. Os campos das etapas anteriores foram mantidos.
- `GET /api/gramatica` → produções, FIRST, FOLLOW e tabela M.
- `400` corpo inválido · `413` código acima de 100.000 caracteres · `422` campo ausente/inválido, texto vazio, só com espaços ou com caracteres que não podem ser codificados → `{"recebido": false, "erro": {"codigo", "mensagem", "detalhes"}}`

Especificação completa (campos, códigos de erro, tratamento no frontend, exemplos de `curl`): **[docs/API.md](docs/API.md)**. Documentação interativa: <http://localhost:8080/api/docs>.

## Histórico de etapas

| Etapa | Entrega |
|---|---|
| 1 | Ambiente Docker Compose com frontend (Nginx) e backend (FastAPI); rota `/api/hello`. |
| 2 | Interface inicial: identificação do sistema e da linguagem, área de código, botão **Analisar**, área de resultados e seletor de exemplos. |
| 3 | Edição e preservação do código (`localStorage`), substituição de conteúdo, envio do código como texto puro. |
| 4 | Comunicação real `POST /api/analisar` com contrato JSON documentado em `docs/API.md`; backend valida e devolve estrutura de resposta. |
| 5 | Validações de entrada e tratamento de erros: vazio, só espaços, corpo inválido, campo ausente ou de tipo errado, limite de tamanho, texto não codificável (`CODIGO_INVALIDO`), falha de comunicação, tempo limite, resposta fora do contrato e erro inesperado (tanto no backend quanto na interface). |
| 6 (Etapa 4 do roteiro) | Scanner e parser LL(1) com AST; `POST /api/analisar` devolve tokens, AST, passo a passo e erros léxicos e sintáticos; `GET /api/gramatica`; interface com erros por fase, código destacado, AST navegável, tokens, passo a passo e tabela M; gramática, AST e casos de teste documentados. |

A análise semântica (tabela de símbolos, variável usada antes de receber valor) **ainda não está implementada**; será feita na Etapa 5.

## Tecnologias

| Componente | Tecnologia |
|---|---|
| Frontend | HTML, CSS e JavaScript servidos pelo Nginx |
| Backend | Python 3.12 com FastAPI e Uvicorn |
| Scanner e parser | Python, só biblioteca padrão (`re`, `keyword`); parser LL(1) próprio, sem gerador de parser |
| Visualização da AST | HTML, CSS e JavaScript puros (árvore com `role="tree"`), sem biblioteca externa |
| Ambiente | Docker e Docker Compose |

## Estrutura do repositório

```
.
├── backend/               # API em Python (FastAPI)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── requirements-dev.txt
│   ├── main.py            # rotas e tratamento de erros
│   ├── schemas.py         # modelos do contrato
│   ├── processamento.py   # validações e orquestração das análises
│   ├── scanner.py         # análise léxica
│   ├── gramatica.py       # gramática LL(1), FIRST, FOLLOW e tabela M
│   ├── parser.py          # parser LL(1), AST e mensagens de erro
│   ├── arvore.py          # nós da AST
│   └── tests/             # testes automatizados
├── frontend/              # Interface web
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── index.html         # estrutura da tela
│   ├── styles.css         # estilos (claro/escuro, responsivo)
│   ├── exemplos.js        # programas de exemplo (catálogo)
│   ├── api.js             # cliente da API (HTTP e classificação das respostas)
│   ├── analise.js         # exibição de tokens, AST, erros, passo a passo e tabela M
│   ├── app.js             # interações da tela
│   ├── package.json       # dependências de teste
│   └── tests/             # testes da interface (fixtures/ = respostas reais do backend)
├── docs/
│   ├── API.md             # contrato da API
│   ├── gramatica.md       # gramática, precedência, FIRST/FOLLOW, tabela M, exemplos
│   ├── ANALISE-LEXICA.md  # scanner: categorias de token e erros léxicos
│   ├── ANALISE-SINTATICA.md # parser, decisões, AST e tratamento de erros
│   ├── REGISTRO-TESTES.md # comandos, resultados, falhas e correções
│   └── etapa4/            # casos de teste CT-01 a CT-30, fluxograma e notas para o artigo
├── scripts/
│   ├── verificar-integracao.sh
│   └── gerar-fixtures.py  # regrava as respostas usadas nos testes da interface
├── docker-compose.yml     # Sobe frontend e backend juntos
└── README.md
```

## Pré-requisitos

- [Git](https://git-scm.com/downloads)
- [Docker](https://docs.docker.com/get-started/get-docker/) (no Windows e no macOS, o Docker Desktop)
- Docker Compose v2 (já incluído no Docker Desktop; comando `docker compose`)

Versões utilizadas no desenvolvimento: Docker [preencher com `docker --version`] e Docker Compose [preencher com `docker compose version`].

Portas livres necessárias: **8080** (interface) e **8000** (API).

## Como executar

```bash
git clone [URL do repositório]
cd [nome-da-pasta]
docker compose up --build
```

Quando os logs estabilizarem, acesse:

- Interface: <http://localhost:8080> — deve exibir a tela do Visualizador de Análise Sintática (Python), com o indicador "Backend conectado". Escolha um exemplo e clique em **Analisar**: aparecem o resultado na seção 2 e os tokens, a árvore e o passo a passo na seção 3
- API (opcional): <http://localhost:8000/api/hello> — deve responder `{"message":"Hello, World!"}`

## Exemplos disponíveis

Os exemplos ficam em `frontend/exemplos.js` e cobrem as construções do subconjunto (atribuição com expressões aritméticas, identificadores, números, strings e parênteses). Os programas com erro mostram onde e por que o parser falha; há um teste que confere que cada exemplo produz o resultado do seu grupo (CT-27).

**Programas válidos**

| Exemplo | Código | Construções demonstradas |
|---|---|---|
| Atribuição simples | `x = 5` | identificador, `=`, número |
| Operação aritmética | `resultado = 10 + 5` | expressão com operador binário `+` |
| Precedência e parênteses | `total = 2 + 3 * 4`<br>`media = (2 + 3) * 4 / 2 - 1` | precedência de operadores, parênteses, os quatro operadores `+ - * /` |
| Várias atribuições com variáveis | `preco = 10`<br>`qtd = 3`<br>`total = preco * (qtd + 1)` | lista de atribuições, identificadores dentro de expressões |
| Textos (strings) | `nome = "Ana"`<br>`saudacao = "Olá, " + nome` | literal string, concatenação com `+` |

**Programas com erro intencional**

| Exemplo | Código | O que demonstra |
|---|---|---|
| Operando ausente | `x = 5 +` / `y = 2` | erro sintático: fim de linha onde se esperava um operando |
| Atribuição sem expressão | `x =` | erro sintático: expressão ausente após `=` |
| Parêntese não fechado | `total = preco * (qtd + 1` | erro sintático: `)` esperado |
| Falta o sinal `=` | `x 5` | erro sintático: `=` esperado após o identificador |
| Construção fora do subconjunto | `x = 5` / `if x > 3:` / `    y = 1` | limite do escopo: estruturas de controle não são aceitas |

## Interface

- **Exemplos prontos:** o seletor (agrupado em "válidos" e "com erro intencional") substitui todo o conteúdo do editor pelo programa escolhido e mostra o que ele demonstra. O código carregado continua editável; ao editá-lo, o seletor volta ao início, e selecionar o mesmo exemplo de novo restaura o original. Escolher um exemplo não envia nada ao backend.
- **Código-fonte:** campo monoespaçado para escrever ou colar o programa (contador de linhas e caracteres).
- **Código inicial:** a página abre com um pequeno programa que pode ser editado ou substituído.
- **Preservação:** o conteúdo fica guardado no navegador (`localStorage`) e volta ao recarregar a página; **Limpar** apaga também essa cópia.
- **Analisar** (ou `Ctrl + Enter`): envia o código ao backend (`POST /api/analisar`) exatamente como está, inclusive com erros. Campo vazio ou só com espaços é barrado na interface (e o backend valida de novo). Se o backend recusar a entrada, a mensagem dele é exibida; se não houver comunicação (backend fora do ar, sem resposta em 10 s, resposta fora do contrato), a interface informa o motivo e mantém o código no editor.
- **Resultados (seção 2):** mensagem e contagens do servidor, resumo da análise e **blocos separados por fase**: "Erros léxicos (fase 1)", "Análise sintática não executada" (quando há erro léxico) ou "Erro sintático (fase 2)". O erro sintático mostra a mensagem com linha e coluna, uma explicação em linguagem acessível, o que foi encontrado, os tokens esperados, a regra e a célula da tabela M, além dos botões **Mostrar no código**, **Selecionar no editor** e **Ver na tabela M**.
- **Seção 3:**
  - **Código analisado** com os tokens destacados por categoria (cor e estilo de sublinhado, com legenda), os erros léxicos sublinhados e o ponto do erro sintático marcado.
  - **Árvore (AST):** árvore navegável com formas por tipo de nó, expandir/recolher (um a um ou tudo) e navegação por teclado (setas, Enter). Ao selecionar um nó, o trecho correspondente é destacado no código e na tabela de tokens, e aparecem o tipo, a regra gramatical, a posição, o trecho e os atributos. Também há o filtro **Destacar tipo** e **Exportar AST (JSON)**.
  - **Tokens:** tabela com categoria, lexema, linha e coluna, contagem por categoria e explicação de token e lexema. Selecionar um token mostra a folha correspondente na árvore.
  - **Passo a passo:** pilha, entrada e ação de cada passo do parser LL(1), com controles (primeiro, anterior, reproduzir/pausar, próximo, último) e a **árvore em construção**, que cresce de baixo para cima. Quando há erro, mostra o que já tinha sido reconhecido.
  - **Gramática e tabela M:** produções numeradas, terminais e tokens, FIRST e FOLLOW, e a tabela M com a célula do passo atual contornada e a célula do erro marcada com ✗.
- **Programas grandes:** a análise é completa, mas a interface limita o que desenha para não travar: até 3.000 linhas na tabela de tokens, destaque do código até 6.000 tokens, 2.000 passos no passo a passo e nós da árvore criados só ao expandir.
- **Limpar:** zera editor, exemplo selecionado e resultados.
- Limite: 100.000 caracteres. Observação: o navegador converte quebras `\r\n` coladas no campo em `\n`.

## Testes automatizados

Execute-os sempre que alterar a interface ou a API, para detectar regressões. Ao criar ou modificar um endpoint, atualize `docs/API.md` e os testes correspondentes (há um teste que confere que todo código de erro documentado é realmente emitido).

**Backend** — Python 3.12:

```bash
cd backend
pip install -r requirements-dev.txt
python -m pytest
```

| Arquivo | O que verifica |
|---|---|
| `test_scanner.py` | categorias de token, posições, erros léxicos, comentários, quebras de linha, Unicode |
| `test_gramatica.py` | gramática LL(1) sem conflitos; FIRST, FOLLOW e tabela M comparados com o cálculo manual |
| `test_parser.py` | AST comparada com referências escritas à mão; precedência e associatividade; posições; erros sintáticos (posição, encontrado, esperados, explicação); passo a passo; limites |
| `test_analise_sintatica.py` | endpoint com tokens + AST + erros; decisão D1; exemplos da interface (CT-27); consistência entre tokens e AST; `/api/gramatica` |
| `test_fixtures_frontend.py` | as respostas gravadas para os testes da interface estão atualizadas (se falhar, rode `python scripts/gerar-fixtures.py`) |
| `test_analisar.py` | requisições válidas: status 200, formato e conteúdo da resposta, texto devolvido sem alteração (caracteres especiais, CRLF, erros intencionais), limite exato |
| `test_erros.py` | campo ausente ou de tipo inválido, vazio, só espaços, acima do limite, corpo que não é JSON, método/rota inválidos, falha interna (500) — sempre no formato padrão de erro |
| `test_regressao.py` | rotas das etapas anteriores, prefixo `/api/`, exemplos do frontend aceitos |
| `test_processamento.py` | validações e contagem de linhas, sem HTTP |
| `test_contrato.py` | o contrato OpenAPI gerado corresponde ao implementado e ao `docs/API.md` |

**Frontend** — [Node.js](https://nodejs.org/) 18+ (os testes de integração também precisam do Python e das dependências do backend):

```bash
cd frontend
npm install
npm test
```

| Arquivo | O que verifica |
|---|---|
| `interface.test.js` | elementos da tela, edição, preservação, envio, caracteres especiais |
| `exemplos.test.js` | cada exemplo: seleção, código carregado, substituição, edição e independência das demais funções |
| `comunicacao.test.js` | `api.js` e a exibição dos retornos, com o backend simulado: cada tipo de resposta (200, 400, 413, 422, 5xx sem formato padrão, resposta fora do contrato), falha de rede e tempo limite |
| `analise.test.js` | árvore (precedência, teclado, expandir/recolher, filtro, exportação), destaque no código e nos tokens, erros por fase, passo a passo, tabela M, entradas grandes, HTML exibido como texto |
| `integracao.test.js` | **backend real**: o teste inicia o uvicorn, a interface envia por HTTP de verdade e confere-se resposta, status e cabeçalhos; cada exemplo mostra o resultado do seu grupo; consistência entre tokens, código e árvore. Se o Python não estiver disponível, esses testes são ignorados com aviso |

**Com a aplicação no ar** (`docker compose up --build`), verifique também o caminho completo pelo Nginx:

```bash
scripts/verificar-integracao.sh        # ou: scripts/verificar-integracao.sh http://localhost:8080
```

## Como encerrar

Pressione `Ctrl+C` no terminal em que o Compose está rodando e, em seguida:

```bash
docker compose down
```

Para subir em segundo plano, use `docker compose up --build -d`; para ver o estado, `docker compose ps`.

## Solução de problemas

| Sintoma | O que fazer |
|---|---|
| `Cannot connect to the Docker daemon` | Abra o Docker Desktop e aguarde ele iniciar |
| `port is already allocated` | Outra aplicação usa a porta 8080 ou 8000; feche-a ou altere a porta em `docker-compose.yml` |
| O indicador mostra "Backend indisponível" ou o resultado diz "Não foi possível comunicar com o servidor" | Rode `docker compose ps` e `docker compose logs backend` |

## Validação de instalação limpa

Procedimento seguido para validar que o projeto não depende de configurações da máquina de desenvolvimento:

1. Clonar o repositório em uma pasta nova.
2. Executar somente os comandos da seção "Como executar".
3. Conferir a mensagem em <http://localhost:8080>.
4. Encerrar com `docker compose down`.

Resultado: [preencher: data, sistema operacional e se funcionou].

## Resultados dos testes

Registro completo, com a linha de base, as falhas encontradas e as correções: **[docs/REGISTRO-TESTES.md](docs/REGISTRO-TESTES.md)**. Casos CT-01 a CT-30 com o teste que verifica cada um: **[docs/etapa4/casos-de-teste.md](docs/etapa4/casos-de-teste.md)**.

| Verificação | Comando | Situação (24/11/2026) |
|---|---|---|
| Suíte do backend | `cd backend && python -m pytest` | **247 aprovados**, 0 reprovados |
| Suíte do frontend (incluindo integração com o backend real) | `cd frontend && npm install && npm test` | **229 aprovados**, 0 reprovados |
| Casos de teste CT-01 a CT-28 | ver `docs/etapa4/casos-de-teste.md` | 28 aprovados; CT-29 e CT-30 previstos para a Etapa 5 |
| Verificação pelo Nginx com os contêineres no ar | `scripts/verificar-integracao.sh` | **Pendente** com Docker (17 de 17 OK contra um servidor substituto; ver registro) |
| `docker compose up --build` | — | **Pendente** (Docker Hub inacessível no ambiente usado) |
| Instalação limpa seguindo este README | seção "Validação de instalação limpa" | **Pendente** |

## Limitações conhecidas

- O subconjunto é pequeno (atribuições e expressões aritméticas); a indentação é ignorada pelo scanner, e linhas indentadas são aceitas, ao contrário do Python.
- O parser para no primeiro erro sintático (sem recuperação de erros).
- Uma `(` só pode ser fechada na mesma linha (o Python permite continuar a expressão na linha seguinte).
- Árvores com mais de 100 níveis (por exemplo, somas com mais de ~100 termos) não são enviadas à interface: o programa é analisado e declarado válido, com um aviso.
- O passo a passo guarda os primeiros 2.000 passos.
- A análise semântica ainda não existe: `y = x + 1` sem `x` definido é aceito (correto para a sintaxe; o erro semântico virá na Etapa 5).
- A responsividade foi verificada apenas por simulação de largura no Chrome; falta o teste em aparelhos reais.
- A verificação com Docker Compose depende de execução manual e do script `scripts/verificar-integracao.sh`.
- O código é guardado no `localStorage` do navegador; não há persistência no servidor.

## Relação com a Etapa 5

A AST foi desenhada para a análise semântica: cada nó tem posição e regra, e cada identificador indica se é **alvo** (recebe valor) ou **uso**. A análise semântica entrará em `processar()`, depois do parser, e seus erros terão um bloco próprio na interface ("fase 3").
