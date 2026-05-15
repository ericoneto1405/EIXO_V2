# Tarefas — EIXO V2

## Concluído (local)

- [x] Segurança de sessão: desativado “lembrar-me”, removida restauração automática de sessão ao abrir o app e exigido login explícito na landing.
- [x] Sessão única por outro dispositivo: novo login revoga sessão ativa anterior de outro dispositivo (mantendo múltiplas abas no mesmo dispositivo).
- [x] Frontend: tratamento centralizado de `401 + SESSION_REVOKED`, com retorno ao login e mensagem amigável sem loop.
- [x] Previsão de chuva: padronizado Header com Visão Geral (timezone `America/Sao_Paulo` e arredondamento em 1 casa decimal).
- [x] Header: adicionado fallback por cidade para previsão de chuva quando a fazenda não tiver coordenadas GPS (alinhado à Visão Geral).

## Pendente de deploy

- [ ] Validar em produção o fluxo completo do modal de importação do rebanho (login, importar, correção inline, concluir com/sem pendências).
- [ ] Publicar e validar em produção o ajuste de segurança de sessão/login (abrir navegador deve cair na landing; sem reaproveitar sessão automaticamente).
- [ ] Publicar e validar em produção a revogação de sessão em outro dispositivo (`SESSION_REVOKED`) e o redirecionamento automático para login.
- [ ] Publicar e validar em produção a padronização da previsão de chuva entre Header e Visão Geral.
- [ ] Publicar e validar em produção o fallback por cidade da previsão de chuva no Header (quando não houver `lat/lng`).
