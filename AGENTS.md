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

- A fonte canônica é [infra/DEPLOY.md](infra/DEPLOY.md); não procurar outros procedimentos salvo indicação explícita dela.
- Não executar setup de servidor nem configuração de secrets em deploy normal.
- Runbooks específicos só devem ser consultados quando o componente correspondente for afetado.
- Não repetir comandos já executados com sucesso nesta execução, salvo exigência explícita de etapa posterior.
- Preferir scripts determinísticos do repositório a sequências manuais.
- Preservar segurança, migrações necessárias, backup, healthchecks e planejamento de rollback definidos na fonte canônica.
