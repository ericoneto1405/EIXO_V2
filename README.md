**Pré-requisitos:** Node.js 18+

### Instalação
1. `npm install` (na raiz, instala frontend e backend via workspaces)
2. Ajuste `frontend/.env.local`:
   ```bash
   GEMINI_API_KEY=SEU_TOKEN
   VITE_API_URL=/api
   ```
3. Suba o Postgres via Docker:
   ```bash
   docker compose up -d db
   ```
4. Ajuste o Postgres e Prisma:
   ```bash
   cp server/.env.example server/.env
   ```
   Edite `server/.env` com a sua `DATABASE_URL` (se o backend roda no Mac, use `localhost:5432`; se o backend roda em container, use `db:5432`).
   Para autenticação por sessão, ajuste também:
   ```bash
   SESSION_TOKEN_SALT="troque-por-um-segredo-forte"
   CORS_ORIGIN="http://localhost:5173"
   ```
5. Rode as migrations e gere o client:
   ```bash
   cd server
   npx prisma generate
   npx prisma migrate dev --name init
   npm run seed
   ```

### Instalação limpa (se ocorrer erro de npm/ENOTEMPTY)
```bash
npm run install:clean
```

### Instalação nuclear (remove lockfile)
```bash
npm run install:reset
```

### Scripts úteis
- `npm run dev` – sobe backend (`server`) e frontend (`frontend`) em paralelo.
- `npm run dev:server` – executa apenas a API Express (porta 3001).
- `npm run dev:frontend` – executa apenas o Vite dev server.
- `npm run build` – gera o build do frontend.
- `npm run start:server` – inicia o backend em modo produção.
- `npm run studio` – abre o Prisma Studio a partir da raiz (delegado para o workspace `server`).
- `npm run migrate` – roda migrations via Prisma a partir da raiz (workspace `server`).
- `npm run generate` – gera o Prisma Client a partir da raiz (workspace `server`).
- `npm run seed` – executa o seed a partir da raiz (workspace `server`).

Também existem os atalhos equivalentes no `Makefile` da raiz (`make dev`, `make dev-backend`, …).

### Autenticação (cookie HttpOnly)
- O backend usa sessão em cookie HttpOnly (`session`) e a fonte da verdade fica no Postgres.
- O frontend deve sempre usar `credentials: 'include'` nas chamadas.
- Em produção, defina `NODE_ENV=production` para ativar `Secure` nos cookies.
- Se front e back estiverem em domínios diferentes, ajuste `CORS_ORIGIN`.
- Fallback `x-user-id` só funciona em DEV e com `ALLOW_X_USER_ID=true`.

Exemplo de .env (backend):
```bash
SESSION_TOKEN_SALT="troque-por-um-segredo-forte"
SESSION_TTL_MS="86400000"
SESSION_REMEMBER_TTL_MS="2592000000"
CORS_ORIGIN="http://localhost:5173"
ALLOW_X_USER_ID="false"
```

### Proxy do Vite (sem CORS)
No dev, o Vite faz proxy de `/api` para `http://localhost:3001`, então o frontend usa:
```
VITE_API_URL=/api
```

### Porta do backend e CORS em DEV
- O backend agora tenta `PORT` (default 3001) e, se estiver ocupada, sobe automaticamente na próxima porta livre (3002, 3003, ...).
- Em DEV, o CORS aceita `http://localhost:*` e `http://127.0.0.1:*` (com credentials).
- Existe `/health` que responde `{ ok: true, port }` e header `X-Server-Port`, usado para descoberta automática no frontend.

Como liberar a porta 3001 no Mac:
```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
kill -9 <PID>
```

Se precisar fixar manualmente:
```bash
VITE_API_URL=http://localhost:3002 npm run dev --workspace frontend
```

### Smoke Test Porta dinâmica (DEV) — copy/paste
Ocupar a 3001:
```bash
python3 -m http.server 3001
```

Subir backend:
```bash
npm run dev --workspace server
```
Deve cair em 3002 (ou próxima livre) e logar isso.

Validar health:
```bash
curl -i http://localhost:3002/health
```
Deve retornar JSON com `port: 3002` e header `X-Server-Port: 3002`.

Subir frontend:
```bash
npm run dev --workspace frontend
```
Abrir `http://localhost:517x`.

Validar no DevTools:
- requests indo para `http://localhost:3002`
- com credentials/cookies

### Prisma na raiz (sem `cd server`)
Os scripts de Prisma na raiz delegam para o workspace `server`, que contém o schema e o `prisma.config.ts`.
Isso evita erro de schema ao rodar na raiz e remove a dependência do `package.json#prisma` (deprecado).

