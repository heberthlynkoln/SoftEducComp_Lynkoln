# Visualizador de Análise Sintática com Explicação de Erros

Software educacional para o ensino de **análise sintática** na disciplina de Compiladores. A ferramenta, em formato de aplicação web, analisará atribuições escritas em Python e mostrará, passo a passo, a construção da árvore sintática e, quando o código estiver errado, **onde e por que o parser falha**, indicando os tokens esperados naquele ponto.

> **Status:** etapa 3 do roteiro — análise léxica. O botão **Analisar** envia o código ao backend, que o valida e executa o **analisador léxico** (scanner): a interface mostra os tokens (categoria, lexema, linha e coluna), o código com cada token destacado e os erros léxicos com localização. A análise **sintática** (etapa 4) ainda não existe.

- **Autor:** Lynkoln Heberth Pereira
- **Disciplina:** Compiladores
- **Professor:** GitHub: `rocha3runo`

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

**Análise léxica (scanner):** reconhece palavras reservadas do Python, identificadores (com letras acentuadas), inteiros, reais, textos entre aspas, comentários com `#`, operadores aritméticos, relacionais e de atribuição, e os delimitadores. O escopo completo, com exemplos e os casos de erro, está em **[docs/ANALISE-LEXICA.md](docs/ANALISE-LEXICA.md)**. Tokens fora do subconjunto do parser (por exemplo, `if x > 3:`) são tokenizados normalmente; a recusa da estrutura é papel do parser (etapa 4).

**Fora do escopo:** estruturas de controle (`if`, `while`, `for`), funções e classes, listas e dicionários, comandos `import` e qualquer biblioteca. Como não há blocos, a indentação não é tratada. A ampliação do subconjunto fica como trabalho futuro.

**Gramática de referência (proposta inicial):**

```
PROGRAMA    → LISTA_ATRIB
LISTA_ATRIB → ATRIB LISTA_ATRIB | ε
ATRIB       → identificador = EXPR NOVA_LINHA
EXPR        → TERMO EXPR'
EXPR'       → + TERMO EXPR' | - TERMO EXPR' | ε
TERMO       → FATOR TERMO'
TERMO'      → * FATOR TERMO' | / FATOR TERMO' | ε
FATOR       → identificador | número | string | ( EXPR )
```

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
| Análise léxica | `backend/scanner.py` | tokens e erros léxicos, sem dependências externas (biblioteca padrão) |
| Processamento | `backend/processamento.py` | validações iniciais e orquestração: chama o scanner e monta a resposta; o parser entrará aqui |

**Contrato resumido** — `POST /api/analisar` com `{"codigo": "<texto>"}`:

- `200` → `{"recebido": true, "sucesso": true, "mensagem": "...", "codigo": "...", "estatisticas": {"linhas", "caracteres", "bytes"}, "tokens": [{"tipo", "lexema", "linha", "coluna"}], "erros": []}`. Com erros léxicos, o status continua `200`, com `sucesso: false` e `erros` preenchido.
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
| Análise léxica (etapa 3 do roteiro) | Scanner integrado ao endpoint: tokens com linha e coluna, erros léxicos com mensagens didáticas, código com tokens destacados, tabela e contagem por categoria. Escopo em `docs/ANALISE-LEXICA.md`. |

A análise sintática e a semântica **ainda não estão implementadas**; serão feitas nas próximas etapas. A numeração acima é a do histórico original do projeto e não coincide com a do roteiro da disciplina.

## Tecnologias

| Componente | Tecnologia |
|---|---|
| Frontend | HTML, CSS e JavaScript servidos pelo Nginx |
| Backend | Python 3.12 com FastAPI e Uvicorn |
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
│   ├── processamento.py   # validações e orquestração da análise
│   ├── scanner.py         # analisador léxico (tokens e erros léxicos)
│   └── tests/             # testes automatizados da API e do scanner
├── frontend/              # Interface web
│   ├── Dockerfile
│   ├── nginx.conf
│   ├── index.html         # estrutura da tela
│   ├── styles.css         # estilos (claro/escuro, responsivo)
│   ├── exemplos.js        # programas de exemplo (catálogo)
│   ├── api.js             # cliente da API (HTTP e classificação das respostas)
│   ├── app.js             # interações da tela
│   ├── package.json       # dependências de teste
│   └── tests/             # testes automatizados da interface
├── docs/
│   ├── API.md             # contrato da API
│   ├── ANALISE-LEXICA.md  # escopo léxico e funcionamento do scanner
│   └── REGISTRO-TESTES.md # comandos executados, resultados e falhas da etapa
├── scripts/
│   └── verificar-integracao.sh
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

