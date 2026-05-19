# Tarefas Pendentes de Deploy

## Tarefas com deploy realizado

| ID | Tarefa | Status | Validado | Data |
|---|---|---|---|---|
| DEP-009 | Reorganizar header da landing: separar "Planos" da navegação interna, posicionar entre "Entrar" e "Cadastrar no Plano Base", ajustar separação no mobile e manter CTA principal | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-010 | Corrigir inconsistência comercial na página de planos: alterar "500 produtores" para "100 produtores" mantendo estrutura, preços, CTAs e layout | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-011 | Padronizar nomenclatura na página de planos: `EIXO Gestão`, `EIXO Performance`, remover termos `Plano Grátis`/`Eixo Decisão` e ajustar nota para `EIXO Base Vitalício` | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-012 | Ajustar hierarquia visual do header da landing: navegação interna mais leve, `Entrar` discreto, `Ver Planos` como CTA secundário e `Começar agora` como CTA principal menor (desktop + mobile) | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-013 | Ajustar Visão Geral para escopo `all`/`farm`: dashboard consolidado para “Todas as Fazendas” e específico por fazenda, com endpoint `GET /overview/dashboard` no backend sem alterar KPIs | CONCLUIDA | Frontend build OK (`npm run build --prefix frontend`) + Schema Prisma válido (`npx prisma validate --schema server/prisma/schema.prisma`) | 2026-05-18 |
| DEP-014 | Adicionar bloco “Mercado e Reposição” na Visão Geral com KPIs (arroba, reposição, relação de troca, ágio), interpretação automática e estado vazio, sem criar módulo novo e sem integração externa | CONCLUIDA | Build frontend OK (`npm run build --prefix frontend`) | 2026-05-18 |
| DEP-015 | Evoluir “Mercado e Reposição” com camada `aiInsight` no payload de `/overview/dashboard`, mantendo cálculo determinístico e geração textual por `RULES_FALLBACK` na Visão Geral | CONCLUIDA | Frontend build OK (`npm run build --prefix frontend`) + Schema Prisma válido (`npx prisma validate --schema server/prisma/schema.prisma`) | 2026-05-19 |
| DEP-016 | Ajustes finais de qualidade em mercado/reposição: `referenceDate` em `YYYY-MM-DD`, números pt-BR (vírgula decimal e moeda com centavos) e fallback textual revisado sem alterar fórmulas | CONCLUIDA | Frontend build OK (`npm run build --prefix frontend`) + Schema Prisma válido (`npx prisma validate --schema server/prisma/schema.prisma`) | 2026-05-19 |
| DEP-017 | Refatorar card “Mercado e Reposição” com dois sinais separados (`fatCattleSignal` e `replacementSignal`) no payload de `/overview/dashboard`, atualizar UI para “Sinal do boi gordo” + “Sinal da reposição”, manter cálculos determinísticos e formatação pt-BR | CONCLUIDA | Frontend typecheck OK (`npx tsc -p frontend/tsconfig.json --noEmit`) + Build frontend OK (`npm run build --prefix frontend`) + Schema Prisma válido (`npx prisma validate --schema server/prisma/schema.prisma`) | 2026-05-19 |

## Tarefas pendentes

| ID | Tarefa | Status | Validado | Data |
|---|---|---|---|---|
| - | Nenhuma tarefa pendente no momento | - | - | 2026-05-19 |

## Observações
- Arquivo `frontend/components/PublicLanding.tsx` alterado de forma cirúrgica.
- Hierarquia desktop aplicada: `[Plano Base] [Antes e Depois] [Como funciona] [Dúvidas] [Entrar] [Planos] [Cadastrar no Plano Base]`.
- Deploy da DEP-013 realizado em produção com sucesso em 2026-05-18 via `./deploy-local.sh "chore: aplicar DEP-013 e atualizar tarefas-pendentes-deploy.md"`.
- Commit de deploy DEP-013: `0d05066` (push em `main`, build na VPS OK, PM2 reload OK).
- Deploy das DEP-015 e DEP-016 realizado em produção com sucesso em 2026-05-18 via `./deploy-local.sh "chore: aplicar DEP-015 e DEP-016 (mercado/reposicao) e atualizar tarefas-pendentes-deploy.md"`.
- Commit de deploy DEP-015/016: `35178e8` (push em `main`, build na VPS OK, PM2 reload OK).
- Deploy da DEP-017 realizado em produção com sucesso em 2026-05-18 via `./deploy-local.sh "chore: aplicar DEP-017 (sinais mercado/reposicao) e atualizar tarefas-pendentes-deploy.md"`.
- Commit de deploy DEP-017: `9d18721` (push em `main`, build na VPS OK, PM2 reload OK).
