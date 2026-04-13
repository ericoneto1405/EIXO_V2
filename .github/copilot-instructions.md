# EIXO-V2 Custom Instructions

Este repositório é um monorepo Node.js com `frontend` e `server`.

## Stack e estrutura
- `frontend/`: React 19 + TypeScript + Vite + Tailwind.
- `server/`: Express + Prisma + PostgreSQL.
- Navegação principal em `frontend/App.tsx`.
- Componentes de tela em `frontend/components/`.
- Tipos compartilhados do frontend em `frontend/types.ts`.
- Schema e migrations em `server/prisma/`.
- O backend está centralizado em `server/index.js`; evite grandes refactors sem solicitação explícita.

## Regras do projeto
- Preserve o idioma da UI e do domínio em português brasileiro.
- Faça mudanças pequenas e objetivas, sem inventar abstrações desnecessárias.
- Use `buildApiUrl` de `frontend/api.ts` ou adapters de `frontend/adapters/` para chamadas HTTP.
- Requisições autenticadas devem continuar com `credentials: 'include'`.
- Não quebre a descoberta de porta do backend em DEV via `/health`.
- Respeite a separação entre rebanho comercial e P.O. já usada no `HerdModule`.
- Ao alterar contratos de API, atualize backend e frontend juntos.
- Ao alterar o schema Prisma, mantenha migrations, geração do client e serialização da API em sincronia.

## Validação esperada
- `npm run generate`
- `npm run build`

## Cuidados específicos
- Sessão usa cookie HttpOnly; preserve os fluxos `/auth/login` e `/auth/me`.
- O backend devolve datas em ISO string em vários endpoints; mantenha esse contrato.
- Preserve o contexto de fazenda selecionada antes de carregar módulos dependentes.
