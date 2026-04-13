# Auditoria estrutural SaaS — 2026-04-11

## Matriz por domínio

| Domínio | Status | Evidência objetiva |
| --- | --- | --- |
| autenticação e sessão | parcial | sessão em cookie e tabela Session já existem; contexto SaaS central foi adicionado nesta fase |
| organização, membership e billing | parcial | contexto SaaS central existe; schema já cobre organização, membership, entitlement e tabelas principais de billing |
| fazendas/pastos/lotes | inconsistente | owner scope legado ainda existia; rotas críticas passaram a ler organizationId quando existir |
| rebanho comercial | inconsistente | escopo legado ainda precisa revisão, mas tabelas estruturais auxiliares de operação externa/feedlot já estão no schema oficial |
| plantel P.O. | inconsistente | owner scope legado ainda existia nas rotas principais |
| cria | parcial | `CriaMortality` agora está no schema oficial; domínio ainda precisa revisão de escopo e volume |
| genetics | parcial | tabelas estruturais de análise e pendências de importação agora estão no schema oficial; ainda faltam contratos e volume |
| financeiro | parcial | tabelas e enums principais agora estão no schema oficial; ainda falta policy central e revisão de contratos |
| nutrição | inconsistente | colunas legadas principais já estão no schema, mas ainda há lacuna de escopo e tabelas fora do Prisma |
| imports | parcial | `HerdImportPending` agora está no schema oficial, mas o domínio ainda não está separado nem padronizado |
| logs/auditoria | parcial | `ActivityLog` agora está no schema oficial, mas ainda não há separação formal entre log técnico e auditoria de negócio |
| observabilidade | ausente | há apenas /health |
| rotas legadas | inconsistente | contratos ainda variam entre domínios |

## Riscos priorizados

1. Acesso cruzado por uso de userId como critério principal em rotas críticas.
2. Contratos de listagem diferentes entre domínios.
3. Rotas de alto volume sem paginação na origem.
4. Billing e entitlement sem policy central aplicada ao conjunto do backend.
5. Falta de observabilidade e auditoria separada.
