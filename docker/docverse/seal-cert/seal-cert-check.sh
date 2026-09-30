#!/usr/bin/env bash
# Valida um certificado A1 (.pfx/.p12) antes de ele virar o certificado de selagem
# do Docverse. Só lê: não altera .env.prod, containers nem o certificado em uso.
#
# Uso:
#   seal-cert-check.sh [--ask-pass] [<arquivo.pfx> [<arquivo-da-senha>]]
#
#   --ask-pass  pergunta a senha no terminal (sem eco) e grava no arquivo da senha
#               com permissão 600. Rode no seu próprio terminal, nunca por um chat.
#
# Padrões: <secrets>/ecnpj-a1.pfx e <secrets>/ecnpj-a1-pass.txt
#
# Variáveis (todas opcionais):
#   DOCVERSE_SECRETS_DIR         pasta dos segredos     (padrão: /mnt/hd2tb/projetos/documenso/secrets)
#   DOCVERSE_IMAGE               imagem do app          (padrão: docverse:latest)
#   DOCVERSE_ICP_ROOTS_ZIP       zip das ACs da ICP-Brasil já baixado (padrão: baixa do ITI)
#   DOCVERSE_SEAL_MIN_DAYS       validade mínima restante, em dias (padrão: 30)
#   DOCVERSE_SEAL_ALLOW_NON_ICP  1 = cadeia/políticas ICP-Brasil viram aviso (autoassinado, testes)
#
# Procedimento completo: docker/docverse/seal-cert/README.md
set -euo pipefail

SECRETS_DIR="${DOCVERSE_SECRETS_DIR:-/mnt/hd2tb/projetos/documenso/secrets}"
IMAGE="${DOCVERSE_IMAGE:-docverse:latest}"
MIN_DAYS="${DOCVERSE_SEAL_MIN_DAYS:-30}"
ALLOW_NON_ICP="${DOCVERSE_SEAL_ALLOW_NON_ICP:-0}"
ICP_ZIP_URL="https://acraiz.icpbrasil.gov.br/credenciadas/CertificadosAC-ICP-Brasil/ACcompactado.zip"
CHECK_CONTAINER="tmp-docverse-sealcert-check"

errors=0
ok() { echo "  OK     $*"; }
warn() { echo "  AVISO  $*"; }
bad() {
  echo "  ERRO   $*"
  errors=$((errors + 1))
}
# Exigência da ICP-Brasil: erro em produção, aviso quando DOCVERSE_SEAL_ALLOW_NON_ICP=1.
icp_bad() {
  if [ "$ALLOW_NON_ICP" = "1" ]; then warn "$*"; else bad "$*"; fi
}
fail() {
  echo "[seal-cert-check] ERRO: $*" >&2
  exit 1
}

ask_pass=0
if [ "${1:-}" = "--ask-pass" ]; then
  ask_pass=1
  shift
fi
PFX="${1:-$SECRETS_DIR/ecnpj-a1.pfx}"
PASS_FILE="${2:-$SECRETS_DIR/ecnpj-a1-pass.txt}"

[ -f "$PFX" ] || fail "arquivo não encontrado: $PFX"

umask 077

if [ "$ask_pass" = "1" ]; then
  [ -t 0 ] || fail "--ask-pass precisa de um terminal interativo"
  read -rs -p "Senha do .pfx (não aparece na tela): " pfx_pass
  echo
  [ -n "$pfx_pass" ] || fail "senha vazia"
  printf '%s\n' "$pfx_pass" >"$PASS_FILE"
  unset pfx_pass
  chmod 600 "$PASS_FILE"
  echo "[seal-cert-check] senha gravada em $PASS_FILE (600)"
fi

[ -f "$PASS_FILE" ] || fail "arquivo da senha não encontrado: $PASS_FILE (use --ask-pass)"

work="$(mktemp -d -p /dev/shm docverse-sealcert.XXXXXX 2>/dev/null || mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "[seal-cert-check] $PFX"

# --- 1. Permissões -----------------------------------------------------------
echo "1. Arquivos"
for f in "$PFX" "$PASS_FILE"; do
  mode="$(stat -c '%a' "$f")"
  # 640 só é aceito quando vem de uma ACL (setfacl) sem acesso para grupo e outros.
  if [ "$mode" = "600" ] || [ "$mode" = "400" ]; then
    ok "$(basename "$f") com permissão $mode"
  elif getfacl -p "$f" 2>/dev/null | grep -q '^group::---$' && getfacl -p "$f" 2>/dev/null | grep -q '^other::---$'; then
    ok "$(basename "$f") restrito por ACL (modo $mode)"
  else
    bad "$(basename "$f") com permissão $mode; rode: chmod 600 '$f'"
  fi
