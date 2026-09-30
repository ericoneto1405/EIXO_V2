# EIXO V2 — Guia de Deploy em Produção

## Fluxo oficial

O deploy de produção é automático pelo GitHub Actions:

```text
branch de trabalho → pull request → main → validação → VPS → produção
```

O arquivo responsável é `.github/workflows/deploy.yml`. O deploy começa somente após uma atualização da branch `main`.

## Autorização do fluxo completo

Uma autorização de publicação cobre o fluxo completo de um lote definido. Não é necessário que o usuário enumere commit, push, PR e mesclagem, nem use uma frase exata. A autorização vale para esse lote e ambiente, não para publicações futuras.

### Preparar antes de pedir autorização

`Prepare o deploy do lote atual.` autoriza revisar e preparar, sem commit, push, PR, mesclagem ou publicação:

1. Conferir branch, diff, arquivos novos, commits ainda não publicados e a base remota atualizada. Delimitar o lote com o contexto da tarefa; não incluir automaticamente tudo que estiver alterado.
2. Revisar migrações, dependências e configurações necessárias; executar as validações seguras disponíveis e verificar acesso ao GitHub e execuções de deploy em andamento. Não instalar dependências nem aplicar migrações sem autorização correspondente.
3. Apresentar um resumo único com arquivos incluídos/excluídos, comportamento alterado, migrações e seus efeitos, resultados das validações, risco e recuperação prevista. Informar verificações bloqueadas ou pendentes, sem tratá-las como aprovadas.

Resolva por leitura tudo que puder antes de perguntar. Se faltar uma decisão necessária sobre escopo, acesso ou banco, reúna as pendências conhecidas em uma única consulta. Com o lote concreto e pronto, solicite uma única autorização: **“Autoriza o deploy completo do lote apresentado?”** Se o usuário já autorizou explicitamente esse mesmo escopo, prossiga sem repetir a pergunta.

### Executar após a autorização

`Autorizo o deploy completo do lote apresentado.` ou pedido equivalente autoriza, em conjunto:

1. criar ou usar uma branch `codex/`, atualizar a base e resolver conflitos rotineiros preservando o escopo;
2. instalar as dependências travadas quando necessário, gerar o Prisma Client e concluir as validações;
3. selecionar somente as alterações aprovadas, criar o commit, fazer push e abrir o PR;
4. acompanhar o CI e mesclar na `main` somente com as verificações aprovadas;
5. acompanhar o workflow, incluindo backup, migrações apresentadas e aprovadas, build e reinício do serviço;
6. conferir a versão publicada, saúde da API, site e funcionamento do escopo alterado.

Escolha nome de branch, mensagem de commit e texto do PR conforme as convenções do projeto, sem consultas separadas. Use staging seletivo; nunca `git add -A` em árvore com escopos diferentes. A existência de arquivos alheios não exige nova pergunta quando eles podem ficar preservados e separados do lote aprovado.

O `prisma migrate deploy` aplica **todas** as migrações pendentes no banco de destino. A revisão deve identificar esse conjunto antes da mesclagem, inclusive migrações anteriores ao lote. Uma migração inesperada exige revisão e autorização; editar o schema não autoriza aplicá-la. O bloqueio de exclusão real de contas definido em `AGENTS.md` continua válido.

### Quando interromper

Pare diante de risco alto, validação ou backup com falha, conflito que exija decisão de negócio, arquivos alheios incluídos no lote, ação destrutiva não autorizada ou mudança inesperada de banco/configuração de produção. Investigue com leituras seguras e informe o bloqueio concreto. Consulte apenas sobre a decisão nova, sem pedir novamente autorização para todo o fluxo. Não repita um deploy falho automaticamente.

Permissões técnicas da ferramenta, autenticação e eventuais aprovações do ambiente `production` no GitHub continuam obrigatórias quando aparecerem; a autorização na conversa não elimina esses controles. Explique a origem da solicitação, sem pedir confirmação adicional na conversa para a mesma ação.

## Antes do deploy

- Trabalhar em uma branch separada.
- Revisar o diff e verificar o escopo aprovado, incluindo commits já existentes na branch.
- Gerar o Prisma Client (`npm run generate`), validar o TypeScript (`npx tsc -p frontend/tsconfig.json --noEmit`) e o build (`npm run build`).
- Executar `npm audit --audit-level=moderate`, `npm test --workspace server` e `npm run support:validate --workspace server`. Para o Suporte, usar `SUPPORT_BASE_SHA` com o SHA da base revisada, como no CI.
- Validar o schema com `npx prisma validate --schema server/prisma/schema.prisma`, sem aplicar migrações, e executar `git diff --check`.
- Abrir um pull request para `main`.
- Mesclar somente com o CI aprovado.

Reutilize resultados locais da mesma versão e ambiente. Repita verificações afetadas por alterações, conflitos resolvidos ou falhas; os controles obrigatórios dos workflows de PR e produção sempre devem rodar. Não informe teste visual ou autenticado como aprovado sem executá-lo.

Os secrets `VPS_HOST`, `VPS_USER` e `VPS_SSH_KEY` devem estar configurados no GitHub. Consulte `.github/SECRETS_SETUP.md`.

## O que o workflow executa

1. Instala as dependências com `npm ci`.
2. Audita dependências e gera o Prisma Client.
3. Executa os testes do backend e valida links, tópicos e atualização do EIXO Suporte.
4. Valida o TypeScript e constrói o frontend.
5. Conecta na VPS por SSH.
6. Atualiza `/var/www/eixo` para o commit da `main` que iniciou o workflow.
7. Preserva e recarrega `server/.env.production`.
8. Instala as dependências na VPS e cria um backup do banco.
9. Aplica as migrações pendentes do Prisma.
10. Constrói o frontend na VPS.
11. Reinicia `eixo-server` pelo PM2.
12. Confirma a saúde da API, a versão ativa do EIXO Suporte e a disponibilidade do site.

Se a validação, o backup, a migração, o build ou um health check falhar, o workflow termina com erro.

**Versão publicada:** a VPS usa o SHA que iniciou o workflow (`github.sha`), fixando o deploy no commit validado. A concorrência configurada serializa as execuções. Confira se o `releaseSha` publicado corresponde ao commit esperado. Não há rollback automático.

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
5. Se for necessário desfazer código já publicado, apresente a reversão por PR e obtenha autorização quando ela ainda não estiver prevista no plano aprovado. A mesclagem iniciará outro deploy automático; reverter código não desfaz migrações nem restaura dados.

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
