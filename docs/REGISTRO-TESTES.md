# Registro de testes — análise léxica (etapa 3 do roteiro)

Registro do que foi executado, dos resultados obtidos, das falhas encontradas e das correções feitas, conforme a orientação da etapa.

Este registro distingue duas coisas:

- **Executado e aprovado:** rodado de fato, com resultado observado.
- **Pendente:** escrito, mas **não executado**. Os comandos estão listados para serem rodados na máquina do desenvolvedor, com Docker e Node disponíveis.

## Ambiente da última revisão

O registro abaixo foi feito em um ambiente **sem acesso à rede**. Isso impediu instalar FastAPI, Uvicorn, pytest, Vitest e jsdom. Por isso:

- O scanner (`scanner.py`) e a camada de processamento foram testados com um runner de desenvolvimento que executa as funções `test_*` dos arquivos reais (sem reimplementar nenhum teste). Ele **não substitui o pytest**.
- Os testes que dependem de HTTP (`test_analise_lexica.py`, `test_analisar.py`, `test_erros.py`, `test_contrato.py`) e os de interface (`analise-lexica.test.js` e os demais de `frontend/tests/`) **não foram executados**.

## Executado

| # | Verificação | Comando ou método | Resultado |
|---|---|---|---|
| 1 | Compilação dos arquivos Python (backend e testes) | `python3 -m py_compile backend/*.py backend/tests/*.py` | OK |
| 2 | Sintaxe JavaScript (interface e testes) | `node --check frontend/*.js frontend/tests/*.js` | OK |
| 3 | Sintaxe do script de integração | `bash -n scripts/verificar-integracao.sh` | OK |
| 4 | Testes unitários do scanner (`test_scanner.py`) | runner de desenvolvimento sobre o arquivo real | 97 casos, 0 falhas |
| 5 | Testes de processamento (`test_processamento.py`, inclui 2 novos) | mesmo runner | 26 casos, 0 falhas |
| 6 | Classificação das respostas no `api.js` com o contrato novo | Node com `window` simulado | 8 de 8 corretas |
| 7 | Exemplos da interface (`exemplos.js`) passam pelo scanner sem erro léxico | scanner sobre os 10 exemplos | 10 de 10 sem erro léxico |
| 8 | Exemplos de `docs/ANALISE-LEXICA.md` (tokens, posições e erros) | scanner sobre os exemplos documentados | conferem com o documento |
| 9 | Destaque do código no navegador simulado | função `destacarCodigo` extraída de `app.js`, aplicada a 12 casos reais | o texto destacado é idêntico ao original em 12 de 12, inclusive com emoji (caractere fora do BMP) |

## Falhas encontradas durante a revisão e correções

Todas foram encontradas pelos próprios testes escritos nesta etapa, antes da entrega:

| Falha | Causa | Correção |
|---|---|---|
| Teste de coluna esperava 13 para `x` em `s = "ação" + x` | Erro de contagem no próprio teste: são 13 caracteres antes do `x`, então a coluna é 14 | teste corrigido; o scanner estava certo |
| Teste de caracteres fora do escopo tinha asserção que não provava nada | Escrita de forma confusa, com `or ch == "#!"` | reescrito para verificar o erro, a localização e que o scanner continua |
| Ordem esperada da contagem por categoria não batia com a exibida | O teste seguia uma ordem diferente da de `CATEGORIAS` | teste ajustado para a ordem de exibição |
| Trecho de substituição de texto não casava com a indentação do `app.js` | Diferença de espaços em branco entre o trecho buscado e o arquivo | substituição feita por expressão regular; verificada depois |
| Título de teste não correspondia ao que o teste verificava | Título escrito antes do teste | título ajustado |

## Pendente (executar na máquina do desenvolvedor)

Os comandos abaixo precisam de Docker, Python 3.12 com as dependências de `backend/requirements-dev.txt` e Node 18+.

| # | Verificação | Comando | Situação |
|---|---|---|---|
| P1 | Suíte completa do backend (inclui `test_analise_lexica.py`, `test_scanner.py`, `test_analisar.py` atualizado) | `cd backend && pip install -r requirements-dev.txt && python -m pytest` | **Pendente** |
| P2 | Suíte completa do frontend (inclui `analise-lexica.test.js`, os novos casos de `comunicacao.test.js` e os testes de análise léxica de `integracao.test.js`) | `cd frontend && npm install && npm test` | **Pendente** |
| P3 | Verificação pelo Nginx com os contêineres no ar (inclui os dois casos novos) | `docker compose up --build -d` e depois `scripts/verificar-integracao.sh` | **Pendente** |
| P4 | Instalação limpa seguindo o README | seção "Validação de instalação limpa" | **Pendente** |

Quando executar, registre aqui a quantidade de aprovados e reprovados de cada suíte. Se alguma falhar, corrija e registre a falha e a correção na tabela de falhas acima.

## Mudança de contrato que os testes antigos precisaram acompanhar

A resposta `200` ganhou os campos `sucesso`, `tokens` e `erros`. Por isso foram atualizados:

- `test_analisar.py::test_formato_da_resposta_segue_o_contrato`: o conjunto de campos esperados agora inclui os três novos.
- `integracao.test.js`: a comparação exata da resposta do backend real passou a incluir os tokens.
- `helpers.js`: o backend simulado e `sucessoApi` passaram a devolver o formato novo (`tokens: []`, `erros: []`).

Nenhum teste de comportamento anterior foi removido. Código com erro léxico continua retornando `200`, então os testes que esperavam `200` para código com erros de sintaxe continuam válidos.
