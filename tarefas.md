# Tarefas — EIXO V2

## Pendente de deploy

### Fazendas e Pastos · Auditoria Fase 1 (Bugs + Correções de Pecuária)

| # | Tarefa | Arquivo |
|---|--------|---------|
| 1 | "Salvar e continuar editando" não fecha mais o form | `FarmRegistrationForm.tsx` |
| 2 | `sistemaPastejo` carrega corretamente ao editar fazenda existente | `FarmRegistrationForm.tsx` |
| 3 | Badge "Adicionar pastos →" agora é clicável (abre form de pastos) | `Farms.tsx` |
| 4 | Curral de manejo e curral de engorda entram em NON_GRAZING (sem forrageira/lotação/UA) | `FarmRegistrationForm.tsx` |
| 5 | Opção "Confinamento" removida do select Sistema de pastejo | `FarmRegistrationForm.tsx` |
| 6 | Step 2 exibe contagem de pastos: "Pastos (3)" | `FarmRegistrationForm.tsx` |

---

## Histórico

### 2026-05-12 — Fix tela branca (build)
Deploy: `fix: corrige tela branca — remove manualChunks de react e recharts`

Removidas as regras `react-core`, `router` e `charts` do `manualChunks` em `vite.config.ts`.
Resultado: `index` caiu de 558 kB → 342 kB. Interop de React restaurada.

### 2026-05-12 — Módulo Fazendas e Pastos · Fase 3 (Polimento)
Deploy: `feat: sistema de pastejo, hover actions e estado vazio de fazendas + otimização de chunks vite`

| # | Tarefa | Arquivo |
|---|--------|---------|
| 11 | Campo "Sistema de pastejo" no form de pasto | `FarmRegistrationForm.tsx` |
| 12 | Ações Editar/Excluir do card visíveis só no hover | `Farms.tsx` |
| 13 | Estado vazio com ícone + texto + CTA quando não há fazendas | `Farms.tsx` |

### 2026-05-12 — Módulo Fazendas e Pastos · Fase 1 (Quick Wins)
Deploy: `fix: UX fazendas e pastos — botões, badge, campos condicionais, hint lotação, GPS e banners de feedback`

| # | Tarefa | Arquivo |
|---|--------|---------|
| 1 | Botões finais do form: "Salvar e fechar" / "Salvar e continuar editando" | `FarmRegistrationForm.tsx` |
| 2 | Badge "Sem pastos" → convite amarelo (era erro vermelho) | `Farms.tsx` |
| 3 | Forrageira e Lotação ocultos para Aguada, APP e Plantio | `FarmRegistrationForm.tsx` |
| 4 | Hint de referência no campo Lotação UA/ha | `FarmRegistrationForm.tsx` |
| 5 | GPS visível por padrão no formulário | `FarmRegistrationForm.tsx` |
| 6 | Erros e sucessos como banners visuais | `FarmRegistrationForm.tsx` |
