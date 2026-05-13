# Plano de Implementação — Fazendas e Pastos

Cruzamento de UX · UI Specialist · Pecuária de Corte · ordenado por impacto × esforço.

---

## Matriz Impacto × Esforço

| | Baixo esforço | Alto esforço |
|---|---|---|
| **Alto impacto** | ✦ Fazer primeiro (Fase 1) | ▲ Planejar bem (Fase 2) |
| **Médio impacto** | → Quando sobrar tempo (Fase 3) | ✗ Descartar |

---

## Fase 1 — Quick Wins
**6 melhorias · ~2–3h · sem risco de regressão**

| # | Tarefa | Arquivo | Tags | Status |
|---|--------|---------|------|--------|
| 1 | Corrigir nomes dos botões finais do form: "Salvar e fechar" / "Salvar e continuar editando". Remover dicas redundantes abaixo dos botões. | `FarmRegistrationForm.tsx` · linhas 891–915 | UX | ✅ Concluído |
| 2 | Badge "Sem pastos" → estado de convite amarelo, não erro vermelho. Texto: "Adicionar pastos →" | `Farms.tsx` · linha 317–320 | UX · UI | ✅ Concluído |
| 3 | Campos condicionais por tipo: ocultar Forrageira e Lotação para Aguada, APP e Plantio | `FarmRegistrationForm.tsx` · linha 783–827 | UX · Pecuária | ✅ Concluído |
| 4 | Hint de referência no campo Lotação: "Ref: Brachiaria/Cerrado — 0,5 (seca) a 1,5 (águas)" | `FarmRegistrationForm.tsx` · linha 802–825 | Pecuária · UX | ✅ Concluído |
| 5 | GPS visível por padrão no formulário (remover toggle colapsado) | `FarmRegistrationForm.tsx` · linha 603–674 | UX | ✅ Concluído |
| 6 | Erros e sucessos como banners visuais com ícone e cor no topo do form | `FarmRegistrationForm.tsx` · linhas 884–889 | UI | ✅ Concluído |

---

## Fase 2 — Core Value
**4 melhorias · ~4–6h · mudanças de layout e dados**

| # | Tarefa | Arquivo | Tags | Status |
|---|--------|---------|------|--------|
| 7 | Substituir tabela de fazendas por cards — incluindo: capacidade total (UA), animais atuais, % área distribuída. Expand de pastos como lista, sem sub-tabela. | `Farms.tsx` · linha 276–383 | UX · UI · Pecuária | ⏳ Pendente |
| 8 | Resumo de capacidade total ao concluir cadastro de pastos: "Sua fazenda comporta X UA totais" em destaque antes dos botões de ação. | `FarmRegistrationForm.tsx` · após linha 882 | Pecuária · UX | ⏳ Pendente |
| 9 | Desdobrar forrageiras em cultivares: Brachiaria (Marandu / Decumbens / Xaraés / Piatã), Panicum (Massai / Tanzânia / Mombaça). Adicionar Capim-elefante, Coastcross, Sorgo forrageiro. Usar `<optgroup>`. | `FarmRegistrationForm.tsx` · linhas 787–800 | Pecuária | ⏳ Pendente |
| 10 | Stepper mostra nome da fazenda no passo 2: "✓ Fazenda Santa Rita" em vez de "✓ Dados da fazenda" | `FarmRegistrationForm.tsx` · linha 544 | UI | ⏳ Pendente |

---

## Fase 3 — Polimento
**3 melhorias · ~2h · baixo risco**

| # | Tarefa | Arquivo | Tags | Status |
|---|--------|---------|------|--------|
| 11 | Campo "Sistema de pastejo": Extensivo / Rotacionado / Semi-intensivo / Confinamento. Impacta recomendações futuras de lotação. | `FarmRegistrationForm.tsx` · após campo Forrageira | Pecuária | ⏳ Pendente |
| 12 | Ações de editar/excluir reveladas no hover ou via menu kebab (⋮), em vez de sempre visíveis | `Farms.tsx` · linhas 333–348 | UI | ⏳ Pendente |
| 13 | Estado vazio completo quando não há fazendas: ícone + texto + botão "Cadastrar primeira fazenda" | `Farms.tsx` · após linha 274 | UX · UI | ⏳ Pendente |

---

## Contexto da auditoria

Problemas identificados cruzando três perspectivas:

- **UX** — fluxo, usabilidade, hierarquia de informação
- **UI Specialist** — paleta EIXO, consistência visual, estados de interface
- **Pecuária de Corte** — dados realistas, terminologia correta, indicadores zootécnicos relevantes para o produtor

### Críticos identificados
- Tabela de fazendas sem dados de contexto operacional (UA, animais, % área distribuída)
- Sub-tabela de pastos quebra layout no mobile
- "Brachiaria" genérico impede cálculo de lotação correto
- Lotação padrão 1 UA/ha sem referência contextual pode induzir erro

### Deploy da Fase 1
`2026-05-12` · commit `b09bd0d` · `fix: UX fazendas e pastos — botões, badge, campos condicionais, hint lotação, GPS e banners de feedback`
