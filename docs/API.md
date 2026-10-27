# Contrato da API

Comunicação entre o **frontend** (HTML/JS servido pelo Nginx) e o **backend** (FastAPI).

```
Navegador ──POST /api/analisar──▶ Nginx (:8080) ──proxy /api/──▶ Backend (:8000)
          ◀────── JSON ──────────                ◀────── JSON ──────
```

O navegador sempre fala com o Nginx (mesma origem, sem CORS). O Nginx encaminha tudo que começa com `/api/` ao serviço `backend`. A porta 8000 também é publicada, só para testes diretos.

> **Nesta etapa o backend faz a análise léxica** (veja [ANALISE-LEXICA.md](ANALISE-LEXICA.md)): devolve os tokens e os erros léxicos do código. A análise **sintática** ainda não existe: código com erros de sintaxe, mas tokens válidos, é tokenizado normalmente e será verificado na Etapa 4.

Documentação interativa gerada automaticamente: <http://localhost:8080/api/docs>.

## Convenções

- Corpo e resposta em JSON, UTF-8. Requisições com corpo devem enviar `Content-Type: application/json`.
- Todo erro usa o **mesmo formato** (veja abaixo) e inclui `"recebido": false`.
- Campos novos podem ser **acrescentados** às respostas. Os campos existentes não mudam de nome nem de significado. Na Etapa 3 foram acrescentados `sucesso`, `tokens` e `erros` ao `200`.

## `POST /api/analisar`

Recebe o código-fonte como texto puro.

### Requisição

