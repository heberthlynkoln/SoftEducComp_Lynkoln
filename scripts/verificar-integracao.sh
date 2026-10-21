#!/usr/bin/env bash
# Verifica a comunicação real frontend → Nginx → backend com a aplicação rodando
# (docker compose up --build). Uso: scripts/verificar-integracao.sh [URL_BASE]
set -u
BASE="${1:-http://localhost:8080}"
falhas=0

checar() {  # descrição, status esperado, trecho esperado no corpo, método, caminho, [corpo]
  local desc="$1" status_esp="$2" trecho="$3" metodo="$4" caminho="$5" corpo="${6:-}"
  local args=(-s -o /tmp/resp.$$ -w '%{http_code}' -X "$metodo" "$BASE$caminho")
  [ -n "$corpo" ] && args+=(-H 'Content-Type: application/json' -d "$corpo")
  local status; status=$(curl "${args[@]}")
  if [ "$status" = "$status_esp" ] && grep -q -- "$trecho" /tmp/resp.$$; then
    echo "OK    $desc"
  else
    echo "FALHA $desc (HTTP $status, esperado $status_esp; corpo: $(head -c 200 /tmp/resp.$$))"
    falhas=$((falhas + 1))
  fi
}

checar "health"                        200 '"status":"ok"'            GET  /api/health
checar "código válido"                 200 '"recebido":true'          POST /api/analisar '{"codigo":"x = 5\n"}'
checar "código com erro é aceito"      200 '"recebido":true'          POST /api/analisar '{"codigo":"x = 5 +"}'
checar "texto vazio"                   422 'CODIGO_VAZIO'             POST /api/analisar '{"codigo":""}'
checar "só espaços"                    422 'CODIGO_APENAS_ESPACOS'    POST /api/analisar '{"codigo":"  \n "}'
checar "campo ausente"                 422 'CAMPO_OBRIGATORIO'        POST /api/analisar '{}'
checar "tipo inválido"                 422 'CAMPO_INVALIDO'           POST /api/analisar '{"codigo":42}'
checar "corpo que não é JSON"          400 'CORPO_INVALIDO'           POST /api/analisar 'isto nao e json'
checar "método não permitido"          405 'METODO_NAO_PERMITIDO'     GET  /api/analisar
checar "rota inexistente"              404 'ROTA_NAO_ENCONTRADA'      GET  /api/nao-existe
checar "página do frontend"            200 'Visualizador'             GET  /

rm -f /tmp/resp.$$
[ "$falhas" -eq 0 ] && echo "Tudo certo." || { echo "$falhas verificação(ões) falharam."; exit 1; }
