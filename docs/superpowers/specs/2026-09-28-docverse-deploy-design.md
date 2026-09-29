# Docverse — Sub-projeto 6: Deploy no jarvis (docverse.termhub.dev)

- **Data:** 2026-09-28
- **Status:** aprovado por delegação (usuário autorizou execução autônoma)

## Objetivo

Colocar o Docverse no ar em `https://docverse.termhub.dev`, rodando em Docker nesta máquina (jarvis) atrás do proxy existente (`proxy-nginx` + `proxy-cloudflared`, túnel "jarvis"), com deploy contínuo via GitHub Actions num runner self-hosted: todo push na `main` do fork é implantado.

A troca para o domínio próprio do Docverse depois é só: novo hostname no túnel + novo `.conf` no nginx + `NEXT_PUBLIC_WEBAPP_URL`.

## Fora de escopo

- SMTP real (resolvido em 2026-09-29, DOC-20: ver "E-mail (SMTP)").
- Certificado ICP-Brasil / assinatura qualificada (sub-projeto 5).
- Backups automáticos do Postgres (task separada no board).

## Design

### Layout no servidor

| Caminho | Conteúdo |
|---|---|
| `/mnt/hd2tb/projetos/documenso/prod` | clone do fork na `main` (DEPLOY_DIR do workflow) |
| `/mnt/hd2tb/projetos/documenso/prod/.env.prod` | variáveis de produção (não versionado, `chmod 600`) |
| `/mnt/hd2tb/projetos/documenso/secrets/cert.p12` | certificado de selagem (não versionado) |
| `/mnt/hd2tb/github-runner-docverse` | runner self-hosted do repo, label `jarvis-docverse` |
| `/mnt/hd2tb/proxy/nginx/conf.d/docverse.termhub.dev.conf` | vhost do nginx |

### Compose de produção (`docker/docverse/compose.yml`, versionado)

- `database`: `postgres:16-alpine`, volume `docverse-db`, healthcheck `pg_isready`, sem portas.
- `app`: build de `docker/Dockerfile` (imagem `docverse:latest`), `container_name: docverse-app`, `env_file: ../../.env.prod`, monta `secrets/cert.p12` read-only, rede `default` + rede externa `proxy`, **sem portas publicadas**, `restart: unless-stopped`, depende do `database` saudável. As migrações rodam no start (o `docker/start.sh` do upstream já executa `prisma migrate deploy`).
- O `mailpit` (`axllent/mailpit`) foi o SMTP provisório até 2026-09-29 e **não faz mais parte do compose**: foi removido no PR #6 e o container não existe mais em produção (conferido em 2026-09-29). O app envia pelo Mailgun (ver "E-mail (SMTP)").
- Profile `prod` em `app` e `database`, seguindo o padrão do deploy-kit.

### Variáveis (`.env.prod`)

Geradas uma vez com `openssl rand`: `NEXTAUTH_SECRET`, `NEXT_PRIVATE_ENCRYPTION_KEY` (32+ chars), `NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY`, senha do Postgres. Fixas: `NEXT_PUBLIC_WEBAPP_URL=https://docverse.termhub.dev`, `NEXT_PRIVATE_INTERNAL_WEBAPP_URL=http://localhost:3000`, `NEXT_PUBLIC_UPLOAD_TRANSPORT=database`, `NEXT_PRIVATE_SIGNING_TRANSPORT=local`, `NEXT_PRIVATE_SIGNING_LOCAL_FILE_PATH=/opt/docverse/cert.p12`, `NEXT_PRIVATE_SIGNING_PASSPHRASE`, SMTP (ver "E-mail (SMTP)"), `NEXT_PUBLIC_DISABLE_SIGNUP` vazio (cadastro aberto até decidirmos).

Certificado de selagem provisório: autoassinado (`CN=Docverse`, RSA 2048, 3 anos). Documentos selados com ele mostram assinatura válida porém de emissor não confiável; o certificado definitivo vem com o sub-projeto 5 ou com um e-CNPJ.

### E-mail (SMTP)

O Docverse usa o mesmo SMTP do termhub: **Mailgun**, com a credencial SMTP do domínio de envio `8020digital.com.br` (já verificado no Mailgun e em uso pelo termhub). As credenciais ficam só no `.env.prod` (e no `.env` de produção do termhub, que é a fonte); nunca no repositório.

| Variável | Valor |
|---|---|
| `NEXT_PRIVATE_SMTP_TRANSPORT` | `smtp-auth` |
| `NEXT_PRIVATE_SMTP_HOST` | `smtp.mailgun.org` |
| `NEXT_PRIVATE_SMTP_PORT` | `587` |
| `NEXT_PRIVATE_SMTP_SECURE` | `false` (porta 587 com STARTTLS; `true` só para 465) |
| `NEXT_PRIVATE_SMTP_UNSAFE_IGNORE_TLS` | `false` (com `true` o STARTTLS é pulado e a senha trafega em claro) |
| `NEXT_PRIVATE_SMTP_USERNAME` / `NEXT_PRIVATE_SMTP_PASSWORD` | iguais a `SMTP_USER` / `SMTP_PASS` do `.env` de produção do termhub (`/mnt/hd2tb/projetos/termhub/.env`) |
| `NEXT_PRIVATE_SMTP_FROM_NAME` | `Docverse` |
| `NEXT_PRIVATE_SMTP_FROM_ADDRESS` | `contato@8020digital.com.br` |

