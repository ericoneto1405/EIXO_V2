# Publicação do encerramento da conta EIXO

Consultar somente quando o lote afetar encerramento de conta ou suas migrações. Este runbook acrescenta controles específicos ao [deploy canônico](DEPLOY.md), sem substituir seu executor.

O lote original de 29/09/2026 incluía cinco migrações de banco. O pedido gera apenas protocolo. A exclusão real deve permanecer com `releaseEnabled: false`.

## Antes da janela

1. Confirmar PR e CI aprovados, os arquivos do lote revisados, nenhuma alteração alheia ao pedido e o conjunto real de migrações pendentes em produção (não presumir que as cinco históricas continuam pendentes).
2. Definir uma janela de baixo uso e avisar os usuários antes dela. Não mesclar o PR enquanto o aviso e a janela não estiverem confirmados.
3. Registrar o SHA atualmente publicado, as contagens das tabelas de negócio e de autoria, e confirmar que não há outro deploy em andamento.

## Congelar e proteger os dados

1. Na VPS, definir `EIXO_MAINTENANCE_MODE=on` em `server/.env.production` e parar `eixo-server` no PM2. Conferir que não há outro processo gravando em `eixo_prod`.
2. Executar `bash server/backup.sh`. Guardar o nome do arquivo gerado, conferir que não está vazio e que `gzip -t` passa.
3. Restaurar **esse backup final** em um banco descartável, separado de `eixo_prod`, na própria VPS. Conferir as contagens e o histórico. Remover o banco descartável após a prova.
4. Se qualquer verificação falhar, não mesclar. Repor `EIXO_MAINTENANCE_MODE=off`, carregar o ambiente e reiniciar o servidor antigo.

## Publicar e conferir

1. Mesclar o PR. Seguir `infra/DEPLOY.md` e confirmar que o workflow publicou o SHA da mesclagem, criou o backup automático de proteção da execução (o backup congelado e restaurado acima continua sendo a prova específica desta janela), aplicou somente o conjunto pendente revisado e autorizado e passou nas checagens.
2. O servidor reinicia ainda em manutenção: `/health` e `/api/chat/knowledge-status` continuam disponíveis; as demais rotas da API respondem `503` com `Retry-After`. O site estático pode responder `200`, mas isso **não** significa que o acesso dos usuários foi liberado.
3. Antes de reabrir, comparar as contagens com a linha de base congelada, conferir as autorias transferidas para `ActivityLog`, a tabela de protocolos, a trava de exclusão real e os logs do PM2. Não criar um pedido real apenas para testar.
4. Se tudo estiver correto, definir `EIXO_MAINTENANCE_MODE=off`, carregar `server/.env.production` e reiniciar `eixo-server` com `--update-env`. Confirmar login, tela do proprietário e do gestor, API e site públicos. Avisar o fim da janela.

## Se houver falha

Manter a manutenção ativa e não repetir o deploy. Se a falha ocorreu antes das migrações, voltar ao código anterior e reiniciar o serviço. Se ocorreu depois, usar o backup final congelado e o SHA anterior em uma restauração coordenada, conferindo o banco e o aplicativo antes de liberar acesso. A restauração em produção é destrutiva e exige revisão explícita do incidente.
