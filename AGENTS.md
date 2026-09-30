# EIXO V2 — Regras do projeto

## Segurança e contratos

- Preserve o isolamento entre organizações e fazendas; confira o escopo aplicado pelas rotas envolvidas.
- Alterações no contrato de API usado pelo EIXO Campo exigem autorização explícita.
- Encerramento da conta: o protocolo pode ser registrado, mas a exclusão real permanece bloqueada até as três pendências terem decisão registrada e as migrações necessárias estarem aplicadas.

## Interface e integração

- Preserve a paleta, os componentes e a terminologia da tela existente. Use “Pasto” e “Fazendas e Pastos” nos contextos correspondentes.
- Para novas confirmações, reutilize o modal visual existente, com Cancelar e ação clara. Não introduza `window.confirm` ou `window.alert`; não refatore usos antigos fora do pedido.
- Prefira os adaptadores existentes em `frontend/adapters/`; use `buildApiUrl` e mantenha `credentials: 'include'` nas chamadas autenticadas. Não reorganize chamadas existentes sem necessidade.

## Validação

- Após alterar frontend: `npx tsc -p frontend/tsconfig.json --noEmit`.
- Cumpra testes adequados ao risco e todos os controles obrigatórios de deploy.
- Só documentação: revise o conteúdo e execute `git diff --check`.
- Alterar o schema não autoriza aplicar migrações automaticamente; siga o fluxo aprovado e o ambiente correto.

## Deploy

Siga integralmente `infra/DEPLOY.md`.

- `Prepare o deploy do lote atual.`: revise o lote, execute as validações seguras disponíveis e apresente arquivos, alterações, migrações, resultados e riscos. Reúna pendências em uma única consulta e, com o lote pronto, solicite uma única autorização para publicar. Aguarde antes de commit, push, PR, mesclagem ou deploy.
- `Autorizo o deploy completo do lote apresentado.` ou pedido equivalente de publicação de um escopo definido: execute o fluxo completo de `infra/DEPLOY.md`, sem exigir que o usuário enumere cada etapa nem reconfirmar ações já autorizadas.
- Escolha branch, mensagem de commit e título/descrição do PR conforme as convenções do projeto. Preserve arquivos alheios fora do lote; consulte somente se houver dúvida ou dependência que impeça separá-los. Permissões técnicas da ferramenta continuam obrigatórias.
- Pare por risco alto, teste/backup falhando, arquivos alheios no lote, ação destrutiva não autorizada ou mudança inesperada de banco/produção. Não repita deploy falho automaticamente.
