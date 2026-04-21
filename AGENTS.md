# EIXO V2 — Guia para Agents

## Sobre o projeto
Sistema web de gestão de pecuária de corte chamado **EIXO V2** (nomenclatura de desenvolvimento).
Stack: Node.js + Express + Prisma + PostgreSQL no backend. React + TypeScript + Vite + Tailwind no frontend.
Multi-tenant: cada usuário tem uma Organization. Autenticação por sessão com cookie.

---

## Estrutura de pastas

```
EIXO V2/
├── server/
│   ├── index.js                  ← todas as rotas da API
│   ├── nutritionModule.js        ← módulo de nutrição separado
│   └── prisma/
│       ├── schema.prisma         ← modelos do banco de dados
│       └── migrations/           ← histórico de migrations
├── frontend/
│   ├── components/               ← componentes React
│   ├── adapters/                 ← funções de chamada à API
│   ├── types.ts                  ← tipos TypeScript compartilhados
│   ├── api.ts                    ← buildApiUrl e config de API
│   ├── App.tsx                   ← roteamento principal
│   └── tsconfig.json
```

---

## Comandos importantes

| Ação | Comando |
|------|---------|
| Validar TypeScript | `npx tsc -p frontend/tsconfig.json --noEmit` |
| Rodar migração | `npx prisma migrate dev --name <nome>` |
| Validar schema | `npx prisma validate` |
| Destravar migração antiga | `npx prisma migrate resolve --applied <nome_da_migration>` |
| Build frontend | `npm run build` (na pasta frontend) |

---

## Regras obrigatórias — nunca ignorar

1. **Nunca avançar de fase sem confirmar que a anterior passou sem erros.**
2. **Após alterar schema.prisma**, sempre rodar `npx prisma migrate dev`.
3. **Após alterar qualquer arquivo frontend**, sempre rodar `npx tsc -p frontend/tsconfig.json --noEmit`.
4. **Nunca usar `window.confirm` ou `window.alert`** — substituir por modal visual.
5. **Nunca resetar o banco de dados** (`prisma migrate reset`) sem autorização explícita do usuário.
6. **Nunca alterar mais arquivos do que o necessário** — se a tarefa pede mudança em um arquivo, não tocar nos outros.
7. **Nunca inventar conteúdo de arquivos anexados** — se um anexo não estiver disponível, parar e avisar.

---

## Padrão visual do sistema

O sistema usa uma paleta stone/amber consistente. **Nunca usar classes gray/dark no lugar desse padrão.**

| Elemento | Classe / Valor |
|----------|----------------|
| Fundo principal | `bg-[#ede3d0]` |
| Fundo card | `bg-[#fffaf1]` |
| Borda padrão | `border-[#d7cab3]` |
| Título principal | `text-[#2f3a2d]` |
| Texto secundário | `text-[#6d6558]` |
| Botão primário | `bg-[#9d7d4d]` hover `bg-[#8f7144]` |
| Botão excluir | `bg-[#fbede8]` texto `text-[#8c4d39]` |
| Border radius | `rounded-2xl` ou `rounded-[24px]` |
| Header tabela | `bg-[#f1e7d8]` texto `text-[#74644e]` |

---

## Padrões de código — backend (server/index.js)

- Todas as rotas usam `buildFarmScopeFilter(req)` e `buildFarmRelationFilter(req)` para isolar dados por organização/usuário.
- Funções auxiliares já existentes: `parseDateValue()`, `parseNumber()`, `parseInteger()`, `normalizeSexo()`.
- Serialização: criar função `serializeXxx()` para cada novo model antes de retornar ao frontend.
- Erros Prisma: código `P2002` = unique constraint (brinco duplicado).
- Novas rotas sempre entram **antes** da linha `const MAX_PORT_ATTEMPTS = ...`.

---

## Padrões de código — frontend

- Adaptadores de API ficam em `frontend/adapters/` — um arquivo por módulo (ex: `herdApi.ts`, `nutritionApi.ts`).
- Nunca fazer fetch direto nos componentes — sempre usar função do adapter.
- Importar `buildApiUrl` de `'../api'` para montar URLs.
- Credenciais sempre com `credentials: 'include'` nos fetch.
- Modais de confirmação/exclusão: overlay escuro + card centralizado, botão Cancelar + botão de ação destrutiva em vermelho.

---

## Modelos Prisma existentes (principais)

- `User` — usuário do sistema
- `Organization` / `OrganizationMembership` — multi-tenancy
- `Farm` — fazenda (tem `userId` e `organizationId`)
- `Paddock` — pasto/divisão da fazenda
- `Animal` — animal do rebanho comercial
- `PoAnimal` — animal do plantel P.O. (puro de origem)
- `Lot` — lote do rebanho comercial
- `PoLot` — lote do plantel P.O.
- `PaddockMove` — movimentação de animal entre pastos
- `HerdEvent` — eventos de inventário (NASCIMENTO, COMPRA, VENDA, MORTE)
- `SanitaryRecord` — registros sanitários (VACINA, VERMIFUGO, TRATAMENTO)

---

## Módulos do sistema (telas)

| Módulo | Status |
|--------|--------|
| Visão Geral (dashboard) | ativo |
| Estrutura da Fazenda | ativo — fazendas e pastos |
| Manejo do Rebanho | ativo — rebanho comercial e P.O. |
| Eixo Acasalamento (antes: Eixo Genetics) | placeholder parcial |
| Confinamento e Contratos | placeholder |
| Nutrição | ativo |
| Mapa da Fazenda | placeholder |
| Equipe e Permissões | placeholder |

---

## Terminologia do domínio

| Termo técnico | Termo correto no sistema |
|---------------|--------------------------|
| Divisão / Setor | **Pasto** |
| Fazendas e Setores | **Fazendas e Pastos** |
| E-mail corporativo | **E-mail** |
| Rebanho Comercial | manter como está |
| Plantel P.O. | manter como está |

---

## Segurança

- `ALLOW_X_USER_ID=true` só pode estar ativo em desenvolvimento. O servidor aborta se detectar isso em produção.
- Nunca expor senhas — usar `sanitizeUser()` antes de retornar dados de usuário.
- Rota pública de cadastro: `POST /register` — fica **antes** do middleware `requireAuth`.
