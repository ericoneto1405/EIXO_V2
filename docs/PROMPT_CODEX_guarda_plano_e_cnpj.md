# Prompt para o Codex — guarda de plano nas rotas e limite na consulta de CNPJ

Copie tudo abaixo da linha para o Codex.

---

Você vai trabalhar no repositório EIXO_V2 (Node/Express + React/Vite + Prisma). São duas tarefas independentes. Faça as duas, em commits separados.

## Contexto que você precisa saber antes de mexer

**A autenticação do servidor é por PREFIXO de caminho, não rota a rota.** O bloco fica em `server/modules/auth/authRoutes.js` (~linha 416), dentro de `registerAuthRoutes(app)`, que roda antes dos outros módulos em `server/index.js`:

```js
app.use(['/farms', '/lots', '/animals', '/pastos'], requireAuth);
app.use(['/users', '/seasons', '/repro-events', '/repro'], requireAuth, requireBillingAccess);
app.use(['/genetics', '/po'], requireAuth, requireBillingAccess, requireEntitlement('GENETICS', 'EIXO_DECISAO'));
app.use(['/nutrition'], requireAuth, requireBillingAccess, requireEntitlement('NUTRITION', 'EIXO_GESTAO', 'EIXO_DECISAO'));
app.use(['/account-categories', '/financial'], requireAuth, requireModule('Financeiro'));
```

Não conclua que uma rota está aberta só porque não tem `requireAuth` na própria linha — confira essa lista primeiro.

**Trava de CI:** `server/scripts/validate-support-knowledge.mjs` quebra o build quando um arquivo sensível muda (inclui `frontend/App.tsx`, `PlansPage.tsx`, `Sidebar.tsx`, `saasContext.js` e os módulos do servidor) sem que `server/modules/chat/supportKnowledge.js` seja revisado junto. Se você tocar em algum deles: revise o conhecimento, incremente `SUPPORT_KNOWLEDGE_REVISION` e rode antes de commitar:

```
node server/scripts/validate-support-knowledge.mjs
npm test --workspace server
```

---

## Tarefa 1 — guarda de plano nas rotas do frontend

**Problema.** As telas do sistema são protegidas pelo menu (`Sidebar.tsx` esconde o item) e pelo `switch` de views em `App.tsx`, que passa por `getUpgradeModuleForView(activeView)` e mostra a `UpgradeScreen`. Mas as telas servidas pelo **React Router** não passam por essa checagem. Em `frontend/App.tsx` (~linha 1034) existe só um caso especial escrito à mão:

```js
if (location.pathname.startsWith('/genetics/acasalamento') && isFreePlan) { ...UpgradeScreen... }
```

Resultado: `/genetics/reproducao` **não tem checagem nenhuma de plano**. Um usuário logado no plano EIXO Essencial que digitar o endereço entra na tela. A API por trás já barra (as rotas `/repro/*` têm `requireModule('Reprodução')`), então ele vê a tela quebrada em vez de um convite para assinar — experiência ruim e vazamento de interface.

Além disso, `isFreePlan` é uma checagem grosseira (qualquer entitlement pago passa). O certo é checar o **módulo** que a tela exige.

**O que fazer.**

1. Em `frontend/App.tsx`, crie uma guarda genérica de rota, no mesmo espírito do `withFarmGuard` que já existe ali:

   ```tsx
   const withPlanGuard = (moduleName: string, content: React.ReactNode) => { ... }
   ```

   Ela deve, na ordem: pegar a entrada correspondente em `UPGRADE_CONTENT[moduleName]`; verificar se o usuário tem os `accessLabels` daquela entrada nos módulos liberados (use a mesma fonte que `getUpgradeModuleForView` já usa — não invente outra); se não tiver, renderizar `<UpgradeScreen>` com os campos daquela entrada e `onUpgrade={() => setUpgradeModal(...)}`, exatamente como o caso do Acasalamento faz hoje; se tiver, renderizar o conteúdo.

2. Aplique nas duas rotas de genética, combinando com o `withFarmGuard` existente:
   - `/genetics/reproducao` → módulo **`'Reprodução'`**
   - `/genetics/acasalamento` → módulo **`'Eixo Acasalamento'`**

3. **Remova** o `if (location.pathname.startsWith('/genetics/acasalamento') && isFreePlan)` escrito à mão — a guarda nova substitui ele. Não deixe as duas checagens convivendo.

4. Varra o resto do `<Routes>` do arquivo procurando outras telas servidas por rota sem guarda de plano e aplique a mesma guarda onde fizer sentido. Não invente módulo que não existe no `UPGRADE_CONTENT`.

**Cuidado importante.** `'Reprodução'` e `'Eixo Genetics'` são rótulos **diferentes** desde 02/09/2026: `'Eixo Genetics'` é só o Acasalamento (plano EIXO Performance) e `'Reprodução'` é a estação de monta e prenhez (plano EIXO Gestão em diante). Isso está em `PLAN_MODULES` e em `buildAllowedModulesFromPlan`, no `server/modules/utils/saasContext.js`. Não volte a juntar os dois.

**Aceite.** Um usuário do plano EIXO Essencial que digitar `/genetics/reproducao` vê a `UpgradeScreen` da Reprodução, não a tela do módulo. Um usuário do EIXO Gestão entra normalmente na Reprodução e continua vendo a `UpgradeScreen` em `/genetics/acasalamento`.

---

## Tarefa 2 — limitar a consulta pública de CNPJ

**Problema.** `GET /public/cnpj/:cnpj` em `server/modules/auth/authRoutes.js` (~linha 237) é pública por desenho — o formulário de cadastro consulta o CNPJ na Receita antes de o usuário existir. Só que ela não tem limite nenhum de chamadas: qualquer um pode usar o servidor do EIXO como proxy gratuito de consulta à Receita, gastando cota e podendo derrubar a integração para os cadastros de verdade.

**O que fazer.**

1. Adicione um limite por IP nessa rota. Não há biblioteca de rate limit instalada no projeto — escolha uma das duas saídas e justifique no commit:
   - `express-rate-limit` (adicione a dependência no workspace `server`), ou
   - um limitador simples em memória, num arquivo próprio tipo `server/modules/middlewares/rateLimit.js`, com janela deslizante e limpeza periódica.

   Prefira a segunda se quiser evitar dependência nova: o servidor roda em processo único no PM2.

2. Sugestão de política: **10 consultas por IP a cada 10 minutos**. Ao estourar, responda `429` com `{ message: 'Muitas consultas de CNPJ. Tente novamente em alguns minutos.' }`.

3. Deixe o limite configurável por variável de ambiente, com valor padrão no código, e documente em `server/.env.example`.

4. Escreva teste em `node:test` para o limitador (conta, estoura, e libera depois da janela). Os testes do servidor rodam com `npm test --workspace server`.

**Cuidado.** O servidor fica atrás do nginx (`infra/nginx.conf`), que já repassa `X-Forwarded-For`. Use o IP real do cliente, não o do proxy — confira se o Express está com `trust proxy` configurado e, se não estiver, resolva isso junto, senão o limite valeria para todo mundo de uma vez.

**Aceite.** A 11ª consulta do mesmo IP dentro da janela recebe 429; o cadastro normal de um produtor não é afetado.

---

## Regras gerais deste repositório

- Comentários e mensagens de commit em **português**.
- Comentário no código só quando explica **por quê**, não o que a linha faz.
- Não prometa na interface recurso que não existe no sistema — é regra explícita do dono do produto.
- Um commit por tarefa, com mensagem que explique o problema, não só a mudança.
- Não faça push nem abra PR sem pedir.
