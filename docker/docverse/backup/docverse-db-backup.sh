#!/usr/bin/env bash
# Backup do Postgres do Docverse (volume docverse-db, container docverse-db).
#
# Gera um dump no formato custom do pg_dump (comprimido, restaurável com pg_restore),
# confere que o arquivo é legível e apaga backups antigos conforme a retenção.
# As credenciais não ficam aqui: o pg_dump roda dentro do container e usa as
# variáveis POSTGRES_USER/POSTGRES_DB que o próprio container já tem.
#
# Variáveis (todas opcionais):
#   DOCVERSE_DB_CONTAINER   container do Postgres            (padrão: docverse-db)
#   DOCVERSE_BACKUP_DIR     pasta de destino                 (padrão: /mnt/hd2tb/backups/docverse)
#   DOCVERSE_BACKUP_RETENTION_DAYS  apaga dumps mais velhos que N dias (padrão: 14)
#   DOCVERSE_BACKUP_KEEP_MIN        mas sempre mantém os N dumps mais recentes (padrão: 7)
#
# Restauração: docker/docverse/backup/README.md
set -euo pipefail

CONTAINER="${DOCVERSE_DB_CONTAINER:-docverse-db}"
BACKUP_DIR="${DOCVERSE_BACKUP_DIR:-/mnt/hd2tb/backups/docverse}"
RETENTION_DAYS="${DOCVERSE_BACKUP_RETENTION_DAYS:-14}"
KEEP_MIN="${DOCVERSE_BACKUP_KEEP_MIN:-7}"
PREFIX="docverse-db"

log() {
  echo "[docverse-backup] $*"
}

fail() {
  echo "[docverse-backup] ERRO: $*" >&2
  exit 1
}

for value in "$RETENTION_DAYS" "$KEEP_MIN"; do
  if ! [[ "$value" =~ ^[0-9]+$ ]]; then
    fail "retenção inválida: '$value' (use números inteiros)"
  fi
done

umask 077
mkdir -p "$BACKUP_DIR"

# Impede duas execuções ao mesmo tempo (timer + execução manual, por exemplo).
exec 9>"$BACKUP_DIR/.lock"
if ! flock -n 9; then
  fail "outro backup já está em andamento"
fi

if [ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null)" != "true" ]; then
  fail "container '$CONTAINER' não está rodando"
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$BACKUP_DIR/$PREFIX-$timestamp.dump"
partial="$target.partial"

trap 'rm -f "$partial"' EXIT

log "gerando dump de '$CONTAINER' em $target"
docker exec "$CONTAINER" sh -c 'pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --compress=6 --no-owner' >"$partial"

# Um dump truncado ou corrompido falha aqui, antes de substituir qualquer coisa.
if ! docker exec -i "$CONTAINER" pg_restore --list <"$partial" >/dev/null; then
  fail "dump gerado não passou no pg_restore --list"
fi

mv "$partial" "$target"
trap - EXIT
log "ok: $(du -h "$target" | cut -f1)"

# Retenção: apaga dumps mais velhos que RETENTION_DAYS, preservando sempre os KEEP_MIN mais recentes.
mapfile -t dumps < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$PREFIX-*.dump" -printf '%T@ %p\n' | sort -rn | cut -d' ' -f2-)

removed=0
for index in "${!dumps[@]}"; do
  if [ "$index" -lt "$KEEP_MIN" ]; then
    continue
  fi

  file="${dumps[$index]}"

  if [ -n "$(find "$file" -maxdepth 0 -mtime +"$RETENTION_DAYS")" ]; then
    rm -f -- "$file"
    removed=$((removed + 1))
    log "retenção: removido $(basename "$file")"
  fi
done

log "concluído: $((${#dumps[@]} - removed)) dump(s) em $BACKUP_DIR"
