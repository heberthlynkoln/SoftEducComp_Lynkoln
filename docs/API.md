# Contrato da API

Comunicação entre o **frontend** (HTML/JS servido pelo Nginx) e o **backend** (FastAPI).

```
Navegador ──POST /api/analisar──▶ Nginx (:8080) ──proxy /api/──▶ Backend (:8000)
          ◀────── JSON ──────────                ◀────── JSON ──────
```

O navegador sempre fala com o Nginx (mesma origem, sem CORS). O Nginx encaminha tudo que começa com `/api/` ao serviço `backend`. A porta 8000 também é publicada, só para testes diretos.

> O backend valida a entrada, executa a **análise léxica** (scanner) e, se não houver erro léxico, a **análise sintática** (parser LL(1)), e devolve tokens, AST e erros. O código **nunca é executado**. Código com erros **é aceito** (HTTP 200): os erros léxicos e sintáticos fazem parte do resultado. A análise semântica ainda não existe (Etapa 5).

Documentação interativa gerada automaticamente: <http://localhost:8080/api/docs>.

## Convenções

- Corpo e resposta em JSON, UTF-8. Requisições com corpo devem enviar `Content-Type: application/json`.
- Todo erro usa o **mesmo formato** (veja abaixo) e inclui `"recebido": false`.
- Campos novos são sempre **acrescentados**. Os campos `recebido`, `mensagem`, `codigo` e `estatisticas` das etapas anteriores continuam com o mesmo nome e significado; a análise entrou nos campos novos `sucesso`, `lexico` e `sintatico`.

## `POST /api/analisar`

Recebe o código-fonte como texto puro e devolve o resultado das análises léxica e sintática.

### Requisição

