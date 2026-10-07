# Visualizador de Análise Sintática com Explicação de Erros

Software educacional para o ensino de **análise sintática** na disciplina de Compiladores. A ferramenta, em formato de aplicação web, analisará atribuições escritas em Python e mostrará, passo a passo, a construção da árvore sintática e, quando o código estiver errado, **onde e por que o parser falha**, indicando os tokens esperados naquele ponto.

> **Status:** Etapa 1 concluída (estrutura inicial, Docker e "Hello, World!"). As funcionalidades de análise serão desenvolvidas nas próximas etapas.

- **Autor:** Lynkoln Heberth Pereira
- **Disciplina:** Compiladores — Universidade Federal de Jataí
- **Professor:** Bruno Moraes Rocha (GitHub: `rocha3runo`)

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
│   └── main.py
├── frontend/              # Interface web
│   ├── Dockerfile
│   ├── nginx.conf
│   └── index.html
├── docker-compose.yml     # Sobe frontend e backend juntos
└── README.md
```

## Pré-requisitos

- [Git](https://git-scm.com/downloads) [versão utilizada - 2.51.0.windows.1]
- [Docker](https://docs.docker.com/get-started/get-docker/) (no Windows e no macOS, o Docker Desktop)
- Docker Compose v2 (já incluído no Docker Desktop; comando `docker compose`)

Versões utilizadas no desenvolvimento: Docker [29.8.2] e Docker Compose [v5.5.1].

Portas livres necessárias: **8080** (interface) e **8000** (API).

## Como executar

```bash
git clone [URL do repositório]
cd [nome-da-pasta]
docker compose up --build
```

Quando os logs estabilizarem, acesse:

- Interface: <http://localhost:8080> — deve exibir **Hello, World!**
- API (opcional): <http://localhost:8000/api/hello> — deve responder `{"message":"Hello, World!"}`

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
| A página mostra "Sem resposta do backend" | Rode `docker compose ps` e `docker compose logs backend` |

## Validação de instalação limpa

Procedimento seguido para validar que o projeto não depende de configurações da máquina de desenvolvimento:

1. Clonar o repositório em uma pasta nova.
2. Executar somente os comandos da seção "Como executar".
3. Conferir a mensagem em <http://localhost:8080>.
4. Encerrar com `docker compose down`.

Resultado: [preencher: data, sistema operacional e se funcionou].
