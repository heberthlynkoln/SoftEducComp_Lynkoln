# Visualizador de Análise Sintática com Explicação de Erros

Software educacional para o ensino de **análise sintática** na disciplina de Compiladores. A ferramenta, em formato de aplicação web, analisará atribuições escritas em Python e mostrará, passo a passo, a construção da árvore sintática e, quando o código estiver errado, **onde e por que o parser falha**, indicando os tokens esperados naquele ponto.

> **Status:** Etapa 5 — comunicação frontend ↔ backend. O botão **Analisar** envia o código por HTTP ao backend, que valida a entrada e responde em JSON; a interface exibe o que o servidor devolveu (sucesso, erro de validação ou falha de comunicação). A análise léxica/sintática será desenvolvida nas próximas etapas.

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
| Processamento | `backend/processamento.py` | validações iniciais e ponto de extensão `processar()`, onde entrarão o léxico e o parser |

**Contrato resumido** — `POST /api/analisar` com `{"codigo": "<texto>"}`:

- `200` → `{"recebido": true, "mensagem": "Código recebido com sucesso.", "codigo": "...", "estatisticas": {"linhas", "caracteres", "bytes"}}`
- `400` corpo inválido · `413` código acima de 100.000 caracteres · `422` campo ausente/inválido, texto vazio ou só com espaços → `{"recebido": false, "erro": {"codigo", "mensagem", "detalhes"}}`

Especificação completa (campos, códigos de erro, tratamento no frontend, exemplos de `curl`): **[docs/API.md](docs/API.md)**. Documentação interativa: <http://localhost:8080/api/docs>.

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
│   ├── processamento.py   # validações e ponto de extensão dos analisadores
│   └── tests/             # testes automatizados da API
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
│   └── API.md             # contrato da API
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
- **Analisar** (ou `Ctrl + Enter`): envia o código ao backend (`POST /api/analisar`) exatamente como está, inclusive com erros, e mostra na área **Resultados** a mensagem, as contagens e o código que o **servidor** devolveu. Campo vazio ou só com espaços é barrado na interface (e o backend valida de novo). Se o backend recusar a entrada, a mensagem dele é exibida; se não houver comunicação (backend fora do ar, sem resposta em 10 s, resposta fora do contrato), a interface informa o motivo e mantém o código no editor.
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
| `integracao.test.js` | **backend real**: o teste inicia o uvicorn, a interface envia por HTTP de verdade e confere-se resposta, status e cabeçalhos. Se o Python não estiver disponível, esses testes são ignorados com aviso |

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