```json
{ "codigo": "x = 5\ntotal = preco * (qtd + 1)\n" }
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `codigo` | string | sim | Código-fonte. Guardado exatamente como enviado (sem `strip`, sem normalização). Máximo de 100.000 caracteres. Campos extras são ignorados. |

### Resposta de sucesso — `200 OK`

Um `200` significa que a requisição foi **recebida e processada**, e não que o código esteja correto. Erros léxicos aparecem na lista `erros` e fazem `sucesso` ser `false`, sempre com HTTP 200.

```json
{
  "recebido": true,
  "sucesso": true,
  "mensagem": "Código recebido com sucesso.",
  "codigo": "x = 5\ntotal = preco * (qtd + 1)\n",
  "estatisticas": { "linhas": 2, "caracteres": 30, "bytes": 30 },
  "tokens": [
    { "tipo": "IDENTIFICADOR", "lexema": "x", "linha": 1, "coluna": 1 },
    { "tipo": "OPERADOR", "lexema": "=", "linha": 1, "coluna": 3 },
    { "tipo": "LITERAL_INTEIRO", "lexema": "5", "linha": 1, "coluna": 5 },
    { "tipo": "QUEBRA_DE_LINHA", "lexema": "\n", "linha": 1, "coluna": 6 }
  ],
  "erros": []
}
```

Exemplo com erro léxico (`x = 1 @ 2`):

```json
{
  "recebido": true,
  "sucesso": false,
  "mensagem": "Código recebido com sucesso.",
  "codigo": "x = 1 @ 2",
  "estatisticas": { "linhas": 1, "caracteres": 9, "bytes": 9 },
  "tokens": [
    { "tipo": "IDENTIFICADOR", "lexema": "x", "linha": 1, "coluna": 1 },
    { "tipo": "OPERADOR", "lexema": "=", "linha": 1, "coluna": 3 },
    { "tipo": "LITERAL_INTEIRO", "lexema": "1", "linha": 1, "coluna": 5 },
    { "tipo": "LITERAL_INTEIRO", "lexema": "2", "linha": 1, "coluna": 9 }
  ],
  "erros": [
    { "tipo": "ERRO_LEXICO", "lexema": "@", "linha": 1, "coluna": 7, "mensagem": "Caractere não reconhecido: '@'" }
  ]
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `recebido` | boolean | Sempre `true` nas respostas 200. |
| `sucesso` | boolean | `true` quando a análise léxica não encontrou erros (`erros` vazio). Não indica validade sintática. |
| `mensagem` | string | Confirmação de recebimento, para exibir ao usuário. |
| `codigo` | string | Eco do código, **idêntico** ao enviado. A interface compara os dois e sinaliza divergência. |
| `estatisticas.linhas` | inteiro | Linhas, separadas por `\n`, `\r\n` ou `\r`; um terminador final não conta como linha extra. |
| `estatisticas.caracteres` | inteiro | Pontos de código Unicode. |
| `estatisticas.bytes` | inteiro | Tamanho em UTF-8. |
| `tokens` | lista de `Token` | Tokens em ordem de aparição. Lista vazia se o código só tem espaços e comentários (não ocorre com código vazio, que é `422`). |
| `erros` | lista de `ErroLexico` | Erros léxicos em ordem de aparição. Vazia quando `sucesso` é `true`. |

**`Token`**

| Campo | Tipo | Descrição |
|---|---|---|
| `tipo` | string | `PALAVRA_RESERVADA`, `IDENTIFICADOR`, `LITERAL_INTEIRO`, `LITERAL_REAL`, `LITERAL_STRING`, `OPERADOR`, `DELIMITADOR` ou `QUEBRA_DE_LINHA`. |
| `lexema` | string | Trecho exato do código que originou o token. |
| `linha` | inteiro ≥ 1 | Linha em que o token começa (base 1). |
| `coluna` | inteiro ≥ 1 | Coluna em que o token começa (base 1; conta caracteres). |

**`ErroLexico`**

| Campo | Tipo | Descrição |
|---|---|---|
| `tipo` | string | Sempre `ERRO_LEXICO`. |
| `lexema` | string | Trecho problemático. |
| `linha`, `coluna` | inteiro ≥ 1 | Onde o erro começa. |
| `mensagem` | string | Mensagem para o usuário, por exemplo `Caractere não reconhecido: '@'`. |

As categorias e regras completas estão em [ANALISE-LEXICA.md](ANALISE-LEXICA.md).

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
| `GET /api/health` | `200 {"status": "ok"}` | Healthcheck do Docker e indicador "Backend conectado" da interface. |
| `GET /api/hello` | `200 {"message": "Hello, World!"}` | Rota da Etapa 1, mantida. |

## Como o frontend usa o contrato

`frontend/api.js` concentra a comunicação (`ApiCompiladores.enviarCodigo`) e devolve sempre um destes resultados, para `app.js` só se preocupar em exibir:

| `tipo` | Significado | O usuário vê |
|---|---|---|
| `sucesso` | HTTP 200 com o formato esperado | tabela de tokens, código com tokens destacados, contagem por categoria e, quando houver, a lista de erros léxicos |
| `rejeitado` | O backend respondeu com erro no formato padrão (400/413/422…) | `erro.mensagem` e `erro.codigo` com o status HTTP |
| `falha` (`rede`) | Sem conexão com o servidor | "Não foi possível comunicar com o servidor. Verifique a conexão e tente novamente." |
| `falha` (`tempo`) | Sem resposta em 10 s | "O servidor demorou demais para responder" |
| `falha` (`http`) | Erro HTTP sem o formato padrão (ex.: 502 do Nginx) | "O servidor respondeu com um erro inesperado" e o código HTTP |
| `falha` (`resposta-invalida`) | HTTP 200 com corpo fora do contrato (inclui `sucesso` que não bate com `erros`) | "Resposta inesperada do backend" |

Quando `sucesso` é `false`, a interface mostra o estado de erro (`role="alert"`), a lista de erros com linha e coluna, e o código com os trechos errados destacados. Os tokens válidos continuam na tabela.

Texto vazio ou só com espaços é barrado na própria interface ("Informe um código-fonte antes de solicitar a análise."), sem chegar a ser enviado; o backend o valida de novo, e nenhuma regra depende só do cliente.

Qualquer exceção não prevista dentro da própria interface é capturada: a tela mostra "Ocorreu um erro inesperado ao analisar o código.", mantém o código no editor e libera o botão **Analisar**. As mensagens exibidas ao usuário não trazem comandos, caminhos internos nem detalhes técnicos; esses detalhes ficam no log do backend.

## Teste manual com `curl`

```bash
# sucesso: tokens e nenhum erro léxico
curl -s -X POST http://localhost:8080/api/analisar -H 'Content-Type: application/json' \
     -d '{"codigo": "x = 5 +"}'

# erro léxico: HTTP 200 com sucesso false e a lista de erros
curl -s -X POST http://localhost:8080/api/analisar -H 'Content-Type: application/json' \
     -d '{"codigo": "x = 1 @ 2"}'

# erro de validação (422)
curl -s -i -X POST http://localhost:8080/api/analisar -H 'Content-Type: application/json' \
     -d '{"codigo": "   "}'
```

Ou rode `scripts/verificar-integracao.sh`, que testa esses cenários passando pelo Nginx.
