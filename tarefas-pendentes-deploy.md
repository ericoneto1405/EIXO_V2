# Tarefas Pendentes de Deploy

## Tarefas com deploy realizado

| ID | Tarefa | Status | Validado | Data |
|---|---|---|---|---|
| DEP-009 | Reorganizar header da landing: separar "Planos" da navegação interna, posicionar entre "Entrar" e "Cadastrar no Plano Base", ajustar separação no mobile e manter CTA principal | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-010 | Corrigir inconsistência comercial na página de planos: alterar "500 produtores" para "100 produtores" mantendo estrutura, preços, CTAs e layout | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-011 | Padronizar nomenclatura na página de planos: `EIXO Gestão`, `EIXO Performance`, remover termos `Plano Grátis`/`Eixo Decisão` e ajustar nota para `EIXO Base Vitalício` | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-012 | Ajustar hierarquia visual do header da landing: navegação interna mais leve, `Entrar` discreto, `Ver Planos` como CTA secundário e `Começar agora` como CTA principal menor (desktop + mobile) | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-013 | Ajustar Visão Geral para escopo `all`/`farm`: dashboard consolidado para “Todas as Fazendas” e específico por fazenda, com endpoint `GET /overview/dashboard` no backend sem alterar KPIs | CONCLUIDA | Frontend build OK (`npm run build --prefix frontend`) + Schema Prisma válido (`npx prisma validate --schema server/prisma/schema.prisma`) | 2026-05-18 |

## Tarefas pendentes

| ID | Tarefa | Status | Validado | Data |
|---|---|---|---|---|
| - | Nenhuma tarefa pendente no momento | - | - | 2026-05-18 |

## Observações
- Arquivo `frontend/components/PublicLanding.tsx` alterado de forma cirúrgica.
- Hierarquia desktop aplicada: `[Plano Base] [Antes e Depois] [Como funciona] [Dúvidas] [Entrar] [Planos] [Cadastrar no Plano Base]`.