done

# --- 2. Abre com a senha -----------------------------------------------------
echo "2. PKCS#12"
p12() { openssl pkcs12 -in "$PFX" -passin "file:$PASS_FILE" "${legacy[@]}" "$@" 2>/dev/null; }
legacy=()
if ! p12 -nokeys -clcerts >"$work/leaf.bundle"; then
  legacy=(-legacy)
  if ! p12 -nokeys -clcerts >"$work/leaf.bundle"; then
    bad "não abriu: senha errada ou arquivo corrompido"
    echo "[seal-cert-check] REPROVADO ($errors erro(s))"
    exit 1
  fi
  warn "cifra legada (RC2/3DES), comum em exportações do Windows; o teste 7 diz se o app aceita"
fi
ok "abriu com a senha informada"

openssl x509 -in "$work/leaf.bundle" -out "$work/leaf.pem" 2>/dev/null || fail "não há certificado de titular no arquivo"
p12 -nokeys -cacerts >"$work/pfx-cas.pem" || true
pfx_ca_count="$(grep -c 'BEGIN CERTIFICATE' "$work/pfx-cas.pem" || true)"

key_pub="$(p12 -nocerts -nodes | openssl pkey -pubout 2>/dev/null | sha256sum)"
cert_pub="$(openssl x509 -in "$work/leaf.pem" -pubkey -noout | openssl pkey -pubin -pubout 2>/dev/null | sha256sum)"
if [ -n "$key_pub" ] && [ "$key_pub" = "$cert_pub" ]; then
  ok "chave privada presente e casa com o certificado"
else
  bad "chave privada ausente ou não corresponde ao certificado (exporte o .pfx com a chave privada)"
fi

# --- 3. Titular e validade ---------------------------------------------------
echo "3. Certificado"
text="$(openssl x509 -in "$work/leaf.pem" -noout -text)"
echo "         titular: $(openssl x509 -in "$work/leaf.pem" -noout -subject -nameopt RFC2253 | sed 's/^subject=//')"
echo "         emissor: $(openssl x509 -in "$work/leaf.pem" -noout -issuer -nameopt RFC2253 | sed 's/^issuer=//')"
echo "         validade: $(openssl x509 -in "$work/leaf.pem" -noout -startdate | cut -d= -f2) até $(openssl x509 -in "$work/leaf.pem" -noout -enddate | cut -d= -f2)"
echo "         sha256: $(openssl x509 -in "$work/leaf.pem" -noout -fingerprint -sha256 | cut -d= -f2)"

if ! openssl x509 -in "$work/leaf.pem" -noout -checkend 0 >/dev/null; then
  bad "certificado vencido"
elif ! openssl x509 -in "$work/leaf.pem" -noout -checkend "$((MIN_DAYS * 86400))" >/dev/null; then
  bad "vence em menos de $MIN_DAYS dias"
else
  ok "dentro da validade (mais de $MIN_DAYS dias restantes)"
fi
not_before="$(date -d "$(openssl x509 -in "$work/leaf.pem" -noout -startdate | cut -d= -f2)" +%s)"
[ "$not_before" -le "$(date +%s)" ] || bad "certificado ainda não está válido (início no futuro)"

key_bits="$(grep -oE 'Public-Key: \([0-9]+ bit\)' <<<"$text" | grep -oE '[0-9]+' || echo 0)"
if grep -q 'Public Key Algorithm: rsaEncryption' <<<"$text" && [ "$key_bits" -ge 2048 ]; then
  ok "chave RSA de $key_bits bits"
elif grep -q 'Public Key Algorithm: id-ecPublicKey' <<<"$text"; then
  ok "chave de curva elíptica ($key_bits bits)"
else
  bad "chave fraca ou de tipo não suportado ($key_bits bits)"
fi

# --- 4. Uso da chave e perfil ICP-Brasil ------------------------------------
echo "4. Uso da chave e perfil"
key_usage="$(openssl x509 -in "$work/leaf.pem" -noout -ext keyUsage 2>/dev/null || true)"
if grep -q 'Digital Signature' <<<"$key_usage"; then
  ok "uso da chave inclui assinatura digital"
elif [ -z "$key_usage" ]; then
  icp_bad "sem extensão keyUsage"
else
  bad "uso da chave não inclui assinatura digital"
fi
grep -q 'Non Repudiation' <<<"$key_usage" || icp_bad "uso da chave sem não repúdio (nonRepudiation)"

if grep -q 'CA:TRUE' <<<"$text"; then
  icp_bad "é um certificado de AC (CA:TRUE), não de titular"
fi

