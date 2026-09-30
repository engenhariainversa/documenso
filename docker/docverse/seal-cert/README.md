# Certificado de selagem do Docverse (e-CNPJ A1)

O certificado de selagem é o que a plataforma usa para assinar o PDF final de cada documento concluído. Hoje ele é autoassinado (`CN=Docverse`), então os leitores de PDF mostram a assinatura como íntegra, porém de emissor desconhecido. Este procedimento troca o autoassinado por um **e-CNPJ A1 da ICP-Brasil** e sabe voltar atrás.

| Arquivo | Função |
| --- | --- |
| `seal-cert-check.sh` | Valida um `.pfx` antes da troca. Só lê, não altera nada em produção |
| `seal-cert-swap.sh` | `status`, `apply` (troca com backup e rollback automático) e `rollback` |

O deploy (`.github/workflows/deploy.yml`) **não** roda nada disto. A troca é manual.

## Como o app carrega o certificado

- `packages/signing/transports/local.ts` lê o arquivo de `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH` e abre com `NEXT_PRIVATE_SIGNING_PASSPHRASE`. Aceita qualquer PKCS#12 (`.pfx` e `.p12` são o mesmo formato), inclusive os exportados pelo Windows com cifra antiga.
- Em produção (`.env.prod`): `NEXT_PRIVATE_SIGNING_TRANSPORT=local` e `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH=/opt/docverse/cert.p12`.
- O `compose.yml` monta `secrets/cert.p12` do servidor em `/opt/docverse/cert.p12`, somente leitura. O processo do app roda com uid 1001.
- O certificado é carregado uma vez e fica em memória (`packages/signing/index.ts`). Trocar o arquivo só tem efeito depois de **recriar o container do app**.
- `GET /api/certificate-status` responde `isAvailable: true` quando o arquivo abre com a senha e está dentro da validade.

Por isso a troca não muda o compose nem o código: substitui `secrets/cert.p12`, atualiza a senha no `.env.prod` e recria o container do app. Banco e volume ficam como estão.

## O que a pessoa precisa entregar

1. O arquivo `.pfx` do e-CNPJ A1 **com a chave privada**, do CNPJ que opera o Docverse.
2. A senha do `.pfx`, informada direto no servidor (passo 2 abaixo), nunca por chat, e-mail ou card.

Quem tem o `.pfx` e a senha assina em nome da empresa em qualquer sistema, não só no Docverse (o mesmo certificado dá acesso ao e-CAC, por exemplo). Ele fica só em `secrets/`, fora do git e dos backups do banco.

## Passo a passo

### 1. Colocar o `.pfx` no servidor

Da máquina onde o arquivo está:

```bash
scp certificado.pfx jarvis:/mnt/hd2tb/projetos/documenso/secrets/ecnpj-a1.pfx
```

No servidor:

```bash
chmod 600 /mnt/hd2tb/projetos/documenso/secrets/ecnpj-a1.pfx
```

### 2. Informar a senha e validar

Num terminal seu no servidor (SSH), não por um agente nem pelo chat:

```bash
cd /mnt/hd2tb/projetos/documenso/prod
docker/docverse/seal-cert/seal-cert-check.sh --ask-pass
```

O `--ask-pass` pergunta a senha sem mostrar na tela e grava em `secrets/ecnpj-a1-pass.txt` com permissão 600. Depois disso qualquer pessoa ou agente pode repetir a validação sem ver a senha (`seal-cert-check.sh`, sem argumentos).

O que é conferido:

| # | Validação | Reprova quando |
| --- | --- | --- |
| 1 | Permissão dos arquivos | `.pfx` ou senha legíveis por grupo ou outros |
| 2 | O PKCS#12 abre com a senha e traz a chave privada do certificado | senha errada, arquivo sem chave |
| 3 | Validade e tamanho da chave | vencido, vence em menos de 30 dias, RSA menor que 2048 bits |
| 4 | Uso da chave e perfil | sem `digitalSignature`/`nonRepudiation`, não é política A1 (`2.16.76.1.2.1.*`), não é e-CNPJ (sem o campo de CNPJ `2.16.76.1.3.3`) |
| 5 | Cadeia | não fecha em uma raiz "Autoridade Certificadora Raiz Brasileira" das ACs publicadas pelo ITI |
| 6 | Revogação | consta na LCR da AC emissora (se a LCR não baixar, vira aviso) |
| 7 | Aceitação pelo app | a biblioteca de assinatura, dentro da imagem `docverse:latest`, não abre o `.pfx` ou não assina um PDF de teste |

O teste 7 roda num container descartável (`tmp-docverse-sealcert-check`), sem banco e sem as variáveis de produção, com o mesmo código e as mesmas opções da selagem.

