# Tarefas — EIXO V2

## Pendente de deploy

1. Build frontend — Otimização de chunks no `frontend/vite.config.ts` (manualChunks para reduzir peso inicial do bundle).
2. Módulo Fazendas e Pastos — Fase 3: sistema de pastejo, ações em hover e estado vazio (`FarmRegistrationForm.tsx`, `Farms.tsx`).

---

## Histórico

### 2026-05-12 — Módulo Fazendas e Pastos · Fase 3 (Polimento)
Deploy: pendente

| # | Tarefa | Arquivo |
|---|--------|---------|
| 11 | Campo "Sistema de pastejo" no form de pasto (Extensivo / Rotacionado / Semi-intensivo / Confinamento) | `FarmRegistrationForm.tsx` |
| 12 | Ações Editar/Excluir do card visíveis só no hover (mobile: sempre visíveis) | `Farms.tsx` |
| 13 | Estado vazio com ícone + texto + CTA quando não há fazendas cadastradas | `Farms.tsx` |

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