### Reprodução (modo, estações e eventos)
Após atualizar o schema, rode a migration:
```bash
cd server
npx prisma migrate dev --name repro
```

Exemplos de teste (ajuste IDs e datas):
```bash
curl -i -X PATCH http://localhost:3001/farms/FARM_ID/repro-mode \
  -H "Content-Type: application/json" \
  -d '{"reproMode":"ESTACAO"}'

curl -i -X POST http://localhost:3001/seasons \
  -H "Content-Type: application/json" \
  -d '{"farmId":"FARM_ID","name":"Estação 2025","startAt":"2025-01-01","endAt":"2025-03-31"}'

curl -i -X POST http://localhost:3001/seasons/SEASON_ID/exposures \
  -H "Content-Type: application/json" \
  -d '{"animalIds":["ANIMAL_ID_1","ANIMAL_ID_2"]}'

curl -i -X POST http://localhost:3001/repro-events \
  -H "Content-Type: application/json" \
  -d '{"farmId":"FARM_ID","animalId":"ANIMAL_ID_1","type":"DIAGNOSTICO_PRENHEZ","date":"2025-02-10","payload":{"status":"PRENHE"}}'

curl -i "http://localhost:3001/animals/ANIMAL_ID_1/repro-kpis?seasonId=SEASON_ID"
```

### Smoke Test Reprodução (copiar/colar)
Pré-requisitos: DB no ar, backend em `http://localhost:3001`.

1) Subir DB + migration:
```bash
docker compose up -d db
cd server
npx prisma migrate dev --name repro
```

2) Login (cookie):
```bash
curl -c cookies.txt -i -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@eixo.com","password":"admin","rememberMe":false}'
```

3) Criar fazenda e fêmea:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/farms \
  -H "Content-Type: application/json" \
  -d '{"name":"Fazenda Repro Teste","city":"Feira","size":100}'

curl -b cookies.txt -i -X POST http://localhost:3001/animals \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","brinco":"F001","raca":"Nelore","sexo":"FEMEA","dataNascimento":"2022-01-01","pesoAtual":420}'
```

4) CONTÍNUO + KPIs:
```bash
curl -b cookies.txt -i -X PATCH http://localhost:3001/farms/<FARM_ID>/repro-mode \
  -H "Content-Type: application/json" \
  -d '{"reproMode":"CONTINUO"}'

curl -b cookies.txt -i -X POST http://localhost:3001/repro-events \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","animalId":"<ANIMAL_ID>","type":"PARTO","date":"2024-01-01"}'

curl -b cookies.txt -i -X POST http://localhost:3001/repro-events \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","animalId":"<ANIMAL_ID>","type":"DIAGNOSTICO_PRENHEZ","date":"2024-04-01","payload":{"status":"PRENHE"}}'

curl -b cookies.txt -i http://localhost:3001/animals/<ANIMAL_ID>/repro-kpis
```

5) IEP (2º parto):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/repro-events \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","animalId":"<ANIMAL_ID>","type":"PARTO","date":"2025-03-01"}'

curl -b cookies.txt -i http://localhost:3001/animals/<ANIMAL_ID>/repro-kpis
```

6) ESTAÇÃO + expostas + taxa:
```bash
curl -b cookies.txt -i -X PATCH http://localhost:3001/farms/<FARM_ID>/repro-mode \
  -H "Content-Type: application/json" \
  -d '{"reproMode":"ESTACAO"}'

curl -b cookies.txt -i -X POST http://localhost:3001/seasons \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","name":"Estação 2025","startAt":"2025-10-01","endAt":"2025-12-31"}'

curl -b cookies.txt -i -X POST http://localhost:3001/seasons/<SEASON_ID>/exposures \
  -H "Content-Type: application/json" \
  -d '{"animalIds":["<ANIMAL_ID>"]}'

# resposta esperada (idempotente):
# HTTP 200 + { createdCount, existingCount, exposures[] }

curl -b cookies.txt -i -X POST http://localhost:3001/repro-events \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","animalId":"<ANIMAL_ID>","type":"DIAGNOSTICO_PRENHEZ","date":"2025-11-15","seasonId":"<SEASON_ID>","payload":{"status":"PRENHE"}}'

curl -b cookies.txt -i "http://localhost:3001/animals/<ANIMAL_ID>/repro-kpis?seasonId=<SEASON_ID>"
```

7) Validações negativas:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/repro-events \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","animalId":"<ANIMAL_ID_MACHO>","type":"PARTO","date":"2024-02-01"}'

curl -b cookies.txt -i -X POST http://localhost:3001/repro-events \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","animalId":"<ANIMAL_ID>","type":"DIAGNOSTICO_PRENHEZ","date":"2025-12-01"}'
```

### Smoke Test Seleção (copiar/colar)
Pré-requisitos: DB no ar, backend em `http://localhost:3001`.

