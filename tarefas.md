# Tarefas — EIXO V2

## Pendente de deploy

_Nenhuma tarefa pendente._
6. Cadastro: permitir editar o celular após envio de código SMS.
7. Cadastro: aplicar cooldown de reenvio e bloqueio de 5 minutos após a segunda correção de número.
8. Backend/DB: blindar celular único por conta (`User.phone @unique` + migration `20260512235900_add_unique_user_phone` + tratamento de `P2002` no `/register`).
9. Ambiente frontend: revisar `frontend/vite.config.ts` (proxy está apontando para `https://eixo.agr.br`; em desenvolvimento deve apontar para `http://localhost:3001`).