# Políticas ICP-Brasil: 2.16.76.1.2.1.n = A1, 2.16.76.1.2.3.n = A3.
policy="$(grep -oE 'Policy: 2\.16\.76\.1\.2\.[0-9]+\.[0-9]+' <<<"$text" | head -1 | awk '{print $2}' || true)"
case "$policy" in
  2.16.76.1.2.1.*) ok "política A1 da ICP-Brasil ($policy)" ;;
  "") icp_bad "sem política de certificado da ICP-Brasil" ;;
  *) icp_bad "política $policy não é A1" ;;
esac

# otherName 2.16.76.1.3.3 = CNPJ (e-CNPJ); só 2.16.76.1.3.1 = dados de pessoa física (e-CPF).
if grep -q '2\.16\.76\.1\.3\.3' <<<"$text"; then
  ok "e-CNPJ (campo de CNPJ presente)"
elif grep -q '2\.16\.76\.1\.3\.1' <<<"$text"; then
  icp_bad "é um e-CPF (pessoa física), não um e-CNPJ"
else
  icp_bad "sem os campos de CNPJ da ICP-Brasil"
fi

# --- 5. Cadeia ICP-Brasil ----------------------------------------------------
echo "5. Cadeia"
if [ "$pfx_ca_count" -gt 0 ]; then
  ok "o .pfx traz $pfx_ca_count certificado(s) de AC"
elif grep -q 'CA Issuers - URI' <<<"$text"; then
  warn "o .pfx não traz a cadeia; o app a completa pela AIA na hora de selar (precisa de internet)"
else
  icp_bad "o .pfx não traz a cadeia e o certificado não tem AIA: a assinatura sairia sem cadeia"
fi

icp_dir="$work/icp"
mkdir -p "$icp_dir"
icp_zip="${DOCVERSE_ICP_ROOTS_ZIP:-}"
if [ -z "$icp_zip" ]; then
  icp_zip="$work/icp.zip"
  if ! curl -fsS -m 60 -o "$icp_zip" "$ICP_ZIP_URL" 2>/dev/null; then
    # O site do ITI nem sempre usa uma AC presente no sistema; as raízes baixadas
    # têm o sha256 impresso abaixo para conferência.
    if curl -fsSk -m 60 -o "$icp_zip" "$ICP_ZIP_URL" 2>/dev/null; then
      warn "ACs baixadas do ITI sem validar o TLS do site; confira o sha256 da raiz abaixo com o repositório do ITI"
    else
      icp_zip=""
    fi
  fi
fi

if [ -n "$icp_zip" ] && unzip -q -o "$icp_zip" -d "$icp_dir" 2>/dev/null; then
  : >"$work/roots.pem"
  cp "$work/pfx-cas.pem" "$work/inter.pem"
  for f in "$icp_dir"/*; do
    pem="$(openssl x509 -in "$f" 2>/dev/null)" || continue
    subject="$(openssl x509 -noout -subject <<<"$pem")"
    issuer="$(openssl x509 -noout -issuer <<<"$pem")"
    if [ "${subject#subject=}" = "${issuer#issuer=}" ]; then
      grep -q 'Autoridade Certificadora Raiz Brasileira' <<<"$subject" && echo "$pem" >>"$work/roots.pem"
    else
      echo "$pem" >>"$work/inter.pem"
    fi
  done
  if openssl verify -show_chain -CAfile "$work/roots.pem" -untrusted "$work/inter.pem" "$work/leaf.pem" >"$work/verify.out" 2>&1; then
    ok "cadeia fecha em uma raiz da ICP-Brasil:"
    grep -E '^depth=' "$work/verify.out" | sed -E 's/^depth=([0-9]+): /         \1: /; s/ \(untrusted\)//'
    root_subject="$(grep -E '^depth=' "$work/verify.out" | tail -1 | sed -E 's/^depth=[0-9]+: //; s/ \(.*//')"
    # Casa pelo CN: a formatação do DN muda entre "openssl verify" e "openssl x509".
    root_cn="${root_subject##*CN = }"
    root_cn="${root_cn##*CN=}"
    awk '/BEGIN CERTIFICATE/{n++} {print > ("'"$work"'/root-" n ".pem")}' "$work/roots.pem"
    for r in "$work"/root-*.pem; do
      if [ "$(openssl x509 -in "$r" -noout -subject -nameopt multiline | sed -n 's/^ *commonName *= //p')" = "$root_cn" ]; then
        echo "         raiz sha256: $(openssl x509 -in "$r" -noout -fingerprint -sha256 | cut -d= -f2)"
      fi
    done
  else
    icp_bad "cadeia não fecha em uma raiz da ICP-Brasil: $(grep -m1 -E 'error [0-9]+' "$work/verify.out" | sed 's/^error //' || true)"
  fi