1) GET seleção (CONTÍNUO):
```bash
curl -b cookies.txt -i "http://localhost:3001/genetics/selection?farmId=<FARM_ID>"
```

2) GET seleção com estação:
```bash
curl -b cookies.txt -i "http://localhost:3001/genetics/selection?farmId=<FARM_ID>&seasonId=<SEASON_ID>"
```

3) DISCARD sem motivo (esperado 400):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/genetics/selection/decisions \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","animalId":"<ANIMAL_ID>","decision":"DISCARD"}'
```

4) DISCARD com motivo (esperado 200):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/genetics/selection/decisions \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","animalId":"<ANIMAL_ID>","decision":"DISCARD","reason":"Baixa taxa de prenhez"}'
```

### Smoke Test Relatórios (copiar/colar)
Pré-requisitos: DB no ar, backend em `http://localhost:3001`.

1) GET summary (CONTÍNUO):
```bash
curl -b cookies.txt -i "http://localhost:3001/genetics/reports/summary?farmId=<FARM_ID>"
```

2) GET summary com estação:
```bash
curl -b cookies.txt -i "http://localhost:3001/genetics/reports/summary?farmId=<FARM_ID>&seasonId=<SEASON_ID>"
```

Verifique no payload: `summary.totals.exposures`, `summary.totals.pregnant`, `summary.totals.empty`.

### Smoke Test Plantel P.O. (copiar/colar)
Pré-requisitos: DB no ar, backend em `http://localhost:3001`.

1) Criar animal P.O.:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/animals \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","nome":"Doadora PO","raca":"Nelore","sexo":"FEMEA","brinco":"POF001","registro":"ABCZ-123","categoria":"Doadora"}'
```

2) Criar lote de sêmen (reprodutor externo):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/semen \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","lote":"SEM-001","dosesTotal":100,"dosesDisponiveis":100,"bullName":"Touro Externo","bullRegistry":"ABCZ-999"}'
```

3) Criar lote de embriões (doadora + reprodutor externos):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/embryos \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","lote":"EMB-001","tecnica":"FIV","quantidadeTotal":10,"quantidadeDisponivel":10,"donorName":"Doadora X","sireName":"Touro Y"}'
```

4) Movimentar estoque (ajuste de disponíveis):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/semen/<SEMEN_ID>/move \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-01-01","qty":2,"type":"USE","notes":"IATF"}'

curl -b cookies.txt -i -X POST http://localhost:3001/po/embryos/<EMBRYO_ID>/move \
  -H "Content-Type: application/json" \
  -d '{"date":"2025-01-01","qty":1,"type":"TRANSFER","notes":"Transferência"}'
```

5) Lote duplicado (esperado 409):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/semen \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","lote":"SEM-001","dosesTotal":50,"dosesDisponiveis":50,"bullName":"Outro Touro"}'
```

### Smoke Test Pesagens P.O. (copiar/colar)
Pré-requisitos: DB no ar, backend em `http://localhost:3001`.

1) Criar lote P.O.:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/lots \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","name":"Lote PO A","notes":"Lote P.O."}'
```

2) Criar animal P.O.:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/animals \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","lotId":"<PO_LOT_ID>","nome":"Matriz PO","raca":"Nelore","sexo":"FEMEA","brinco":"POF200","pesoAtual":420}'
```

3) Postar 2 pesagens (datas diferentes):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/animals/<PO_ANIMAL_ID>/pesagens \
  -H "Content-Type: application/json" \
  -d '{"data":"2024-01-10","peso":430}'

curl -b cookies.txt -i -X POST http://localhost:3001/po/animals/<PO_ANIMAL_ID>/pesagens \
  -H "Content-Type: application/json" \
  -d '{"data":"2024-02-10","peso":455}'
```

4) Validar pesoAtual e gmd:
```bash
curl -b cookies.txt -i "http://localhost:3001/po/animals?farmId=<FARM_ID>"
```

5) Duplicidade de data (esperado 409):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/animals/<PO_ANIMAL_ID>/pesagens \
  -H "Content-Type: application/json" \
  -d '{"data":"2024-02-10","peso":460}'
```

### Smoke Test Nutrição (copiar/colar)
Pré-requisitos: DB no ar, backend em `http://localhost:3001`.

1) Criar plano:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/nutrition/plans \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","nome":"Plano Recria","fase":"Recria","startAt":"2024-01-01","metaGmd":0.75}'
```

2) Atribuir plano a animal P.O.:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/nutrition/assignments \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","planId":"<PLAN_ID>","poAnimalId":"<PO_ANIMAL_ID>","startAt":"2024-01-01"}'
```

