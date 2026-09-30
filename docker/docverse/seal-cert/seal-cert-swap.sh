#!/usr/bin/env bash
# Troca o certificado de selagem do Docverse em produção e sabe voltar atrás.
#
# Uso:
#   seal-cert-swap.sh status
#   seal-cert-swap.sh apply [<arquivo.pfx> [<arquivo-da-senha>]]
#   seal-cert-swap.sh rollback [<pasta-do-backup>]
#
# apply:    valida o .pfx (seal-cert-check.sh), guarda o certificado e a senha atuais
#           em <secrets>/seal-cert-backup/<data>/, instala o novo em <secrets>/cert.p12,
#           atualiza NEXT_PRIVATE_SIGNING_PASSPHRASE no .env.prod e recria só o container
#           do app. Se o app não voltar saudável com o certificado novo, desfaz sozinho.
# rollback: restaura o certificado e a senha de um backup (padrão: o mais recente).
#
# O compose não muda: o app continua lendo /opt/docverse/cert.p12, montado de
# <secrets>/cert.p12. Banco e volume não são tocados.
#
# Variáveis (todas opcionais):
#   DOCVERSE_PROD_DIR           checkout de produção (padrão: /mnt/hd2tb/projetos/documenso/prod)
#   DOCVERSE_SECRETS_DIR        pasta dos segredos   (padrão: /mnt/hd2tb/projetos/documenso/secrets)
#   DOCVERSE_APP_UID            uid do processo do app no container (padrão: 1001)
#   DOCVERSE_SEAL_SKIP_RESTART  1 = só mexe nos arquivos, sem recriar o container (testes)
#
# Procedimento completo: docker/docverse/seal-cert/README.md
set -euo pipefail

PROD_DIR="${DOCVERSE_PROD_DIR:-/mnt/hd2tb/projetos/documenso/prod}"
SECRETS_DIR="${DOCVERSE_SECRETS_DIR:-/mnt/hd2tb/projetos/documenso/secrets}"
APP_UID="${DOCVERSE_APP_UID:-1001}"
SKIP_RESTART="${DOCVERSE_SEAL_SKIP_RESTART:-0}"

ENV_FILE="$PROD_DIR/.env.prod"
CERT="$SECRETS_DIR/cert.p12"
BACKUP_ROOT="$SECRETS_DIR/seal-cert-backup"
PASS_VAR="NEXT_PRIVATE_SIGNING_PASSPHRASE"
APP_CONTAINER="docverse-app"
DB_CONTAINER="docverse-db"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { echo "[seal-cert-swap] $*"; }
fail() {
  echo "[seal-cert-swap] ERRO: $*" >&2
  exit 1
}

compose() {
  (cd "$PROD_DIR" && docker compose -f docker/docverse/compose.yml --profile prod "$@")
}

