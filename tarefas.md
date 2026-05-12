# Tarefas — EIXO V2

## Pendente de deploy

1. Página Planos: atualizar descrição para “...planilhas e cadernos já não dão conta de gerir sua fazenda.”
2. Página /planos: trocar “Já está usando ✓” por CTA “Comece agora!” e abrir a tela de cadastro.
3. Página Planos: alterar o título para “Comece gratuitamente no Plano Essencial. Evolua quando precisar avançar!”.
4. Página Planos: alterar subtítulo para “O plano mais completo do mercado para quem quer sair das planilhas e cadernos...”.
5. Página Planos: retirar “por fazenda / mês” dos cards Eixo Gestão e Eixo Decisão.
6. Cadastro: permitir editar o celular após envio de código SMS.
7. Cadastro: aplicar cooldown de reenvio e bloqueio de 5 minutos após a segunda correção de número.
8. Backend/DB: blindar celular único por conta (`User.phone @unique` + migration `20260512235900_add_unique_user_phone` + tratamento de `P2002` no `/register`).
9. Ambiente frontend: revisar `frontend/vite.config.ts` (proxy está apontando para `https://eixo.agr.br`; em desenvolvimento deve apontar para `http://localhost:3001`).
