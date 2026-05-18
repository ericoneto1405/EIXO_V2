# Tarefas - EIXO V2

## Publicar e validar em producao

- [ ] Fluxo completo do modal de importacao do rebanho: login, importar, corrigir linhas com erro e concluir com/sem pendencias.
- [ ] Ajuste de seguranca de sessao/login: abrir navegador deve cair na landing sem reaproveitar sessao automaticamente.
- [ ] Revogacao de sessao em outro dispositivo: validar `SESSION_REVOKED` e redirecionamento automatico para login.
- [ ] Sessao por dispositivo real: mesmo dispositivo mantem sessao em multiplas abas; novo dispositivo encerra sessao anterior.
- [ ] Previsao de chuva: Header e Visao Geral devem mostrar dados padronizados.
- [ ] Previsao de chuva no Header: validar fallback por cidade quando nao houver `lat/lng`.

## Ja concluido no codigo local

- [x] Novo favicon com fundo branco.
- [x] Novo titulo da Hero da Landing e alinhamento a esquerda.
- [x] Sessao por dispositivo real no login web.
- [x] Texto restante da Landing corrigido em `PublicLanding.tsx`: "Plano Essencial" para "Plano Base".
- [x] `frontend/vite.config.ts` confirmado apontando para producao por enquanto.
- [x] Validacao TypeScript do frontend executada sem erros.
