# Tarefas — EIXO V2

## Pendente de deploy

- [ ] EIXO Suporte: implementar conversas ao vivo com polling, painel HQ por conversa, botão de SUPER ADMIN para assumir/liberar conversa e resposta manual no chat.
- [ ] EIXO Suporte: enviar `farmId` no chat e registrar contexto da fazenda nos logs de suporte (`requestMeta`), com fallback para chat genérico quando `farmId` for `null`.
- [ ] EIXO Suporte: aplicar rate limit no endpoint de chat (30/min por usuário + burst 8/10s), com resposta 429 e `Retry-After`.