# Valor atual da senha no .env.prod, sem as aspas.
current_pass() {
  local line
  line="$(grep -E "^$PASS_VAR=" "$ENV_FILE" | tail -1)" || return 0
  line="${line#"$PASS_VAR="}"
  if [[ "$line" == \'*\' ]] || [[ "$line" == \"*\" ]]; then
    line="${line:1:${#line}-2}"
  fi
  printf '%s' "$line"
}

# Regrava só a linha da senha, entre aspas simples (o compose não interpola nem
# trata '#' e '$' dentro delas). O resto do .env.prod fica byte a byte igual.
write_pass() {
  local pass="$1" tmp found=0 line
  tmp="$(mktemp "$ENV_FILE.XXXXXX")"
  while IFS= read -r line || [ -n "$line" ]; do
    if [[ "$line" == "$PASS_VAR="* ]]; then
      printf "%s='%s'\n" "$PASS_VAR" "$pass"
      found=1
    else
      printf '%s\n' "$line"
    fi
  done <"$ENV_FILE" >"$tmp"
  [ "$found" = "1" ] || printf "%s='%s'\n" "$PASS_VAR" "$pass" >>"$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$ENV_FILE"

  # Confere que o compose enxerga exatamente a senha gravada. O "compose config"
  # imprime cada '$' do valor como '$$', daí o gsub.
  local resolved
  resolved="$(compose config --format json | jq -r ".services.app.environment.$PASS_VAR | gsub(\"\\\\$\\\\$\"; \"$\")")"
  if [ "$resolved" != "$pass" ]; then
    log "o compose não leu a senha como foi gravada no .env.prod"
    return 1
  fi
}

# Instala um .p12 em <secrets>/cert.p12: dono com leitura e escrita, leitura para o
# uid do app por ACL, nada para grupo e outros.
install_cert() {
  local src="$1" tmp="$CERT.new"
  cp "$src" "$tmp"
  chmod 600 "$tmp"
  setfacl -m "u:$APP_UID:r" "$tmp" || fail "setfacl falhou; sem ele o container (uid $APP_UID) não lê um arquivo 600"
  mv -f "$tmp" "$CERT"
}

user_count() {
  docker exec "$DB_CONTAINER" sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select count(*) from \"User\""'
}

app_fetch() {
  docker exec "$APP_CONTAINER" node -e "fetch('http://localhost:3000$1').then(async r=>{console.log(await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
}

# Recria só o app e espera ele responder com o certificado esperado carregado.
restart_and_verify() {
  local expected_sha="$1"
  if [ "$SKIP_RESTART" = "1" ]; then
    log "DOCVERSE_SEAL_SKIP_RESTART=1: container não recriado"
    return 0
  fi
  compose up -d --no-build --no-deps --force-recreate app
  local i
  for i in $(seq 1 60); do
    if app_fetch /api/health >/dev/null 2>&1; then break; fi
    sleep 3
  done
  app_fetch /api/health >/dev/null 2>&1 || { log "app não respondeu em 180s"; return 1; }
  local status
  status="$(app_fetch /api/certificate-status 2>/dev/null)" || true
  grep -q '"isAvailable":true' <<<"$status" || { log "certificate-status: ${status:-sem resposta}"; return 1; }
  local loaded_sha
  loaded_sha="$(docker exec "$APP_CONTAINER" sha256sum /opt/docverse/cert.p12 | cut -d' ' -f1)"
  [ "$loaded_sha" = "$expected_sha" ] || { log "o container não está com o certificado esperado"; return 1; }
  log "app saudável, certificado disponível"
}

cert_summary() {
  local file="$1" pass_file="$2" pem
  pem="$(openssl pkcs12 -in "$file" -passin "file:$pass_file" -nokeys -clcerts 2>/dev/null || openssl pkcs12 -legacy -in "$file" -passin "file:$pass_file" -nokeys -clcerts 2>/dev/null)" || {
    echo "  (não abriu com a senha do .env.prod)"
    return 0
  }
  openssl x509 -noout -subject -issuer -enddate -nameopt RFC2253 <<<"$pem" | sed 's/^/  /'
}

cmd_status() {
  [ -f "$ENV_FILE" ] || fail "não encontrei $ENV_FILE"
  local tmp
  tmp="$(mktemp -p /dev/shm 2>/dev/null || mktemp)"
  trap 'rm -f "$tmp"' RETURN
  current_pass >"$tmp"
  log "certificado de selagem em uso ($CERT):"
  cert_summary "$CERT" "$tmp"
  echo "  sha256 do arquivo: $(sha256sum "$CERT" | cut -d' ' -f1)"
  if [ "$SKIP_RESTART" != "1" ]; then
    echo "  no container:      $(docker exec "$APP_CONTAINER" sha256sum /opt/docverse/cert.p12 | cut -d' ' -f1)"
    echo "  certificate-status: $(app_fetch /api/certificate-status 2>/dev/null || echo 'sem resposta')"
  fi
  if [ -d "$BACKUP_ROOT" ]; then
    log "backups: $(ls -1 "$BACKUP_ROOT" | tr '\n' ' ')"
  fi
}

do_rollback() {
  local dir="$1"
  [ -f "$dir/cert.p12" ] && [ -f "$dir/passphrase" ] || fail "backup incompleto em $dir"
  log "restaurando o certificado de $dir"
  install_cert "$dir/cert.p12"
  write_pass "$(cat "$dir/passphrase")" || fail "não consegui restaurar a senha no .env.prod; a cópia original está em $dir/env.prod"
  restart_and_verify "$(sha256sum "$dir/cert.p12" | cut -d' ' -f1)" || fail "o app não voltou saudável depois do rollback; veja: docker logs $APP_CONTAINER"
  log "rollback concluído"
}

cmd_rollback() {
  local dir="${1:-}"
  if [ -z "$dir" ]; then
    dir="$(ls -1d "$BACKUP_ROOT"/*/ 2>/dev/null | sort | tail -1)"
    [ -n "$dir" ] || fail "nenhum backup em $BACKUP_ROOT"
  fi
  do_rollback "${dir%/}"
}

cmd_apply() {
  local pfx="${1:-$SECRETS_DIR/ecnpj-a1.pfx}"
  local pass_file="${2:-$SECRETS_DIR/ecnpj-a1-pass.txt}"
  [ -f "$ENV_FILE" ] || fail "não encontrei $ENV_FILE"
  [ -f "$CERT" ] || fail "não encontrei o certificado atual em $CERT"

  "$SCRIPT_DIR/seal-cert-check.sh" "$pfx" "$pass_file" || fail "validação reprovada; nada foi alterado"

  local new_pass new_sha users_before backup
  new_pass="$(head -n1 "$pass_file")"
  [[ "$new_pass" != *"'"* ]] || fail "a senha contém aspas simples, que o .env.prod não comporta; reexporte o .pfx com outra senha"
  new_sha="$(sha256sum "$pfx" | cut -d' ' -f1)"
  if [ "$new_sha" = "$(sha256sum "$CERT" | cut -d' ' -f1)" ]; then
    fail "esse .pfx já é o certificado em uso"
  fi

  users_before=""
  [ "$SKIP_RESTART" = "1" ] || users_before="$(user_count)"

  umask 077
  backup="$BACKUP_ROOT/$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$backup"
  cp -p "$CERT" "$backup/cert.p12"
  current_pass >"$backup/passphrase"
  cp -p "$ENV_FILE" "$backup/env.prod"
  chmod 600 "$backup"/*
  log "backup do certificado e da senha atuais em $backup"

  install_cert "$pfx"

  if ! write_pass "$new_pass" || ! restart_and_verify "$new_sha"; then
    log "o app não aceitou o certificado novo; desfazendo"
    do_rollback "$backup"
    fail "troca desfeita; o certificado anterior está de volta"
  fi

  if [ -n "$users_before" ]; then
    local users_after
    users_after="$(user_count)"
    log "usuários antes: $users_before, depois: $users_after"
    [ "$users_before" = "$users_after" ] || fail "a contagem de usuários mudou; investigue antes de seguir"
  fi

  log "troca concluída. Sele um documento de teste e valide o PDF (README, seção 'Depois da troca')."
  log "para voltar: $0 rollback $backup"
}

case "${1:-}" in
  status) cmd_status ;;
  apply)
    shift
    cmd_apply "$@"
    ;;
  rollback)
    shift
    cmd_rollback "$@"
    ;;
  *)
    sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
    ;;
esac
