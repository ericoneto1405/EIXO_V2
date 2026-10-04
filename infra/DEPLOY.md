# Deploy do EIXO — fonte canônica

Único procedimento comum: **branch → PR → CI → main → GitHub Actions → VPS**. Leia este arquivo uma vez; não busque outros guias sem indicação abaixo. Nunca execute setup ou configuração de secrets em deploy normal.

## Fluxo em três passos

1. **Preparar:** conferir branch, `git status --short`, diff, arquivos novos e commits do lote. Atualizar a referência remota uma vez (`git fetch origin main`). Delimitar inclusões/exclusões; revisar dependências, configuração, migrações pendentes no destino e recuperação. `bash infra/deploy-plan.sh <base-revisada> HEAD` mostra a seleção entre commits; alterações locais também precisam de revisão.
2. **Validar e publicar:** `bash infra/deploy-validate.sh <base-revisada>` reúne as verificações locais ainda necessárias, sem instalar dependências ou aplicar migrações. Com autorização, usar branch `codex/`, atualizar a base preservando o escopo, selecionar arquivos, criar commit/push/PR. Mesclar somente com CI aprovado. O workflow `deploy` valida o SHA mesclado e chama o executor da VPS.
3. **Conferir:** acompanhar `gh run watch <id> --exit-status`. Registrar PR, SHA, execução, backup e pendências. O executor já verifica API local/pública, site e versão: não repetir após sucesso. Conferir login, estabilidade do processo e fluxo alterado; se não houver sessão, registrar a pendência. HTTP saudável não comprova teste autenticado/visual.

**Não repetir comandos já executados com sucesso nesta execução, salvo se uma etapa posterior exigir explicitamente sua repetição.** Reutilizar evidências da mesma versão, diff e ambiente; mudança relevante, conflito resolvido ou falha invalida apenas os checks afetados. PR e commit mesclado são versões distintas e mantêm seus controles obrigatórios.

## Autorização e interrupção

- **“Prepare o deploy do lote atual”** autoriza revisão e validações seguras, sem instalação, migração, commit, push, PR, mesclagem ou publicação. Verificar acesso e deploys em andamento; apresentar lote, exclusões, efeitos das migrações, resultados, bloqueios, risco e recuperação. Reunir decisões pendentes numa consulta e pedir uma única autorização de publicação.
- **Autorização de deploy completo de um lote definido** cobre branch, atualização/conflitos rotineiros, dependências travadas necessárias, validações, commit, push, PR, mesclagem e execução/pós-deploy. Não exigir frase exata nem reconfirmar etapas. Escolher nomes conforme convenções do projeto. A autorização não vale para futuros lotes.
- Preservar arquivos alheios; nunca `git add -A` em árvore mista. Permissões técnicas, autenticação e aprovações do ambiente `production` continuam obrigatórias.
- Parar por risco alto, teste/backup falhando, conflito com decisão de negócio, inclusão alheia, ação destrutiva não autorizada ou mudança inesperada de banco/configuração. Consultar somente a decisão nova; nunca repetir deploy falho automaticamente.
- `prisma migrate deploy` aplica **todas** as migrações pendentes. Identificar e autorizar o conjunto antes da mesclagem, inclusive pendências antigas. Alterar schema não autoriza migração. A exclusão real de contas permanece bloqueada conforme `AGENTS.md`.

## Documentação somente quando necessária