3) Buscar plano atual:
```bash
curl -b cookies.txt -i "http://localhost:3001/nutrition/assignments/current?farmId=<FARM_ID>&poAnimalId=<PO_ANIMAL_ID>"
```

### Smoke Test Rebanho (Comercial vs P.O.) (copiar/colar)
Pré-requisitos: DB no ar, backend em `http://localhost:3001`.

1) Criar lote (comercial):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/lots \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","name":"Lote A","notes":"Comercial"}'
```

2) Criar animal comercial:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/animals \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","brinco":"BR100","raca":"Nelore","sexo":"Macho","dataNascimento":"2023-01-01","pesoAtual":450,"lotId":"<LOT_ID>","paddockId":"<PASTO_ID>"}'
```

3) Registrar pesagem (comercial):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/animals/<ANIMAL_ID>/pesagens \
  -H "Content-Type: application/json" \
  -d '{"data":"2024-01-10","peso":470}'
```

4) Criar animal P.O.:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/animals \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","nome":"Matriz PO","raca":"Nelore","sexo":"FEMEA","brinco":"POF100","registro":"ABCZ-100","pesoAtual":430,"paddockId":"<PASTO_ID>"}'
```

5) Registrar pesagem (P.O.):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/animals/<PO_ANIMAL_ID>/pesagens \
  -H "Content-Type: application/json" \
  -d '{"data":"2024-02-10","peso":445}'
```

6) Listar animais P.O. e pesagens:
```bash
curl -b cookies.txt -i "http://localhost:3001/po/animals?farmId=<FARM_ID>"
curl -b cookies.txt -i "http://localhost:3001/po/animals/<PO_ANIMAL_ID>/pesagens"
```

### Smoke Test Pastos + GMD (copiar/colar)
Pré-requisitos: DB no ar, backend em `http://localhost:3001`.

Notas GMD:
- Usa as 2 últimas pesagens válidas (mesmo dia: última registrada).
- Se não houver 2 pesagens, `gmdLast` fica `null`.
- `gmd30` usa a primeira e a última pesagem dentro da janela de 30 dias.

1) Verificar pasto principal ao criar fazenda:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/farms \
  -H "Content-Type: application/json" \
  -d '{"name":"Fazenda Pasto","city":"Feira","size":120}'

curl -b cookies.txt -i "http://localhost:3001/pastos?farmId=<FARM_ID>"
```

2) Criar animal sem pasto (esperado 400):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/animals \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","brinco":"BR200","raca":"Nelore","sexo":"Macho","dataNascimento":"2023-01-01","pesoAtual":450}'
```

3) Criar pasto adicional:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/pastos \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","nome":"Pasto 02 - Rotacionado","areaHa":20}'
```

4) Criar animal comercial com pasto:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/animals \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","brinco":"BR201","raca":"Nelore","sexo":"Macho","dataNascimento":"2023-01-01","pesoAtual":450,"paddockId":"<PASTO_ID>"}'
```

5) Mover de pasto:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/animals/<ANIMAL_ID>/move-pasto \
  -H "Content-Type: application/json" \
  -d '{"pastoId":"<PASTO_ID_2>","date":"2024-02-01","notes":"Rotação"}'
```

6) Pesagens e GMD (gmdLast):
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/animals/<ANIMAL_ID>/pesagens \
  -H "Content-Type: application/json" \
  -d '{"data":"2024-01-10","peso":470}'

curl -b cookies.txt -i -X POST http://localhost:3001/animals/<ANIMAL_ID>/pesagens \
  -H "Content-Type: application/json" \
  -d '{"data":"2024-02-10","peso":500}'

curl -b cookies.txt -i "http://localhost:3001/animals?farmId=<FARM_ID>"
```

7) Repetir para P.O.:
```bash
curl -b cookies.txt -i -X POST http://localhost:3001/po/animals \
  -H "Content-Type: application/json" \
  -d '{"farmId":"<FARM_ID>","nome":"Matriz PO","raca":"Nelore","sexo":"FEMEA","brinco":"POF200","registro":"ABCZ-200","pesoAtual":430,"paddockId":"<PASTO_ID>"}'

curl -b cookies.txt -i -X POST http://localhost:3001/po/animals/<PO_ANIMAL_ID>/pesagens \
  -H "Content-Type: application/json" \
  -d '{"data":"2024-03-01","peso":440}'

curl -b cookies.txt -i -X POST http://localhost:3001/po/animals/<PO_ANIMAL_ID>/pesagens \
  -H "Content-Type: application/json" \
  -d '{"data":"2024-04-01","peso":470}'

curl -b cookies.txt -i "http://localhost:3001/po/animals?farmId=<FARM_ID>"
```
