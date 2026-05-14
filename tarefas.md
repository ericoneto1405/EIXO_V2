# Tarefas — EIXO V2

## Pendente de deploy

- [ ] Rebanho: separar contexto da Aba de Animais por tipo de rebanho no frontend (`COMMERCIAL` e `PO`) com `herdType` explícito no `App.tsx`.
- [ ] Rebanho: ajustar `HerdModule` para usar `herdType` real (removendo modo fixo comercial) e aplicar bloqueios controlados para ações sem suporte no P.O. (bulk e nascimento).
- [ ] Rebanho: rotear endpoints do `herdApi` por tipo de rebanho (`/animals` vs `/po/animals`) para listagem/criação, pesagens, eventos, sanitário, movimentações e atualização de animal.
- [ ] Rebanho: manter fluxo único de importação no frontend e delegar roteamento por tipo ao adapter (sem `fetch` direto de rota específica no import e na pesagem em massa).
- [ ] Rebanho: ajustar edição de dados no `AnimalDetailModal` para usar rota por `herdType` (`/animals/:id` ou `/po/animals/:id`), eliminando PATCH fixo do comercial.
- [ ] P0.1 — Aba de Animais: adicionar Painel de Saúde Operacional com atalhos de filtro rápido (sem pasto, pesagem >30d, sem categoria, GMD abaixo da meta).
- [ ] P0.2 — Importação: adicionar bloco de Próxima melhor ação no resultado (associar pasto e iniciar pesagem em massa).
- [ ] P0.4 — Filtros: separar filtros básicos/avançados com botão recolher/expandir e persistência por fazenda/tipo no navegador.
- [ ] P1.1 — Backend: criar endpoint de importação em lote para Comercial e P.O. com retorno por linha (sucesso/erro/avisos).
- [ ] P1.2 — Importação: validar planilha antes do envio (Brinco, Sexo, Raça, Data/Idade; Registro obrigatório para P.O.).
- [ ] P1.3 — Importação mista: separar automaticamente por linha entre Comercial e P.O. e consolidar resultado no mesmo modal.
- [ ] Deploy/higiene: revisar `frontend/vite.config.ts` antes do commit de deploy para garantir configuração correta de produção/desenvolvimento.
- [ ] Landing (protótipo): incluir/avaliar `landing_proposta_avancada.html` no deploy conforme decisão (publicar ou manter apenas como referência).