else
  icp_bad "não foi possível obter as ACs da ICP-Brasil (baixe o ACcompactado.zip do ITI e informe em DOCVERSE_ICP_ROOTS_ZIP)"
fi

# --- 6. Revogação (melhor esforço) -------------------------------------------
echo "6. Revogação"
crl_url="$(openssl x509 -in "$work/leaf.pem" -noout -ext crlDistributionPoints 2>/dev/null | grep -oE 'URI:http[^ ]+' | head -1 | cut -d: -f2- || true)"
if [ -z "$crl_url" ]; then
  warn "certificado sem ponto de distribuição de LCR; revogação não conferida"
elif curl -fsSL -m 60 -o "$work/crl.bin" "$crl_url" 2>/dev/null &&
  { openssl crl -inform DER -in "$work/crl.bin" -noout -text >"$work/crl.txt" 2>/dev/null ||
    openssl crl -inform PEM -in "$work/crl.bin" -noout -text >"$work/crl.txt" 2>/dev/null; }; then
  serial="$(openssl x509 -in "$work/leaf.pem" -noout -serial | cut -d= -f2)"
  if grep -qi "Serial Number: *0*${serial#"${serial%%[!0]*}"}\$" "$work/crl.txt"; then
    bad "certificado REVOGADO (consta na LCR da AC)"
  else
    ok "não consta na LCR da AC"
  fi
else
  warn "não foi possível baixar a LCR ($crl_url); revogação não conferida"
fi

# --- 7. O app aceita o arquivo como está? ------------------------------------
# Usa a mesma biblioteca e as mesmas opções da selagem (packages/signing), dentro
# da imagem de produção, num container descartável sem rede de produção nem banco.
echo "7. Aceitação pelo app ($IMAGE)"
if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  bad "imagem $IMAGE não encontrada; não foi possível testar no app"
else
  cat >"$work/sign-test.mjs" <<'EOF'
import { P12Signer, PDF } from '@libpdf/core';

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);

const signer = await P12Signer.create(
  new Uint8Array(Buffer.concat(chunks)),
  process.env.NEXT_PRIVATE_SIGNING_PASSPHRASE || '',
  { buildChain: true },
);

const pdf = PDF.create();
pdf.addPage();

const { bytes } = await pdf.sign({
  signer,
  reason: 'Teste de selagem do Docverse',
  subFilter: 'ETSI.CAdES.detached',
});

process.stderr.write(`chain=${signer.certificateChain.length} key=${signer.keyType}\n`);
process.stdout.write(Buffer.from(bytes).toString('base64'));
EOF
  chmod 644 "$work/sign-test.mjs"
  if NEXT_PRIVATE_SIGNING_PASSPHRASE="$(head -n1 "$PASS_FILE")" docker run --rm -i \
    --name "$CHECK_CONTAINER" \
    --entrypoint node \
    -e NEXT_PRIVATE_SIGNING_PASSPHRASE \
    -v "$work/sign-test.mjs:/app/apps/remix/seal-cert-sign-test.mjs:ro" \
    "$IMAGE" seal-cert-sign-test.mjs <"$PFX" >"$work/signed.b64" 2>"$work/sign.err"; then
    base64 -d "$work/signed.b64" >"$work/signed.pdf"
    ok "o app abriu o .pfx e assinou um PDF de teste ($(grep -oE 'chain=[0-9]+ key=[A-Za-z]+' "$work/sign.err" | sed 's/chain=/certificados de AC na assinatura: /; s/ key=/, chave /'))"
    grep -i 'could not complete certificate chain' "$work/sign.err" | sed 's/^/         /' || true
    if command -v pdfsig >/dev/null; then
      pdfsig_out="$(pdfsig "$work/signed.pdf" 2>&1 || true)"
      if grep -q 'Signature Validation: Signature is Valid' <<<"$pdfsig_out"; then
        ok "pdfsig: assinatura íntegra"
      else
        bad "pdfsig não validou a assinatura do PDF de teste"
      fi
    fi
  else
    bad "o app não conseguiu usar o .pfx: $(grep -v '^\s*at ' "$work/sign.err" | grep -m1 -iE 'error|invalid|unsupported' || tail -1 "$work/sign.err")"
  fi
fi

echo
if [ "$errors" -gt 0 ]; then
  echo "[seal-cert-check] REPROVADO ($errors erro(s)). Não troque o certificado."
  exit 1
fi
echo "[seal-cert-check] APROVADO. Pode seguir para a troca (seal-cert-swap.sh apply)."