| Documento | Quando consultar |
|---|---|
| [SETUP_SERVIDOR.md](SETUP_SERVIDOR.md) | Servidor novo/infraestrutura inicial, com autorização própria. |
| [SECRETS_SETUP.md](../.github/SECRETS_SETUP.md) | Configurar/rotacionar secrets ou diagnosticar autenticação. |
| [ACCOUNT_CLOSURE_DEPLOY_RUNBOOK.md](ACCOUNT_CLOSURE_DEPLOY_RUNBOOK.md) | Alteração no encerramento de conta ou suas migrações. |
| [ACCOUNT_CLOSURE_MIGRATION_REVIEW.md](ACCOUNT_CLOSURE_MIGRATION_REVIEW.md) | Revisão das migrações de encerramento/autoria; evidência histórica, não estado atual. |
| [Checklist de e-mail](../server/docs/password-reset-email-delivery-checklist.md) | Recuperação de senha, entrega, provedor, remetente, DNS ou falha de entrega. |
| [PLANO_EIXO_SUPORTE.md](../docs/PLANO_EIXO_SUPORTE.md) | Atendimento, conhecimento, provedor ou rollout do Suporte. |

Validar automaticamente o conhecimento não exige ler o plano inteiro.

## Seleção incremental

`infra/deploy-plan.sh` concentra as regras. Arquivos desconhecidos recebem seleção conservadora; checkout local alterado recebe validação completa.

| Mudança | Validação | VPS |
|---|---|---|
| Documentos reconhecidos | Diff + testes leves da automação no CI | Checkout e saúde; mantém versão ativa |
| Frontend | TypeScript, build, conhecimento | Backup, build e reinício da API para atualizar versão |
| Backend | Prisma generate/validate, testes backend, conhecimento | Backup e reinício; mantém build |
| Dependências/lock/vendor | Auditoria moderada e validação completa | Backup, instalação, Prisma, build e reinício |
| Schema/migrações | Prisma, testes backend, conhecimento | Backup, Prisma e migrações novas |
| Automação/desconhecido | Completa | Preparação conservadora; migrações somente se necessárias |

Na VPS, comparar com **a última publicação confirmada**, acumulando mudanças não publicadas. Primeiro uso sem histórico exige preparação completa e revisão de todas as migrações pendentes. Dependências/build ausentes obrigam reconstrução; mudança no ambiente detectada por hash privado força build/reinício. Não alterar manualmente banco, dependências ou artefatos sem plano próprio.

Runners limpos precisam instalar dependências quando validam aplicação. Backend mantém testes integrais porque não há mapa seguro de dependências entre módulos. Conhecimento é validado para mudanças de aplicação, incluindo telas/permissões. Durante a exceção abaixo, a auditoria roda em toda validação de aplicação para conferir o prazo e novos alertas; documentos isolados continuam sem build/auditoria.

Build do CI valida código; build da VPS usa o ambiente de produção. Transferir artefatos exige comprovar equivalência antes. Node.js 20 permanece no CI; a VPS consultada em 03/10/2026 usa Node.js 22.23.3. Não alterar versões durante deploy; qualquer alinhamento exige revisão própria. Não prometer redução de duração/tokens medida sem execução real.

## Exceção temporária de auditoria

Aprovada em 03/10/2026, válida até **10/10/2026 às 14:18:26 UTC (11:18:26 na Bahia)**, sem renovação automática. Responsável: manutenção técnica do EIXO. Abrange somente `GHSA-vfj7-8cjw-p6xm`, em `braces`, e os efeitos exclusivamente derivados dele em chokidar, micromatch, fast-glob, nodemon e Tailwind. Não corrige a vulnerabilidade.

`node infra/audit-dependencies.mjs` executa a auditoria completa e aplica `infra/audit-exception.json`. Mantém o limiar `moderate`: outros alertas moderados/altos/críticos, falhas de rede, saída inválida e causas desconhecidas bloqueiam. A exceção é exibida no resultado; não usar `--omit=dev` nem desligar a auditoria. Quando ela for necessária, vencimento ou mudança no hash do lockfile, manifests, configuração de build, execução, workflows ou código rastreado do servidor bloqueia seu uso. Não atualizar o hash/prazo para contornar falhas; exigir nova revisão e aprovação.

