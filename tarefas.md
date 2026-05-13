# Tarefas — EIXO V2

## Pendente de deploy

### Manejo do Rebanho · Aba Animais — Auditoria Fase 1 + Importação

| # | Tarefa | Arquivo |
|---|--------|---------|
| 1 | Categorias completas no select de filtro e no formulário (Bezerra, Novilho, Garrote, Garrota, Vaca de cria, Vaca seca, Vaca de descarte) | `HerdModule.tsx` |
| 2 | Campo Categoria no formulário de criação: input → select | `HerdModule.tsx` |
| 3 | Coluna Peso Atual exibe arroba abaixo do kg (`X.X @`) | `HerdModule.tsx` |
| 4 | Filtro "Status de pesagem" (todas / sem pesagem / desatualizada +30d) | `HerdModule.tsx` |
| 5 | Badge vermelho "Sem pasto" na coluna Pasto quando `currentPaddockName` é nulo | `HerdModule.tsx` |
| 6 | BUG CRÍTICO — `dataPesagem` agora cria pesagem real via `POST /animals/:id/pesagens` após importar | `HerdModule.tsx` |
| 7 | Prévia da importação: mini-tabela com ID, Raça, Sexo, Peso, Categoria | `HerdModule.tsx` |
| 8 | Header do modal de importação: badge âmbar indicando colunas não mapeadas | `HerdModule.tsx` |
| 9 | `filterRaca` → select dinâmico populado das raças do rebanho | `HerdModule.tsx` |
| 10 | Exportação dos animais filtrados para Excel (botão "Exportar (N)") | `HerdModule.tsx` |
| 11 | Ação em massa: "Registrar pesagem" para animais selecionados | `HerdModule.tsx` |
