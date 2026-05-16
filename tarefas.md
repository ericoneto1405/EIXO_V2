# Tarefas — EIXO V2

## Concluído local (aguardando validação em produção)

- [x] Novo favicon com fundo branco (melhor contraste na aba do navegador).
- [x] Ajustes de texto da Landing: “Plano Essencial” → “Plano Base” (Header, badge e frase de apoio).
- [x] Novo título da Hero da Landing e alinhamento à esquerda.
- [x] Sessão por dispositivo real no login web (remove falso “outro dispositivo” por troca de IP/rede).

## Pendências abertas (produção)

- [ ] Validar em produção o fluxo completo do modal de importação do rebanho (login, importar, correção inline, concluir com/sem pendências).
- [ ] Publicar e validar em produção o ajuste de segurança de sessão/login (abrir navegador deve cair na landing; sem reaproveitar sessão automaticamente).
- [ ] Publicar e validar em produção a revogação de sessão em outro dispositivo (`SESSION_REVOKED`) e o redirecionamento automático para login.
- [ ] Validar em produção o novo comportamento de sessão por dispositivo: mesmo dispositivo mantém sessão (múltiplas abas), novo dispositivo encerra sessão anterior.
- [ ] Publicar e validar em produção a padronização da previsão de chuva entre Header e Visão Geral.
- [ ] Publicar e validar em produção o fallback por cidade da previsão de chuva no Header (quando não houver `lat/lng`).