Sobre a cadeia: as ACs são baixadas de `acraiz.icpbrasil.gov.br`. Se o TLS desse site não validar no servidor, o script baixa mesmo assim, avisa e imprime o sha256 da raiz para conferência com o repositório do ITI. Para usar um zip já conferido: `DOCVERSE_ICP_ROOTS_ZIP=/caminho/ACcompactado.zip`.

Se a senha tiver aspas simples (`'`), reexporte o `.pfx` com outra senha: o `.env.prod` não comporta esse caractere com segurança.

### 3. Trocar

Confira antes que não há deploy em andamento (`gh run list -R engenhariainversa/documenso --limit 3`).

```bash
cd /mnt/hd2tb/projetos/documenso/prod
docker/docverse/seal-cert/seal-cert-swap.sh status   # certificado em uso agora
docker/docverse/seal-cert/seal-cert-swap.sh apply
```

O `apply`:

1. roda a validação de novo e para se reprovar;
2. conta os usuários no banco;
3. copia o certificado atual, a senha atual e o `.env.prod` para `secrets/seal-cert-backup/<data UTC>/`;
4. instala o `.pfx` em `secrets/cert.p12` (dono com leitura e escrita, leitura para o uid 1001 do container por ACL, nada para grupo e outros);
5. regrava só a linha `NEXT_PRIVATE_SIGNING_PASSPHRASE` do `.env.prod` e confere que o compose lê a senha como foi gravada;
6. recria **só** o container do app (`up -d --no-build --no-deps --force-recreate app`), o que tira o app do ar por alguns segundos;
7. espera `/api/health`, confere `/api/certificate-status` e que o container está com o arquivo novo, e compara a contagem de usuários.

Se o passo 5 ou o 7 falhar, o script restaura o certificado e a senha anteriores e recria o app de novo.

Como o `.env.prod` muda, o **próximo deploy** recria também o `docverse-db` (o serviço usa o mesmo `env_file`). É um reinício de alguns segundos, sem perda de dados.

### 4. Depois da troca

1. Envie e conclua um documento de teste.
2. Baixe o PDF e confira a assinatura: `pdfsig documento.pdf` deve mostrar o titular do e-CNPJ e `Signature is Valid`.
3. Valide em <https://validar.iti.gov.br>. Se o validador reprovar por falta de política de assinatura (AD-RB), registre o resultado: isso é tratado no sub-projeto 5, não é motivo para rollback.
4. Guarde uma cópia do `.pfx` e da senha fora do servidor.

O Adobe Reader só mostra o selo verde se a raiz da ICP-Brasil estiver confiada na máquina de quem abre; isso não depende do Docverse.

## Voltar ao autoassinado

```bash
cd /mnt/hd2tb/projetos/documenso/prod
docker/docverse/seal-cert/seal-cert-swap.sh rollback            # backup mais recente
docker/docverse/seal-cert/seal-cert-swap.sh rollback <pasta>    # um backup específico
```

Restaura `cert.p12` e a senha do backup e recria o container do app. Documentos já selados com o e-CNPJ continuam válidos: a assinatura está dentro de cada PDF.

O autoassinado original também permanece em `secrets/seal-cert-backup/<data>/`; não apague essa pasta.

## Renovação

O A1 vale um ano. Quando vence, `/api/certificate-status` passa a responder `isAvailable: false` e o selo passa a ser feito com certificado vencido. Para renovar, repita o procedimento com o `.pfx` novo, com pelo menos 30 dias de antecedência.

## Carimbo do tempo

Hoje `NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY` está vazio: o selo sai sem carimbo do tempo e sem dados de validação de longo prazo (LTV), então a assinatura de um documento antigo deixa de validar quando o A1 vence. Configurar uma autoridade de carimbo do tempo é uma decisão separada (as ACTs da ICP-Brasil são pagas por carimbo).

## Convivência com a assinatura qualificada (BirdID)

São duas assinaturas diferentes, e uma não substitui a outra:

- **Selo da plataforma (este certificado):** uma assinatura por documento, aplicada pelo job de selagem (`packages/lib/jobs/definitions/internal/seal-document.handler.ts` chama `signPdf`) depois que todos concluem. Atesta que o PDF saiu do Docverse e não foi alterado. Com o e-CNPJ, quem assina o selo é a empresa que opera a plataforma.
- **Assinatura qualificada do signatário (sub-projeto 5, ainda só especificado):** cada signatário assina com o próprio certificado ICP-Brasil em nuvem. Pela spec (`docs/superpowers/specs/2026-09-28-docverse-qualified-signature-design.md`, no PR #3), a selagem aplica uma assinatura PAdES por signatário qualificado e, por último, o selo da plataforma.

O selo continua vindo de `signPdf` nos dois cenários, então o e-CNPJ A1 instalado agora segue valendo quando o BirdID entrar, sem retrabalho. O "A1 fica para depois" da spec fala de o **signatário** assinar com um `.pfx` próprio, não do certificado da plataforma.
