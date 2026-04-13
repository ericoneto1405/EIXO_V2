# EIXO-V2 Agent Instructions

## Project Snapshot
- Monorepo Node.js com workspaces `frontend` e `server`.
- `frontend/`: React 19 + TypeScript + Vite + Tailwind.
- `server/`: Express + Prisma + PostgreSQL.
- O domínio e a UI usam português brasileiro. Preserve labels, mensagens e nomes de fluxos nesse idioma.

## Architecture
- O frontend concentra a navegação principal em `frontend/App.tsx`.
- A maioria das telas fica em `frontend/components/`.
- Tipos compartilhados do frontend ficam em `frontend/types.ts`.
- Chamadas de API do frontend devem usar `buildApiUrl` de `frontend/api.ts` ou adapters em `frontend/adapters/`.
- O backend atual é majoritariamente centralizado em `server/index.js`. Evite refactors estruturais grandes sem pedido explícito.
- O schema é definido em `server/prisma/schema.prisma`; migrations e seed ficam em `server/prisma/`.

## Working Rules
- Faça mudanças pequenas e localizadas, acompanhando o padrão já existente.
- Não introduza uma nova camada de abstração sem necessidade clara.
- Mantenha consistência com os nomes de domínio existentes: `fazenda`, `pasto`, `lote`, `rebanho`, `reprodução`, `P.O.`.
- Ao alterar contratos de API, atualize serialização, parsing e consumo no frontend no mesmo trabalho.
- Datas enviadas pelo backend devem continuar em ISO string quando o frontend já consome nesse formato.

## Frontend Guidance
- Preserve o fluxo de fazenda selecionada (`selectedFarmId`) antes de carregar módulos dependentes.
- Respeite a distinção entre rebanho comercial e P.O.; o `HerdModule` usa `resolvedMode` para isso.
- Para autenticação e dados protegidos, mantenha `credentials: 'include'` nas requisições.
- Não hardcode URLs do backend dentro de componentes. Use `buildApiUrl`.
- Não quebre a descoberta dinâmica de porta em DEV implementada em `frontend/api.ts` via `/health`.
- Reaproveite tipos existentes antes de criar novos tipos duplicados.

## Backend Guidance
- Prisma é a fonte da verdade para o modelo de dados.
- Se mudar schema, atualize migration adequada, rode `npm run generate` e mantenha seed compatível quando necessário.
- Preserve as regras de sessão por cookie HttpOnly e os fluxos `/auth/login` e `/auth/me`.
- Mantenha compatibilidade com `CORS_ORIGIN`, `SESSION_*` e fallback dev `ALLOW_X_USER_ID`.
- Normalize e valide entradas seguindo o padrão já usado no topo de `server/index.js`.
- Ao adicionar campos ou entidades, mantenha os helpers de serialização alinhados com o retorno da API.

## Validation
- Instalação: `npm install`
- Desenvolvimento: `npm run dev`
- Verificação mínima alinhada ao CI:
  - `npm run generate`
  - `npm run build`
- Se alterar fluxos críticos do backend, faça smoke test manual com login, seleção de fazenda e tela afetada.

## Known Constraints
- Não há suíte formal de testes automatizados além do build do frontend e geração do Prisma Client no CI.
- O backend pode subir em portas `3001` a `3010`; o frontend detecta isso automaticamente.
- Em desenvolvimento, o projeto depende de PostgreSQL e variáveis de ambiente em `server/.env`.

## Preferred Change Style
- Prefira corrigir o fluxo existente em vez de reescrever componentes inteiros.
- Ao tocar em módulos grandes, preserve nomes de props, contratos e comportamento visível sempre que possível.
- Documente no README apenas quando a mudança alterar setup, script ou fluxo operacional do projeto.
