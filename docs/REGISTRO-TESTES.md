# Registro de testes

Registro dos comandos executados, dos resultados, das falhas encontradas e das correções feitas. Quando algo não foi executado, aparece como **pendente**.

## Execução de 24/11/2026 — Etapa 4 (análise sintática e AST)

**Ambiente:** Linux, Python 3.13.18 (o contêiner usa 3.12; a lista de palavras reservadas é a mesma nas duas versões), FastAPI 0.142.2, pytest 8.3.4, Node.js 22.23.5, Vitest 2.1.9, jsdom 25. Navegador para a inspeção visual: Google Chrome (headless, via Playwright).

### Linha de base (antes de qualquer alteração)

| Comando | Resultado |
|---|---|
| `cd backend && python -m pytest` | 83 aprovados, **1 reprovado**: `test_erros.py::test_surrogate_isolado_e_422_e_nao_500` |
| `cd frontend && npm test` | 193 aprovados |

A falha da linha de base era **do próprio teste**: o cliente de teste não consegue serializar o caractere `\ud800` ao montar o JSON e lança `UnicodeEncodeError` antes de a requisição sair. Correção: o teste passou a enviar o corpo já serializado em bytes (`{"codigo": "x = \\ud800"}`), que é o que um navegador enviaria. O comportamento verificado (resposta 422 `CODIGO_INVALIDO`, e não 500) não mudou.

### Resultado final

| Verificação | Comando | Resultado |
|---|---|---|
| Sintaxe Python | `python -m py_compile backend/*.py backend/tests/*.py` | OK |
| Sintaxe JavaScript | `node --check frontend/*.js frontend/tests/*.js` | OK |
| **Suíte do backend** | `cd backend && python -m pytest` | **247 aprovados, 0 reprovados, 0 ignorados** |
| **Suíte do frontend** | `cd frontend && npm install && npm test` | **229 aprovados, 0 reprovados, 0 ignorados** (os 28 testes de integração rodaram com o backend real) |
| Script de integração | `scripts/verificar-integracao.sh` | 17 de 17 OK, mas **contra um servidor substituto** (uvicorn + proxy Python que reproduz o `location /api/` do Nginx), e não contra os contêineres |
| Docker Compose | `docker compose up --build` | **Pendente**: no ambiente usado, o acesso ao Docker Hub estava bloqueado (`python:3.12-slim` não pôde ser baixada). Não há dependências novas; o único ajuste nos Dockerfiles é a inclusão de `analise.js` no `COPY` do frontend |
| Instalação limpa | seção "Como executar" do README | **Pendente** |
| Teste em celular (C12) | roteiro de Materiais e Métodos | **Pendente** em aparelho real. Feita apenas a simulação em largura de 390 px no Chrome (ver abaixo) |

### Testes por arquivo

| Arquivo | Testes | O que verifica |
|---|---|---|
| `backend/tests/test_scanner.py` | 52 | categorias, posições, casamento mais longo, erros léxicos, comentários, linhas em branco, CRLF, Unicode (CT-06 a CT-10, CT-22, CT-25) |
| `backend/tests/test_gramatica.py` | 7 | gramática LL(1) sem conflitos; FIRST, FOLLOW e tabela M comparados com o cálculo manual; o verificador detecta conflito |
| `backend/tests/test_parser.py` | 72 | AST comparada com referências escritas à mão (CT-01 a CT-07, CT-25, CT-26); precedência e associatividade; posições dos nós; erros sintáticos com linha, coluna, encontrado e esperados (CT-11 a CT-19); explicações específicas para 19 combinações inválidas; passo a passo; limites |
| `backend/tests/test_analise_sintatica.py` | 24 | endpoint: tokens + AST + erros; D1 (CT-14); CT-22, CT-27, CT-28; consistência entre posições da AST e dos tokens; tokens consumidos pelo parser = tokens exibidos; entrada grande; profundidade máxima serializável; `/api/gramatica` |
| `backend/tests/test_fixtures_frontend.py` | 6 | as respostas gravadas usadas nos testes da interface são as que o backend produz hoje |
| `backend/tests/test_analisar.py`, `test_erros.py`, `test_processamento.py`, `test_regressao.py`, `test_contrato.py` | 86 | regressão das etapas anteriores + documentação dos novos códigos e campos |
| `frontend/tests/analise.test.js` | 31 | árvore (precedência, ARIA, teclado, expandir/recolher, filtro, exportação JSON), destaque do nó no código e na tabela de tokens, erros por fase, marcação do ponto do erro, "Selecionar no editor", passo a passo (navegação, árvore em construção, reprodução), tabela M com a célula do erro, entradas grandes, HTML exibido como texto |
| `frontend/tests/integracao.test.js` | 28 | backend real: os 10 exemplos mostram o resultado do seu grupo (CT-27), erro léxico real, consistência tokens ↔ código ↔ árvore, contrato HTTP |
| `frontend/tests/interface.test.js`, `exemplos.test.js`, `comunicacao.test.js` | 170 | regressão das etapas anteriores |

