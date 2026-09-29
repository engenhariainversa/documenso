# Backup do Postgres do Docverse

Backup diário do banco de produção (container `docverse-db`, volume `docverse_docverse-db`) com `pg_dump`, executado por um timer systemd de usuário.

| Arquivo | Função |
| --- | --- |
| `docverse-db-backup.sh` | Gera `docverse-db-<UTC>.dump` (formato custom do `pg_dump`), confere o arquivo com `pg_restore --list` e aplica a retenção |
| `docverse-db-restore.sh` | Recria o banco a partir de um dump (pede `--yes`) |
| `docverse-db-backup.service` / `.timer` | Unidades systemd de usuário: backup todo dia às 03:30 |

O deploy (`.github/workflows/deploy.yml`) **não** instala nada disto. A ativação é manual e feita uma única vez, depois do merge.

## Como funciona

- O `pg_dump` roda **dentro** do container e usa `POSTGRES_USER`/`POSTGRES_DB` do próprio container. Nenhuma senha fica no script, na unidade ou nos arquivos de log.
- O dump é gravado primeiro como `.partial` e só ganha o nome final depois de passar no `pg_restore --list`. Um dump que falha nunca substitui nem conta como backup.
- Retenção: apaga dumps com mais de `DOCVERSE_BACKUP_RETENTION_DAYS` dias (padrão 14), mas sempre mantém os `DOCVERSE_BACKUP_KEEP_MIN` mais recentes (padrão 7). Se os backups pararem por um tempo, os últimos 7 não são apagados.
- Os arquivos são criados com permissão `600` e há um `flock` para impedir duas execuções simultâneas.
- Destino padrão: `/mnt/hd2tb/backups/docverse`.

### O que o dump não inclui

Guarde estes itens à parte, em local seguro. Sem eles o banco restaurado não serve:

- `.env.prod`, principalmente `NEXT_PRIVATE_ENCRYPTION_KEY` e `NEXT_PRIVATE_ENCRYPTION_SECONDARY_KEY`. Dados cifrados no banco (2FA, tokens) só abrem com as mesmas chaves.
- O certificado de selagem (`secrets/cert.p12`) e a senha dele.
- Os PDFs, se o armazenamento não for o próprio banco. Com `NEXT_PUBLIC_UPLOAD_TRANSPORT=database` (padrão), eles já estão no dump.

O destino fica na mesma máquina. Para se proteger de perda do servidor, copie a pasta periodicamente para fora dele, por exemplo com `rclone` ou `rsync`.

## Ativação em produção (depois do merge)

Rode como o usuário que já executa o runner (serviço systemd de usuário):

```bash
mkdir -p /mnt/hd2tb/backups/docverse
chmod 700 /mnt/hd2tb/backups/docverse

# Garante que os timers de usuário rodam sem sessão aberta (o runner já depende disso).
loginctl show-user "$USER" -p Linger   # esperado: Linger=yes

mkdir -p ~/.config/systemd/user
ln -sf /mnt/hd2tb/projetos/documenso/prod/docker/docverse/backup/docverse-db-backup.service ~/.config/systemd/user/
ln -sf /mnt/hd2tb/projetos/documenso/prod/docker/docverse/backup/docverse-db-backup.timer ~/.config/systemd/user/
systemctl --user daemon-reload

# Primeiro backup, na hora, para validar:
systemctl --user start docverse-db-backup.service
journalctl --user -u docverse-db-backup.service -n 20 --no-pager
ls -lh /mnt/hd2tb/backups/docverse

# Liga o agendamento diário:
systemctl --user enable --now docverse-db-backup.timer
systemctl --user list-timers docverse-db-backup.timer
```

As unidades são links para o checkout de produção. Um merge que altere o `.service` ou o `.timer` exige `systemctl --user daemon-reload`. Mudanças só no script valem na próxima execução.

Para mudar o destino ou a retenção, use `systemctl --user edit docverse-db-backup.service`, que cria um override sem alterar o arquivo versionado:

```ini
[Service]
Environment=DOCVERSE_BACKUP_RETENTION_DAYS=30
```

## Restauração

> Apaga o banco atual do container de destino. Antes, faça um dump do estado atual com `docverse-db-backup.sh`, mesmo que ele esteja quebrado.

```bash
cd /mnt/hd2tb/projetos/documenso/prod
COMPOSE="docker compose -f docker/docverse/compose.yml --profile prod"

# 1. Escolha o dump
ls -lt /mnt/hd2tb/backups/docverse/
DUMP=/mnt/hd2tb/backups/docverse/docverse-db-AAAAMMDDTHHMMSSZ.dump

# 2. Pare o app, deixando o banco no ar
$COMPOSE stop app

# 3. Restaure (dropdb --force derruba conexões que sobrarem)
docker/docverse/backup/docverse-db-restore.sh "$DUMP" --yes

# 4. Suba o app. Se o código for mais novo que o dump, as migrações pendentes rodam na subida.
$COMPOSE start app
$COMPOSE exec -T app node -e "fetch('http://localhost:3000/api/health').then(r=>console.log(r.status))"
```

### Restaurar em outro lugar, para conferir ou recuperar um registro

Use um container descartável, sem tocar no banco de produção:

```bash
docker run -d --name tmp-docverse-restore -e POSTGRES_USER=docverse -e POSTGRES_DB=docverse \
  -e POSTGRES_PASSWORD=descartavel postgres:16-alpine
DOCVERSE_DB_CONTAINER=tmp-docverse-restore docker/docverse/backup/docverse-db-restore.sh "$DUMP" --yes
docker exec -it tmp-docverse-restore psql -U docverse -d docverse
docker rm -f -v tmp-docverse-restore
```

Também dá para inspecionar o conteúdo sem restaurar: `docker exec -i docverse-db pg_restore --list < "$DUMP"`.
