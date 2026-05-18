# Escopo — Automação de Tarefas Pendentes de Deploy (DEP-001)

Data: 2026-05-18

## 1) O que é deploy de código
- Publicar alterações de backend/frontend no servidor.
- Inclui build, migração e reinício dos serviços.
- Já existe no projeto e não é o foco principal deste ciclo.

## 2) O que é automação de tarefas de negócio
- Execução automática de rotinas do sistema sem clique manual do usuário.
- Exemplos: sincronizações, processamentos recorrentes e jobs internos.
- Este é o foco principal deste ciclo.

## 3) O que entra neste ciclo
- Definir e listar jobs que serão automatizados.
- Criar mecanismo seguro de disparo automático (autenticação técnica).
- Agendar execução recorrente no servidor.
- Registrar logs, falhas e health check das rotinas.
- Definir rollback para voltar ao modo manual com segurança.
- Documentar operação final de ponta a ponta.

## 4) O que não entra neste ciclo
- Refatoração ampla de módulos que não impactam automação.
- Mudança de arquitetura completa do sistema.
- Novas funcionalidades de produto sem relação com jobs automáticos.

## 5) Critério de pronto da DEP-001
- Escopo separado e claro entre:
  - deploy de código
  - automação de tarefas de negócio
- Aprovado para servir de base para DEP-002 em diante.
