# Revisão das migrações do pedido de encerramento — 29/09/2026

Evidência histórica para revisar migrações de encerramento/autoria. Não consultar em deploys sem relação com esse módulo nem tratar contagens e pendências abaixo como estado atual. Execução comum: [DEPLOY.md](DEPLOY.md); controles específicos: [runbook de encerramento](ACCOUNT_CLOSURE_DEPLOY_RUNBOOK.md).

## Estado observado

- Produção consultada somente para leitura: 23 MB. As migrações `20260921120000` e `20260926120000` já constam como aplicadas. As três colunas e os três índices de idempotência existem.
- Há 0 vínculos de mãe ou pai entre contas diferentes no estado atual. Esse número não informa quantos vínculos a migração anterior pode ter corrigido quando foi aplicada.
- Produção tem 6 fazendas organizacionais com autoria em `Farm.userId`, 1 código de ativação com `createdById` e 0 linhas com autoria nas outras 28 tabelas da migração. Há 0 linhas em `AnimalEditLog` e 0 fazendas legadas sem organização.
- O banco de desenvolvimento tem 31 MB, 2 fazendas e 6 linhas com autoria nas demais tabelas. Num clone descartável, as 7 migrações pendentes terminaram em 1,79 s; os 27 animais e as 2 fazendas permaneceram, e 8 registros de autoria foram criados em `ActivityLog`. O clone foi removido.

## Decisões técnicas

1. As duas migrações anteriores não precisam ser reaplicadas em produção. Confirmar novamente o estado de `_prisma_migrations` antes do deploy. O desenvolvimento ainda as tinha pendentes no momento da revisão.
2. O volume atual de autoria em produção é pequeno: 7 linhas a transferir. O ensaio local indica operação curta, mas não garante duração em produção. A migração `20260929130000` executa alterações e atualizações em várias tabelas numa transação; publicar com backup concluído, em período de baixo uso, e verificar bloqueios e integridade depois.
3. A regra para uma eventual fazenda legada sem organização continua pendente. A rota atual bloqueia a exclusão do usuário vinculado a ela.

O pedido de encerramento apenas gera protocolo. `releaseEnabled` permanece `false`; nenhuma decisão acima autoriza exclusão real. Nenhuma migração foi aplicada em produção nesta revisão.

## Ensaio com snapshot recente de produção

- Um backup privado de `eixo_prod` foi restaurado em um banco isolado na VPS. A restauração terminou sem erro; o banco e o arquivo temporários foram removidos após o ensaio.
- O Prisma encontrou 85 migrações e aplicou somente as cinco de `20260929100000` a `20260929140000` na cópia, em 2,49 s. O status final não mostrou pendências.
- As contagens das 112 tabelas de negócio comparadas antes e depois ficaram iguais. Antes havia 6 fazendas com autoria direta, 1 código de ativação com autoria direta e 0 edições em `AnimalEditLog`; depois, essas 7 autorias constavam em `ActivityLog`, e os campos diretos ficaram vazios.
- Na branch integrada à `main`, passaram TypeScript, build, validação Prisma, 247 testes do backend, validação do EIXO Suporte, auditoria de dependências e o teste de integração do protocolo sem skip. A tela foi conferida com proprietário e gestor fictícios.
- O backup final da janela de publicação ainda deverá ser criado e restaurado em banco isolado antes da mesclagem; o ensaio acima não substitui esse controle.
