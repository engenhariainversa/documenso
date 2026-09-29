#!/usr/bin/env bash
# Restaura um dump gerado por docverse-db-backup.sh.
#
# ATENÇÃO: apaga o banco POSTGRES_DB do container de destino e o recria a partir do dump.
# Pare o app antes (docker stop docverse-app) e siga o passo a passo do README.md desta pasta.
#
# Uso:
#   docverse-db-restore.sh <arquivo.dump> --yes
#
# Variáveis:
#   DOCVERSE_DB_CONTAINER   container do Postgres de destino (padrão: docverse-db)
set -euo pipefail

CONTAINER="${DOCVERSE_DB_CONTAINER:-docverse-db}"
DUMP="${1:-}"
CONFIRM="${2:-}"

log() {
  echo "[docverse-restore] $*"
}

fail() {
  echo "[docverse-restore] ERRO: $*" >&2
  exit 1
}

if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  fail "informe um arquivo .dump existente. Uso: $0 <arquivo.dump> --yes"
fi

if [ "$CONFIRM" != "--yes" ]; then
  fail "isto apaga o banco do container '$CONTAINER'. Repita com --yes para confirmar."
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  fail "container '$CONTAINER' não está rodando"
fi

log "conferindo o dump $DUMP"
docker exec -i "$CONTAINER" pg_restore --list <"$DUMP" >/dev/null

log "recriando o banco no container '$CONTAINER'"
docker exec "$CONTAINER" sh -c 'dropdb --username="$POSTGRES_USER" --if-exists --force "$POSTGRES_DB" && createdb --username="$POSTGRES_USER" "$POSTGRES_DB"'

log "restaurando"
docker exec -i "$CONTAINER" sh -c 'pg_restore --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --no-owner --exit-on-error' <"$DUMP"

log "concluído"
