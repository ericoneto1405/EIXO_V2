# EIXO V2 — Guia de Deploy em Produção

## Fluxo oficial

O deploy de produção é automático pelo GitHub Actions:

```text
branch de trabalho → pull request → main → validação → VPS → produção
```

O arquivo responsável é `.github/workflows/deploy.yml`. O deploy começa somente após uma atualização da branch `main`.

## Autorização do fluxo completo

O deploy só deve ser iniciado quando o usuário solicitar explicitamente a publicação completa.

Quando o pedido incluir commit, push, pull request e deploy, essas etapas ficam autorizadas em conjunto:

1. validar o código;
2. criar o commit;
3. fazer push da branch de trabalho;
4. abrir o pull request;
5. acompanhar o CI;
6. mesclar o pull request na `main`;
7. acompanhar o deploy automático;
8. validar a aplicação em produção.

Não pedir uma nova confirmação entre essas etapas. Interromper e consultar o usuário somente se houver risco alto, teste ou backup com falha, alteração local fora do escopo, ação destrutiva ou mudança não prevista de banco ou configuração de produção.

Autorizações técnicas solicitadas pelo sistema operacional ou pela ferramenta continuam obrigatórias quando aparecerem.

## Antes do deploy

- Trabalhar em uma branch separada.
- Revisar o diff e confirmar o escopo.
- Validar o TypeScript e o build.
- Executar os testes do backend e validar o conhecimento do EIXO Suporte.
- Abrir um pull request para `main`.
- Mesclar somente com o CI aprovado.

Os secrets `VPS_HOST`, `VPS_USER` e `VPS_SSH_KEY` devem estar configurados no GitHub. Consulte `.github/SECRETS_SETUP.md`.

## O que o workflow executa

1. Instala as dependências com `npm ci`.
2. Gera o Prisma Client.
3. Valida o TypeScript e constrói o frontend.
4. Executa os testes do backend e valida links, tópicos e atualização do EIXO Suporte.
5. Conecta na VPS por SSH.
6. Atualiza `/var/www/eixo` para a versão da `main`.
7. Preserva e recarrega `server/.env.production`.
8. Cria um backup do banco.
9. Aplica as migrações pendentes do Prisma.
10. Constrói o frontend na VPS.
11. Reinicia `eixo-server` pelo PM2.
12. Confirma a saúde da API, a versão ativa do EIXO Suporte e a disponibilidade do site.

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

## Implantação gradual do EIXO Suporte

Configure `SUPPORT_ROLLOUT_MODE` no `server/.env.production`:

- `shadow`: gera a resposta candidata apenas para revisão no HQ e encaminha o cliente para a Equipe EIXO;
- `pilot`: mostra a nova resposta somente às organizações listadas em `SUPPORT_PILOT_ORGANIZATION_IDS`;
- `full`: libera o novo autoatendimento para todos.

Use IDs de organização separados por vírgula no piloto. Avance de `shadow` para `pilot` e depois para `full` somente quando segurança, precisão, links e satisfação estiverem dentro das metas do plano.

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