### Testes das etapas anteriores que foram alterados

Nenhum teste foi alterado só para passar. As três alterações e seus motivos:

| Teste | Alteração | Motivo |
|---|---|---|
| `test_analisar.py::test_formato_da_resposta_segue_o_contrato` | exigia exatamente os 4 campos antigos; agora exige os 4 antigos **e** os 3 novos | o contrato cresceu por acréscimo (`sucesso`, `lexico`, `sintatico`); os campos antigos foram mantidos e continuam verificados |
| `integracao.test.js` "200: JSON com o formato do contrato" | `toEqual` com os 4 campos → campos antigos com o mesmo valor + verificação do resultado da análise de `x = 5 +` | mesmo motivo |
| `test_erros.py::test_surrogate_isolado_e_422_e_nao_500` | corpo enviado em bytes | defeito do teste, descrito na linha de base |

Os testes da interface usam um backend simulado; as respostas simuladas ganharam os campos novos (`tests/helpers.js`), porque o `api.js` passou a validar o contrato completo.

### Falhas encontradas durante o desenvolvimento e correções

| Falha | Causa | Correção |
|---|---|---|
| HTTP 500 ao analisar `x = ` seguido de 200 parênteses aninhados ou de uma soma com ~290 termos | o serializador JSON do FastAPI/pydantic recusa estruturas com mais de ~126 níveis (`Circular reference detected (depth exceeded)`) | árvores com mais de 100 níveis não são enviadas: a resposta diz que o programa é válido e traz um aviso. Teste de regressão no limite exato (`test_profundidade_maxima_permitida_e_serializada`) |
| Posição de `PROGRAMA` terminava na linha vazia depois da última quebra | o fim era calculado pelo fim do texto | o programa vai do início da primeira atribuição ao fim da última |
| Na largura de 390 px, a página ficava com 483 a 705 px de largura | a coluna da grade usava `1fr`, que cresce com a largura mínima das tabelas | `minmax(0, 1fr)`; as tabelas rolam dentro da própria caixa. Medido de novo: largura da página = 390 px nas quatro abas |
| Erros nos valores esperados de 4 testes novos (contagem de colunas, de folhas e de números feita à mão) | conta errada no teste, e não no código | conferido caractere a caractere e corrigido o valor esperado, com o cálculo anotado no próprio teste |

### Inspeção visual (Chrome, 1400 × 900 e 390 × 844)

Exemplo válido (árvore e destaque), exemplo com erro (bloco de erro, marca do fim da linha), passo a passo até o erro (pilha, árvore parcial), tabela M com a célula ✗, seleção de nó (trecho e linhas da tabela de tokens destacados) e largura de celular. Nenhum erro no console do navegador.

### Pendências para considerar a etapa validada

1. `docker compose up --build` e `scripts/verificar-integracao.sh` com os contêineres no ar.
2. Instalação limpa seguindo só o README.
3. Roteiro de celular (C12) em aparelho Android e iPhone.
4. Reexecutar `python -m pytest` e `npm test` na máquina de desenvolvimento (Windows / Codespaces) e anotar os resultados aqui.
