# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Como responder
- Direto e curto. Sem "vou fazer", "feito!", "perfeito!".
- Sem introdução, resumo ou repetição de contexto.
- Em português. Linguagem simples (Erico é iniciante em programação).
- Usar tokens com responsabilidade: criatividade quando agrega, concisão quando é execução.
- Ler só seções relevantes de arquivos; não rodar comandos exploratórios sem hipótese clara.

## Aprovação obrigatória
Toda alteração em `.tsx`, `.ts`, `.js`, `.css`, `.prisma`, `.sql`, `.yml` exige aprovação antes de executar.

Antes de alterar, apresentar em até 5 linhas:
- **O que muda** / **Onde** (arquivo + linha) / **Por quê**

Só executar após "sim", "ok", "pode" ou similar.

---

## Stack

**Monorepo npm workspaces:** `frontend/` + `server/`

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React + Vite + TypeScript + Tailwind CSS 3 |
| Server | Node.js + Express (ESM) + Prisma 6 (PostgreSQL) |
| Deploy | GitHub Actions → push em `main` → SSH no VPS → `prisma migrate deploy` + `npm run build` + `pm2 reload` |

## Comandos

```bash
npm run dev          # frontend (5173) + server (3001) juntos
npm run dev:server   # só o server
npm run build        # build do frontend (Vite)
npm run generate     # prisma generate
npm run migrate      # prisma migrate dev
npm run studio       # Prisma Studio
```

CI roda `tsc --noEmit` no frontend **e** `vite build`. Erro de build é sempre no Vite, não no tsc isolado.

---

## Arquitetura

### Server (`server/index.js`)
Entry point único. Cada módulo expõe uma função `register*Routes(app)` chamada no topo do `index.js`. Não há roteador central — cada módulo usa `app.get/post/put/delete` diretamente. Cada módulo cria sua própria instância de PrismaClient.

```
server/
  index.js                  ← entry point
  acasalamentoModule.js     ← acasalamento (na raiz, não extraído para modules/)
  nutritionModule.js        ← nutrição (na raiz, não extraído para modules/)
  modules/
    auth/authRoutes.js      ← sessão via cookie httpOnly, bcrypt, Twilio OTP
    users/userRoutes.js
    farms/farmRoutes.js
    animals/animalRoutes.js
    herd/herdRoutes.js      ← rebanho: lista, eventos, sanitário, import/template
    repro/reproRoutes.js    ← reprodução: avaliações por sessão, KPIs
    po/poRoutes.js          ← puro de origem
    financial/
    market/
    overview/
    news/
    field/
    hq/
    chat/
    config/env.js           ← todas as variáveis de ambiente centralizadas
    middlewares/
      requireAuth.js        ← injeta req.saas (org, farm, entitlements) e req.access
      rateLimiter.js
    utils/
      formatters.js         ← normalização de dados (sexo, raça, datas, etc.)
      validators.js
      activityLog.js
```

**Contexto multitenancy:** `requireAuth` popula `req.saas.organizationId`, `req.saas.farmId` e `req.saas.entitlements`. Rotas de campo também usam `req.access` (modo field worker). Nunca confiar em `farmId` vindo do body sem validar contra `req.saas`.

### Frontend (`frontend/`)
SPA React. Roteamento via React Router em `App.tsx`. Componentes grandes e monolíticos por módulo (ex.: `HerdModule.tsx`, `FinanceModule.tsx`) — lazy-loaded. Chamadas à API ficam em `frontend/adapters/*Api.ts`, que usam `buildApiUrl()` de `frontend/api.ts`.

```
frontend/
  App.tsx               ← rotas, auth guard, layout principal
  api.ts                ← buildApiUrl() — lida com dev/prod e porta dinâmica
  adapters/             ← funções de chamada à API por domínio
  components/           ← um arquivo por tela/módulo
  types.ts              ← tipos TypeScript compartilhados
  vite.config.ts        ← proxy /api/ → localhost:3001 em dev
```

### Banco de dados (Prisma)
`server/prisma/schema.prisma` — modelos principais: `User`, `Farm`, `Animal`, `Weighing`, `HerdEvent`, `SanitaryRecord`, `ReproEvent`, `BreedingSeason`, `Exposure`, `NutritionPlan`, `ExternalOperation` (confinamento), modelos de mercado (`MarketPrice`, etc.).

---

## Convenções

- **Imports:** server usa ESM (`import/export`), sem CommonJS.
- **Planilha de importação:** só template para download (`GET /herd/import/template`). Não reintroduzir parse/upload automático de Excel.
- **Lockfile sensível:** ao alterar deps, regerar com `npm install --package-lock-only` (tailwindcss já quebrou CI por deps transitivas faltando).
- **Migrations Prisma:** criar em `server/prisma/migrations/<timestamp>_<nome>/migration.sql` + atualizar `schema.prisma`. Nunca editar migration já aplicada em produção.
- **Variáveis de ambiente:** centralizadas em `server/modules/config/env.js`. Em produção, `server/.env.production` (preservado pelo deploy, não commitado).

## Coding style

- Server: JavaScript puro (sem TypeScript). Sem classes — funções e módulos.
- Frontend: TypeScript estrito. Componentes funcionais, hooks padrão do React.
- Tailwind: classes utilitárias direto no JSX, sem CSS customizado salvo casos excepcionais.
- Sem comentários óbvios; só quando o *porquê* não é evidente pelo código.
- Normalização de dados (sexo, raça, status reprodutivo) sempre via utilitários em `formatters.js` — nunca inline em rotas.

## Pontos de atenção

- Health check no VPS: `http://127.0.0.1:3000/health` (nginx repassa de 443 para 3000).
- `req.saas.farmId` é a fonte de verdade para isolamento de dados por fazenda — não aceitar `farmId` do body em operações sensíveis sem cruzar com o contexto da sessão.
- Acasalamento e Nutrição ainda estão em arquivos soltos na raiz de `server/` (`acasalamentoModule.js`, `nutritionModule.js`), não extraídos para `modules/`.
