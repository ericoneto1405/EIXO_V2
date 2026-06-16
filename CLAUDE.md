# CLAUDE.md — EIXO V2

## Como responder
- Direto e curto. Sem "vou fazer", "feito!", "perfeito!".
- Sem introdução, resumo ou repetição de contexto.
- Em português. Linguagem simples (Erico é iniciante em programação).
- Usar tokens com responsabilidade: criatividade quando agrega, concisão quando é execução. Ler só seções relevantes de arquivos, não rodar comandos exploratórios sem hipótese clara.

## Aprovação obrigatória
Toda alteração em `.tsx`, `.ts`, `.js`, `.css`, `.prisma`, `.sql`, `.yml` exige aprovação antes de executar.

Antes de alterar, apresentar em até 5 linhas:
- **O que muda**
- **Onde** (arquivo + linha)
- **Por quê**

Só executar após "sim", "ok", "pode" ou similar.

## Stack
- **Monorepo npm workspaces:** `frontend/` + `server/`
- **Frontend:** React + Vite + TypeScript + Tailwind CSS 3
- **Server:** Node.js + Express + Prisma (PostgreSQL)
- **Deploy:** GitHub Actions → push em `main` → SSH no VPS → `prisma migrate deploy` + `npm run build` + `pm2 reload`

## Convenções do projeto
- **Sem import automático de planilha.** Só template para download (`GET /herd/import/template`). Não reintroduzir parse/upload de Excel.
- **Lockfile sensível.** Se alterar deps, regerar `package-lock.json` com `npm install --package-lock-only` para garantir deps transitivas (já quebrou CI por causa de tailwindcss).
- **Migrations Prisma:** sempre criar em `server/prisma/migrations/<timestamp>_<nome>/migration.sql` + atualizar `schema.prisma`.

## Comandos úteis
- `npm run dev` — sobe frontend + server juntos
- `npm run build` — build do frontend
- `npm run generate` — Prisma generate
- `npm run migrate` — Prisma migrate (dev)

## Pontos de atenção
- CI roda `tsc --noEmit` no frontend e `vite build`. Se quebrar, é build do frontend (não tsc).
- Health check no VPS: `http://127.0.0.1:3000/health` (configurado no `nginx.conf`).
- Variáveis sensíveis ficam em `server/.env.production` (preservado durante deploy).