O remetente fica no domínio já verificado para passar em SPF/DKIM/DMARC. Usar `@docverse.termhub.dev` (ou o domínio próprio do Docverse) exige antes adicionar e verificar esse domínio no Mailgun (registros TXT de SPF/DKIM e MX na Cloudflare).

Trocar a credencial: copiar os valores por script, sem exibi-los (nada de `cat`/`grep` que mostre o valor), manter `chmod 600`, fazer backup datado do `.env.prod` e recriar só o app: `docker compose -f docker/docverse/compose.yml --profile prod up -d --no-deps --no-build --force-recreate app`. Valores com `$`, `#`, espaço ou aspas vão entre aspas simples no `.env.prod`.

Conferir: o app não registra a resposta do SMTP. Para testar, disparar um reenvio de confirmação para uma conta própria (`POST /api/auth/email-password/resend-verify-email`), ver o job `Send Confirmation Email` como `COMPLETED` na tabela `BackgroundJob` e, se quiser checar a conexão, rodar `transport.verify()` do `nodemailer` dentro do `docverse-app` com as mesmas variáveis (sem `logger`, que imprime o usuário).

### Entrada (proxy + túnel)

- `docverse.termhub.dev.conf`: `listen 80`, `resolver 127.0.0.11 valid=10s`, `set $upstream_docverse docverse-app:3000`, `proxy_pass http://$upstream_docverse`, headers `X-Real-IP $http_cf_connecting_ip`, `X-Forwarded-Proto https`, `Upgrade`/`Connection`, `client_max_body_size 60m` (upload de até 50 MB).
- Túnel: regra de ingress `docverse.termhub.dev → http://proxy-nginx:80` inserida **antes** da regra catch-all, via API da Cloudflare com o token do `~/.cloudflared/cert-termhub.pem` (GET da config atual, backup em arquivo, PUT com a regra nova, verificação de que os demais hostnames continuam respondendo).
- DNS: CNAME `docverse` → `<tunnel-id>.cfargotunnel.com`, proxied, na zona termhub.dev.

### CI/CD

- **Runner:** registrado no repo `engenhariainversa/documenso`, label `jarvis-docverse`, instalado como **serviço systemd de usuário** (`~/.config/systemd/user/github-runner-docverse.service`, linger já ativo), porque não há sudo sem senha. Sobrevive a reboot.
- **Workflow `.github/workflows/deploy.yml`** (substitui o `deploy.yml` do upstream): no push na `main`, entra no DEPLOY_DIR, `git merge --ff-only` para o commit, `docker compose -f docker/docverse/compose.yml --profile prod up -d --build --remove-orphans`, health check em `http://localhost:3000/api/health` via `docker compose exec app`, `docker image prune -f`.
- **Workflows do upstream removidos:** `deploy.yml` (substituído), `publish.yml` (publica imagem do Documenso), `translations-*` (Crowdin deles), `issue-*`, `first-interaction.yml`, `pr-labeler.yml`, `stale.yml`, `semantic-pull-requests.yml`, `codeql-analysis.yml`, `e2e-tests.yml` (exige infra que não temos no runner; E2E vira task própria). Fica o `ci.yml` se ele rodar em runner do GitHub sem segredos; senão é ajustado para lint + typecheck + vitest.

## Verificação

- `curl -sI https://docverse.termhub.dev` → 200 e título "Docverse".
- `curl -s https://docverse.termhub.dev/api/health` → OK.
- Os outros hostnames do túnel continuam respondendo (termhub.dev, app.termhub.dev, engageasy.app, iptransporte.com.br, startupweekendsummit.com.br, stg.opapingou.com.br) com o mesmo status de antes.
- Um push na `main` dispara o workflow, que termina verde e atualiza o container.
- Smoke no navegador: cadastro, envio de documento, assinatura (e-mails lidos no mailpit até 2026-09-29; depois, na caixa real), download do PDF selado.

## Pendências (para o usuário)

- **SMTP real:** resolvido (Mailgun do termhub, remetente `Docverse <contato@8020digital.com.br>`). O mailpit já foi removido do compose (PR #6). Falta só, se quiserem remetente `@docverse.termhub.dev` ou no domínio próprio, verificar esse domínio no Mailgun (DNS). O limite de envio do plano Mailgun é dividido com o termhub.
- **Cadastro aberto:** qualquer pessoa pode criar conta em docverse.termhub.dev. Decidir se fecha (`NEXT_PUBLIC_DISABLE_SIGNUP=true`) até o lançamento.
- **Certificado de selagem definitivo** (e-CNPJ A1 ou via sub-projeto 5).