Evidência: `braces` está na cadeia de desenvolvimento/build; o Tailwind usa padrões fixos, uploads ficam fora dessas pastas e o PM2 está configurado sem Nodemon/watch. Porém ferramentas de build são instaladas na VPS. **A aprovação desta exceção não autoriza publicação:** confirmar na VPS a correspondência do processo/configuração com o repositório, ausência de servidor de desenvolvimento exposto e controle dos arquivos de build antes de mesclar. Conferência somente de leitura em 03/10/2026: SHA ativo `769396a`, PM2 executando `server/index.js` com `watch=false`, sem listeners nas portas de desenvolvimento 5173/4173; hashes de Tailwind, Vite, lockfile e configuração versionada do PM2 iguais aos revisados. A API local/pública respondeu saudável na porta 3001 e as 85 migrações estavam aplicadas. Os três arquivos não versionados foram arquivados com autorização em `/var/backups/eixo-predeploy.b5aQct`, com checksums conferidos. Em 04/10/2026, a revisão autorizada da correção de permissões do build atualizou o contexto da exceção, sem ampliar o alerta ou prorrogar o vencimento. Revalidar se houver mudança de contexto. Após correção oficial, remover a exceção em revisão própria; uma auditoria sem esse alerta passa sem utilizá-la.

## Executor e proteções

O workflow busca o SHA validado e chama `infra/deploy.sh <SHA>` em `/var/www/eixo`. Contingência autorizada: `bash deploy-manual.sh <SHA>`, **somente na VPS**, após validar o SHA e confirmar ausência de deploy concorrente. Ambos usam o mesmo executor.

- Trava `flock`; rejeita árvore alterada, SHA fora da `main`, publicação antiga/divergente, estado inválido ou execução incompleta.
- Preserva `server/.env.production` no lugar; bloqueia ambiente versionado. Nunca versionar credenciais nem apontar produção ao banco de desenvolvimento.
- Backup por `server/backup.sh` antes de instalação/migração/build/reinício; retenção de sete dias em `server/backups/`. Manter backup diário adicional. Migração existente alterada/removida bloqueia publicação.
- Recria apenas `eixo-server` quando necessário, removendo variáveis antigas, e salva o PM2. Confere saúde local/pública, site e `releaseSha` do Suporte.
- Mantém logs e backups privados; após build, libera leitura apenas dos arquivos públicos de `frontend/dist` (diretórios 755, arquivos 644), sem seguir links simbólicos.
- Grava sucesso atomicamente em `.git/eixo-deploy/success`. Mesmo SHA confirmado não repete publicação; verifica saúde. Documentação pode atualizar o checkout sem mudar a versão ativa.

Pré-requisitos existentes: Git, Node/npm, PM2, curl, PostgreSQL/pg_dump e `flock`. Ausência interrompe; não instalar ferramentas do sistema durante deploy.

## Falha e recuperação

Falha retorna código não zero e etapa explícita. `.git/eixo-deploy/in-progress` bloqueia nova execução; `previous` registra o SHA anterior. Logs privados: `.git/eixo-deploy/<SHA>-<etapa>.log`, inclusive evidência do backup. Consultar `gh run view <id> --log-failed`; aprofundar somente nas últimas 40 linhas pertinentes de PM2/Nginx/log privado, revisando segredos antes de compartilhar. Nunca imprimir logs completos ou contínuos por padrão.

Antes de retomar, revisar causa, etapas concluídas, banco, checkout, artefatos e processo ativo. Apresentar recuperação; liberar o marcador/reconciliar estado apenas após revisão e autorização. Não apagar estado para forçar repetição.

**Não há rollback automático nem troca atômica de releases:** build/reinício pode causar indisponibilidade. Preferir reversão por PR, autorizada quando fora do plano. Reverter código não desfaz migrações. Restauração exige backup + SHA compatível, prova em banco isolado e autorização explícita por ser destrutiva; manter manutenção quando aplicável.

Endpoints: `https://eixo.agr.br`, `https://eixo.agr.br/api/health`, `http://127.0.0.1:<PORT>/health` (porta definida no ambiente; 3001 na VPS consultada em 03/10/2026). Falha, versão divergente ou reinício contínuo impedem declarar sucesso.