```json
{ "codigo": "x = 5\ntotal = preco * (qtd + 1)\n" }
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `codigo` | string | sim | Código-fonte. Guardado exatamente como enviado (sem `strip`, sem normalização). Máximo de 100.000 caracteres. Campos extras são ignorados. |

### Resposta de sucesso — `200 OK`

A requisição foi processada. O **programa** pode ser válido ou ter erros; veja `sucesso`, `lexico` e `sintatico`.

```json
{
  "recebido": true,
  "mensagem": "Código recebido com sucesso.",
  "codigo": "x = 10 + 5 * 2\n",
  "estatisticas": { "linhas": 1, "caracteres": 15, "bytes": 15 },
  "sucesso": true,
  "lexico": {
    "sucesso": true,
    "tokens": [
      { "tipo": "IDENTIFICADOR", "lexema": "x", "linha": 1, "coluna": 1 },
      { "tipo": "OPERADOR_ATRIBUICAO", "lexema": "=", "linha": 1, "coluna": 3 },
      { "tipo": "LITERAL_INTEIRO", "lexema": "10", "linha": 1, "coluna": 5 },
      "…",
      { "tipo": "QUEBRA_DE_LINHA", "lexema": "\n", "linha": 1, "coluna": 15 }
    ],
    "erros": []
  },
  "sintatico": {
    "executado": true,
    "sucesso": true,
    "ast": {
      "id": "n8", "tipo": "PROGRAMA", "rotulo": "Programa",
      "linha": 1, "coluna": 1, "linha_fim": 1, "coluna_fim": 14,
      "regra": "PROGRAMA → LISTA_ATRIB; LISTA_ATRIB → ATRIB LISTA_ATRIB | ε",
      "atributos": { "quantidade_atribuicoes": 1 },
      "filhos": [ { "id": "n7", "tipo": "ATRIBUICAO", "...": "..." } ]
    },
    "arvore_parcial": [],
    "erros": [],
    "avisos": [],
    "motivo": null,
    "estatisticas": { "nos": 8, "profundidade": 5 },
    "passos": [ { "numero": 1, "tipo": "inicio", "pilha": ["$", "PROGRAMA"], "entrada": ["x", "=", "10", "…"], "acao": "…", "producao": null, "celula": null, "token": null, "no_criado": null } ],
    "passos_truncados": false,
    "total_passos": 34
  }
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `recebido` | boolean | Sempre `true` nas respostas 200. *(Etapa 2)* |
| `mensagem` | string | Texto legível sobre o recebimento. *(Etapa 2)* |
| `codigo` | string | Eco do código, **idêntico** ao enviado. A interface compara os dois e sinaliza divergência. *(Etapa 2)* |
| `estatisticas.linhas` | inteiro | Linhas, separadas por `\n`, `\r\n` ou `\r`; um terminador final não conta como linha extra. *(Etapa 2)* |
| `estatisticas.caracteres` | inteiro | Pontos de código Unicode. *(Etapa 2)* |
| `estatisticas.bytes` | inteiro | Tamanho em UTF-8. *(Etapa 2)* |
| `sucesso` | boolean | `true` se não houve erro léxico **nem** sintático. |
| `lexico.sucesso` | boolean | `true` se não houve erro léxico. |
| `lexico.tokens[]` | lista | `{tipo, lexema, linha, coluna}`; categorias em [ANALISE-LEXICA.md](ANALISE-LEXICA.md). Mesmo com erros léxicos, os tokens válidos são devolvidos. |
| `lexico.erros[]` | lista | `{tipo: "ERRO_LEXICO", codigo, lexema, linha, coluna, mensagem}`; `codigo` é `CARACTERE_INVALIDO`, `NUMERO_MALFORMADO`, `STRING_NAO_FECHADA` ou `STRING_NAO_SUPORTADA`. |
| `sintatico.executado` | boolean | `false` quando há erros léxicos: o parser **não roda** (decisão D1); `motivo` explica. |
| `sintatico.sucesso` | boolean | `true` se o programa segue a gramática. |
| `sintatico.ast` | objeto ou `null` | AST (formato em [ANALISE-SINTATICA.md](ANALISE-SINTATICA.md#3-estrutura-da-ast)). `null` se houver erro, se o parser não rodou, ou se a árvore passar de 100 níveis (nesse caso, `avisos` explica). |
| `sintatico.arvore_parcial[]` | lista | Em caso de erro sintático: subárvores construídas antes do erro. |
| `sintatico.erros[]` | lista | No máximo um erro (sem recuperação, decisão D4), com `linha`, `coluna`, `linha_fim`, `coluna_fim`, `encontrado`, `encontrado_tipo`, `esperado` (legível), `esperados_terminais`, `regra`, `celula_tabela` (`{nao_terminal, terminal}` ou `null`), `token` (índice em `lexico.tokens`, ou `null` no fim do código), `mensagem` e `explicacao`. |
| `sintatico.avisos[]` | lista de strings | Observações que não são erros. |
| `sintatico.estatisticas` | objeto ou `null` | `{nos, profundidade}` da AST, quando o programa é válido. |
| `sintatico.passos[]` | lista | Passo a passo do parser LL(1): `numero`, `tipo` (`inicio`, `expandir`, `casar`, `acao`, `aceitar`, `erro`), `pilha` (topo à direita), `entrada`, `acao`, `producao`, `celula`, `token`, `no_criado`. Até 2.000 passos. |
| `sintatico.passos_truncados` / `total_passos` | boolean / inteiro | Se houve mais passos do que os enviados, e quantos. |

**Exemplo com erro sintático** (`"x = 5 +"`): `sucesso: false`, `lexico.sucesso: true`, e

```json
"sintatico": {
  "executado": true, "sucesso": false, "ast": null,
  "erros": [ {
    "tipo": "ERRO_SINTATICO", "linha": 1, "coluna": 8, "linha_fim": 1, "coluna_fim": 8,
    "encontrado": "fim do código", "encontrado_tipo": "FIM",
    "esperado": ["identificador", "número", "string", "("],
    "esperados_terminais": ["identificador", "numero", "string", "("],
    "regra": "TERMO → FATOR TERMO'",
    "celula_tabela": { "nao_terminal": "TERMO", "terminal": "NOVA_LINHA" },
    "token": null,
    "mensagem": "Erro sintático na linha 1, coluna 8: o código terminou antes de a construção ser concluída; era esperado identificador, número, string ou '('.",
    "explicacao": "O operador '+' precisa de um operando à direita, mas o código terminou. …"
  } ],
  "...": "..."
}
```

**Exemplo com erro léxico** (`"x = 1 @ 2"`): `lexico.erros` tem o `CARACTERE_INVALIDO` na linha 1, coluna 7; `sintatico` vem com `executado: false`, `ast: null`, `erros: []`, `passos: []` e `motivo: "A análise sintática não foi executada porque há erros léxicos. …"`.

### Resposta de erro

```json
{
  "recebido": false,
  "erro": {
    "codigo": "CODIGO_VAZIO",
    "mensagem": "Nenhum código foi informado.",
    "detalhes": [ { "campo": "codigo", "problema": "Nenhum código foi informado." } ]
  }
}
```

`erro.codigo` é um identificador estável (use-o em programas); `erro.mensagem` é para pessoas; `erro.detalhes` pode estar vazio.

| HTTP | `erro.codigo` | Quando acontece |
|---|---|---|
| 400 | `CORPO_INVALIDO` | Corpo ausente, que não é JSON ou que não é um objeto JSON. |
| 413 | `CODIGO_MUITO_LONGO` | `codigo` com mais de 100.000 caracteres. |
| 422 | `CAMPO_OBRIGATORIO` | Campo `codigo` ausente. |
| 422 | `CAMPO_INVALIDO` | `codigo` presente, mas que não é texto (número, `null`, lista…). |
| 422 | `CODIGO_VAZIO` | `codigo` é `""`. |
| 422 | `CODIGO_APENAS_ESPACOS` | `codigo` só tem espaços, tabulações ou quebras de linha. |
| 422 | `CODIGO_INVALIDO` | `codigo` contém caracteres que não podem ser codificados como texto UTF-8 (por exemplo, surrogates isolados como `\ud800`). |
| 404 | `ROTA_NAO_ENCONTRADA` | Rota inexistente. |
| 405 | `METODO_NAO_PERMITIDO` | Método diferente de `POST` em `/api/analisar`. |
| 500 | `ERRO_INTERNO` | Falha inesperada. Detalhes internos não são expostos (ficam no log do backend). |

## Outras rotas

| Rota | Resposta | Uso |
|---|---|---|
| `GET /api/gramatica` | `200` com `simbolo_inicial`, `nao_terminais`, `terminais[]` (`simbolo`, `descricao`, `token`), `producoes[]` (`numero`, `esquerda`, `direita`, `texto`), `first`, `follow`, `tabela` (`{NT: {terminal: nº da produção}}`) e `ll1` | Aba "Gramática e tabela M" da interface. Calculado a partir das produções. |
| `GET /api/health` | `200 {"status": "ok"}` | Healthcheck do Docker e indicador "Backend conectado" da interface. |
| `GET /api/hello` | `200 {"message": "Hello, World!"}` | Rota da Etapa 1, mantida. |

## Como o frontend usa o contrato

`frontend/api.js` concentra a comunicação (`ApiCompiladores.enviarCodigo`) e devolve sempre um destes resultados, para `app.js` só se preocupar em exibir:

| `tipo` | Significado | O usuário vê |
|---|---|---|
| `sucesso` | HTTP 200 com o formato esperado (incluindo `lexico` e `sintatico`) | `mensagem`, estatísticas, resumo da análise, blocos de erro por fase e a seção 3 (código destacado, AST, tokens, passo a passo e tabela M) |
| `rejeitado` | O backend respondeu com erro no formato padrão (400/413/422…) | `erro.mensagem` e `erro.codigo` com o status HTTP |
| `falha` (`rede`) | Sem conexão com o servidor | "Não foi possível comunicar com o servidor. Verifique a conexão e tente novamente." |
| `falha` (`tempo`) | Sem resposta em 10 s | "O servidor demorou demais para responder" |
| `falha` (`http`) | Erro HTTP sem o formato padrão (ex.: 502 do Nginx) | "O servidor respondeu com um erro inesperado" e o código HTTP |
| `falha` (`resposta-invalida`) | HTTP 200 com corpo fora do contrato | "Resposta inesperada do backend" |

Texto vazio ou só com espaços é barrado na própria interface ("Informe um código-fonte antes de solicitar a análise."), sem chegar a ser enviado; o backend o valida de novo, e nenhuma regra depende só do cliente.

Qualquer exceção não prevista dentro da própria interface é capturada: a tela mostra "Ocorreu um erro inesperado ao analisar o código.", mantém o código no editor e libera o botão **Analisar**. As mensagens exibidas ao usuário não trazem comandos, caminhos internos nem detalhes técnicos; esses detalhes ficam no log do backend.

## Teste manual com `curl`

```bash
# programa válido
curl -s -X POST http://localhost:8080/api/analisar -H 'Content-Type: application/json' \
     -d '{"codigo": "x = 10 + 5 * 2"}'

# erro sintático (HTTP 200, com sintatico.erros)
curl -s -X POST http://localhost:8080/api/analisar -H 'Content-Type: application/json' \
     -d '{"codigo": "x = 5 +"}'

# gramática e tabela M
curl -s http://localhost:8080/api/gramatica

# erro de validação (422)
curl -s -i -X POST http://localhost:8080/api/analisar -H 'Content-Type: application/json' \
     -d '{"codigo": "   "}'
```

Ou rode `scripts/verificar-integracao.sh`, que testa esses cenários passando pelo Nginx.