- Interface: <http://localhost:8080> — deve exibir a tela do Visualizador de Análise Sintática (Python), com o indicador "Backend conectado"
- API (opcional): <http://localhost:8000/api/hello> — deve responder `{"message":"Hello, World!"}`

## Exemplos disponíveis

Os exemplos ficam em `frontend/exemplos.js` e cobrem as construções do subconjunto (atribuição com expressões aritméticas, identificadores, números, strings e parênteses). Os programas com erro servem para observar, nas próximas etapas, onde e por que o parser falha.

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
- **Analisar** (ou `Ctrl + Enter`): envia o código ao backend (`POST /api/analisar`) exatamente como está, inclusive com erros. A área **Resultados** mostra a mensagem e as contagens, a lista de erros léxicos (com linha e coluna), o código com os tokens destacados por categoria, a contagem por categoria, a tabela de tokens (tipo, lexema, linha, coluna) e uma explicação de token e lexema. Tudo vem do **servidor**; a interface não faz análise. Campo vazio ou só com espaços é barrado na interface (e o backend valida de novo). Se o backend recusar a entrada, a mensagem dele é exibida; se não houver comunicação (backend fora do ar, sem resposta em 10 s, resposta fora do contrato), a interface informa o motivo e mantém o código no editor.
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
| `test_analisar.py` | requisições válidas: status 200, formato e conteúdo da resposta, texto devolvido sem alteração (caracteres especiais, CRLF, erros intencionais), limite exato |
| `test_erros.py` | campo ausente ou de tipo inválido, vazio, só espaços, acima do limite, corpo que não é JSON, método/rota inválidos, falha interna (500) — sempre no formato padrão de erro |
| `test_regressao.py` | rotas das etapas anteriores, prefixo `/api/`, exemplos do frontend aceitos |
| `test_processamento.py` | validações e contagem de linhas, sem HTTP |
| `test_contrato.py` | o contrato OpenAPI gerado corresponde ao implementado e ao `docs/API.md` |
| `test_scanner.py` | scanner sem HTTP: palavras reservadas, identificadores, literais, operadores compostos, delimitadores, comentários, espaços, posição, erros léxicos e casos de borda (seção 6.1 do roteiro) |
| `test_analise_lexica.py` | endpoint com a análise léxica: tokens e sucesso, erro léxico com HTTP 200, validações da Etapa 2 preservadas |

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
| `analise-lexica.test.js` | apresentação do resultado: tabela de tokens, destaque por categoria sem alterar o texto, contagem, erros léxicos, divergência e HTML no código |
| `integracao.test.js` | **backend real**: o teste inicia o uvicorn, a interface envia por HTTP de verdade e confere-se resposta, status e cabeçalhos, inclusive tokens e erros léxicos. Se o Python não estiver disponível, esses testes são ignorados com aviso |

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

## Resultados dos testes

Os resultados abaixo descrevem exatamente o que foi executado na última revisão. Quando um comando não foi executado, ele aparece como **Pendente**, e não como aprovado.

| Verificação | Comando | Situação |
|---|---|---|
| Sintaxe Python (backend e testes) | `python3 -m py_compile backend/*.py backend/tests/*.py` | OK |
| Sintaxe JavaScript (interface e testes) | `node --check frontend/*.js frontend/tests/*.js` | OK |
| Scanner (97 casos) e processamento (26 casos) | runner de desenvolvimento sobre os arquivos de teste reais, sem `pytest` | 123 casos, 0 falhas. Verificação indicativa |
| Classificação de respostas do `api.js` com o contrato novo (8 casos) | Node com `window` simulado | 8 de 8 OK. Verificação indicativa |
| Exemplos da interface sem erro léxico (10) | scanner sobre `exemplos.js` | 10 de 10 OK. Verificação indicativa |
| **Suíte completa do backend** (inclui `test_analise_lexica.py` e `test_scanner.py`) | `cd backend && python -m pytest` | OK |
| **Suíte completa do frontend** (inclui `analise-lexica.test.js` e os testes de integração com a análise léxica) | `cd frontend && npm install && npm test` | OK |
| Verificação pelo Nginx com os contêineres no ar | `scripts/verificar-integracao.sh` | OK |
| Instalação limpa seguindo este README | seção "Validação de instalação limpa" | OK |

Os testes desta etapa que dependem de HTTP ou de navegador simulado ainda não foram executados neste ambiente, porque ele não tem acesso à internet para instalar FastAPI, pytest, Vitest e jsdom. O procedimento completo e o histórico de falhas e correções estão em **[docs/REGISTRO-TESTES.md](docs/REGISTRO-TESTES.md)**. Antes de considerar a etapa validada, rode os comandos da tabela e registre as quantidades de aprovados e reprovados.


