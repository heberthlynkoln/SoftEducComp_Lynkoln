# Notas para atualizar o artigo (Materiais e Métodos)

O documento *Etapa4-Materiais-e-Metodos.docx* foi escrito antes da implementação do parser. Esta lista indica o que mudou e onde, para que o texto reflita o que foi realmente implementado. Os números de seção, quadros e decisões são os do documento.

## 1. Divergências que precisam ser corrigidas

| Onde | O documento diz | O que existe agora |
|---|---|---|
| 1.1, 2.5 (item 1), Quadros 4 e 8, 3.4 | O scanner (`backend/scanner.py`), `test_scanner.py`, `test_analise_lexica.py`, `docs/ANALISE-LEXICA.md` e `docs/REGISTRO-TESTES.md` já existiam (Etapa 3) | Na versão do repositório usada como base, **nenhum desses arquivos existia**: o backend só validava a entrada. O scanner foi implementado **junto com o parser**, seguindo a descrição do documento (regras, categorias e erros CT-08 a CT-10). Ajuste o histórico ou, se houver outra versão do scanner, reconcilie as duas. |
| 3.3, "Contrato de comunicação" | Campos planejados: `tokens` e `erros` no nível principal, mais `arvore`, `erros_sintaticos` e `analise_sintatica_executada` | O contrato segue o formato do roteiro do professor: `sucesso`, `lexico {sucesso, tokens, erros}` e `sintatico {executado, sucesso, ast, erros, passos, ...}`. `analise_sintatica_executada` virou `sintatico.executado`. Os campos da Etapa 2 foram mantidos (ver `docs/API.md`). |
| Quadro 5 e D8 | Visualização da AST: "D3.js, Mermaid ou Graphviz (decisão pendente)" | **Decidido:** árvore hierárquica navegável em HTML/CSS/JS puro, sem biblioteca, renderizada no navegador. Justificativa em `docs/ANALISE-SINTATICA.md` (D8): interação (expandir, teclado, destaque do trecho) e acessibilidade (`role="tree"`), sem dependência nova. |
| D3 | Os nós representam operadores, identificadores, números, textos e atribuições | Acrescentado o nó **AGRUPAMENTO** para os parênteses (CT-26 pede "quatro níveis aninhados"; mostra onde os parênteses mudam a organização). `EXPR'`, `TERMO'`, `=` e o fim de linha continuam fora da AST. |
| Quadro 8 | `parser.py` e `arvore.py` "planejados" | Implementados. Novos: `backend/gramatica.py` (FIRST, FOLLOW e tabela M **calculados** e verificados) e `frontend/analise.js` (exibição). |
| Quadro 4 | Funcionalidades da Etapa 4 "planejadas" | Disponíveis: parser LL(1) com tabela M exibida; AST passo a passo com destaque do trecho; explicação do erro com posição, tokens esperados, regra e célula de M; separação visual entre erros léxicos e sintáticos. |
| Quadro 9, 3.6 ("Estado atual") | Parser "planejado"; 192/206 testes | 28 dos 30 casos aprovados (CT-29 e CT-30 ficam para a Etapa 5). Backend: 247 testes; frontend: 229; todos aprovados em 24/11/2026. Docker Compose e instalação limpa **ainda pendentes** (`docs/REGISTRO-TESTES.md`). |
| Apêndice A, CT-01 | Tokens "IDENTIFICADOR, OPERADOR, LITERAL_INTEIRO" | O token do `=` chama-se `OPERADOR_ATRIBUICAO`. |
| Apêndice A, CT-17 e CT-19 | "esperado identificador" | Os esperados são "identificador ou fim do código", como manda a tabela M (`LISTA_ATRIB → ε` com `$`). Explicação em `casos-de-teste.md`. |
| Figura 2 | Fluxo com parser e AST "pendentes" | Use `docs/etapa4/fluxograma.png` (só a análise semântica aparece como pendente). |

## 2. Decisões técnicas a registrar em Materiais e Métodos

- **Estratégia do parser:** preditivo LL(1) não recursivo (pilha + tabela M), implementado à mão; FIRST, FOLLOW e M calculados a partir das produções, com teste automático de ausência de conflitos. Construção da AST por **ações semânticas** intercaladas nas produções (esquema de tradução dirigido pela sintaxe).
- **Tokens esperados (critério C6):** calculados testando cada terminal a partir do estado da pilha após o último token consumido. O conjunto é exato: inclui o que as produções ε aplicadas antes do erro permitiriam e exclui `)` fora de parênteses.
- **Mensagens:** formato "Erro sintático na linha L, coluna C: era esperado …, mas o parser encontrou …", mais uma explicação em linguagem acessível que termina com a causa formal (célula vazia de M ou terminal do topo que não casou, com a regra).
- **Fim de linha implícito:** se o código não termina com quebra de linha, o parser acrescenta uma `NOVA_LINHA` implícita (como o tokenizador do Python), para atender CT-25.
- **Limites:** 100.000 caracteres; 200 parênteses aninhados (mesmo limite do CPython); AST enviada até 100 níveis (limite do serializador JSON, que foi descoberto por teste e tratado com aviso, sem erro 500); passo a passo com 2.000 passos.
- **Árvore parcial:** em caso de erro, o passo a passo mostra as subárvores já construídas, o que permite ao estudante ver até onde o código foi reconhecido.

## 3. Diferencial (Seção 2.5)

Os itens 2, 3 e 4 da Seção 2.5 (tabela M exibida, AST passo a passo com o trecho do código, explicação do erro com os tokens esperados) agora estão **implementados**. Continuam sendo uma **hipótese de contribuição** até a avaliação (C7, C8, C11, C16): implementar não comprova ganho didático. Sugestão de redação: "implementado e verificado por testes automatizados; a contribuição percebida será avaliada com estudantes".

## 4. O que o roteiro pede para o artigo e ainda depende de você

- Pesquisar e resumir artigos sobre parsers, geradores de parser e visualização de árvores, comparando com o sistema (roteiro, seção 10). Esta atualização do software não incluiu pesquisa bibliográfica nova.
- Inserir o fluxograma e atualizar os quadros e o Apêndice A conforme a tabela da seção 1.
- Executar o Docker Compose, a instalação limpa e o roteiro de celular, e registrar os resultados.
