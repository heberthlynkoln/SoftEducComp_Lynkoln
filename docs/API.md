# Contrato da API

Comunicação entre o **frontend** (HTML/JS servido pelo Nginx) e o **backend** (FastAPI).

```
Navegador ──POST /api/analisar──▶ Nginx (:8080) ──proxy /api/──▶ Backend (:8000)
          ◀────── JSON ──────────                ◀────── JSON ──────
```

O navegador sempre fala com o Nginx (mesma origem, sem CORS). O Nginx encaminha tudo que começa com `/api/` ao serviço `backend`. A porta 8000 também é publicada, só para testes diretos.

> **Nesta etapa o backend não faz análise léxica, sintática ou semântica.** Ele valida a entrada, não executa o código e devolve o texto recebido com algumas estatísticas. Código com erros de sintaxe **é aceito**: detectá-los será trabalho das próximas etapas.

Documentação interativa gerada automaticamente: <http://localhost:8080/api/docs>.

## Convenções

- Corpo e resposta em JSON, UTF-8. Requisições com corpo devem enviar `Content-Type: application/json`.
- Todo erro usa o **mesmo formato** (veja abaixo) e inclui `"recebido": false`.
- Campos novos poderão ser **acrescentados** às respostas nas próximas etapas (por exemplo, tokens e árvore). Os campos atuais não mudarão de nome nem de significado.

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

```json
{
  "recebido": true,
  "mensagem": "Código recebido com sucesso.",
  "codigo": "x = 5\ntotal = preco * (qtd + 1)\n",
  "estatisticas": { "linhas": 2, "caracteres": 30, "bytes": 30 }
}
```

| Campo | Tipo | Descrição |
|---|---|---|
| `recebido` | boolean | Sempre `true` nas respostas 200. |
| `mensagem` | string | Texto legível para exibir ao usuário. |
| `codigo` | string | Eco do código, **idêntico** ao enviado. A interface compara os dois e sinaliza divergência. |
| `estatisticas.linhas` | inteiro | Linhas, separadas por `\n`, `\r\n` ou `\r`; um terminador final não conta como linha extra. |
| `estatisticas.caracteres` | inteiro | Pontos de código Unicode. |
| `estatisticas.bytes` | inteiro | Tamanho em UTF-8. |

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
| `sucesso` | HTTP 200 com o formato esperado | `mensagem`, estatísticas e o código recebido |
| `rejeitado` | O backend respondeu com erro no formato padrão (400/413/422…) | `erro.mensagem` e `erro.codigo` com o status HTTP |
| `falha` (`rede`) | Sem conexão com o servidor | "Não foi possível comunicar com o servidor. Verifique a conexão e tente novamente." |
| `falha` (`tempo`) | Sem resposta em 10 s | "O servidor demorou demais para responder" |
| `falha` (`http`) | Erro HTTP sem o formato padrão (ex.: 502 do Nginx) | "O servidor respondeu com um erro inesperado" e o código HTTP |
| `falha` (`resposta-invalida`) | HTTP 200 com corpo fora do contrato | "Resposta inesperada do backend" |

Texto vazio ou só com espaços é barrado na própria interface ("Informe um código-fonte antes de solicitar a análise."), sem chegar a ser enviado; o backend o valida de novo, e nenhuma regra depende só do cliente.

Qualquer exceção não prevista dentro da própria interface é capturada: a tela mostra "Ocorreu um erro inesperado ao analisar o código.", mantém o código no editor e libera o botão **Analisar**. As mensagens exibidas ao usuário não trazem comandos, caminhos internos nem detalhes técnicos; esses detalhes ficam no log do backend.

## Teste manual com `curl`

```bash
# sucesso
curl -s -X POST http://localhost:8080/api/analisar -H 'Content-Type: application/json' \
     -d '{"codigo": "x = 5 +"}'

# erro de validação (422)
curl -s -i -X POST http://localhost:8080/api/analisar -H 'Content-Type: application/json' \
     -d '{"codigo": "   "}'
```

Ou rode `scripts/verificar-integracao.sh`, que testa esses cenários passando pelo Nginx.
