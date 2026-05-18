# Tarefas Pendentes de Deploy

## Tarefas

| ID | Tarefa | Status | Validado | Data |
|---|---|---|---|---|
| DEP-009 | Reorganizar header da landing: separar "Planos" da navegação interna, posicionar entre "Entrar" e "Cadastrar no Plano Base", ajustar separação no mobile e manter CTA principal | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-010 | Corrigir inconsistência comercial na página de planos: alterar "500 produtores" para "100 produtores" mantendo estrutura, preços, CTAs e layout | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-011 | Padronizar nomenclatura na página de planos: `EIXO Gestão`, `EIXO Performance`, remover termos `Plano Grátis`/`Eixo Decisão` e ajustar nota para `EIXO Base Vitalício` | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |

## Observações
- Arquivo `frontend/components/PublicLanding.tsx` alterado de forma cirúrgica.
- Hierarquia desktop aplicada: `[Plano Base] [Antes e Depois] [Como funciona] [Dúvidas] [Entrar] [Planos] [Cadastrar no Plano Base]`.
