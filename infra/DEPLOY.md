# EIXO V2 — Guia de Deploy em Produção

## Fluxo oficial

O deploy de produção é automático pelo GitHub Actions:

```text
branch de trabalho → pull request → main → validação → VPS → produção
```

O arquivo responsável é `.github/workflows/deploy.yml`. O deploy começa somente após uma atualização da branch `main`.

## Antes do deploy

- Trabalhar em uma branch separada.
- Revisar o diff e confirmar o escopo.
- Validar o TypeScript e o build.
- Abrir um pull request para `main`.
- Mesclar somente com o CI aprovado.

Os secrets `VPS_HOST`, `VPS_USER` e `VPS_SSH_KEY` devem estar configurados no GitHub. Consulte `.github/SECRETS_SETUP.md`.

## O que o workflow executa

1. Instala as dependências com `npm ci`.
2. Gera o Prisma Client.
3. Valida o TypeScript e constrói o frontend.
4. Conecta na VPS por SSH.
5. Atualiza `/var/www/eixo` para a versão da `main`.
6. Preserva e recarrega `server/.env.production`.
7. Cria um backup do banco.
8. Aplica as migrações pendentes do Prisma.
9. Constrói o frontend na VPS.
10. Reinicia `eixo-server` pelo PM2.
11. Confirma a saúde da API e a disponibilidade do site.

Se a validação, o backup, a migração, o build ou um health check falhar, o workflow termina com erro.

## Acompanhar o deploy

No GitHub:

```text
Actions → deploy → execução mais recente
```

Na VPS:

```bash
pm2 status eixo-server
pm2 logs eixo-server --lines 100 --nostream
```

Endereços de verificação:

```text
https://eixo.agr.br
https://eixo.agr.br/api/health
```

## Configuração da VPS

A preparação inicial do servidor, PostgreSQL, Nginx, SSL e PM2 está documentada em `infra/SETUP_SERVIDOR.md`.

O arquivo `server/.env.production` existe somente na VPS e não deve ser versionado. Antes de qualquer deploy, ele precisa conter as credenciais e configurações reais de produção.

O CI continua usando Node.js 20 até a migração coordenada do projeto e da VPS para Node.js 24.

## Backup

O workflow executa `server/backup.sh` antes das migrações. Os arquivos ficam em `server/backups/` na VPS, com retenção configurada no próprio script.

O backup automático diário pode continuar ativo como proteção adicional.

## Se o deploy falhar

1. Não repita o deploy sem identificar a etapa que falhou.
2. Leia os logs da execução no GitHub Actions.
3. Confira os logs do PM2 e do Nginx na VPS.
4. Corrija o problema em uma nova branch.
5. Para desfazer código já publicado, reverta o commit na `main` por pull request. A reversão iniciará outro deploy automático.

Comandos úteis:

```bash
pm2 logs eixo-server --lines 150 --nostream
sudo nginx -t
sudo tail -n 150 /var/log/nginx/error.log
```

## Deploy manual

O deploy manual deve ser usado somente como contingência e executado na VPS, dentro de `/var/www/eixo`:

```bash
./deploy-manual.sh
```

Antes de executar, confirme que não existe um deploy em andamento no GitHub Actions. O script exige a branch `main`, uma árvore Git limpa e executa backup, atualização, dependências, migrações, build, PM2 e health checks.
