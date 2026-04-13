# Fallbacks por userId — 2026-04-11

## Regra atual

O backend já passou a resolver escopo por `organizationId` quando esse contexto existe.

O fallback por `userId` continua apenas como compatibilidade controlada.

## Fallbacks restantes

### 1. `buildFarmScopeFilter`
Arquivo: `server/index.js`

Comportamento:
- usa `organizationId` se `req.saas.organizationId` existir
- usa `userId` apenas se ainda não houver organização ativa resolvida

Motivo:
- manter compatibilidade de leitura no período de transição
- evitar quebra imediata para contas antigas ainda não totalmente normalizadas

### 2. `buildFarmRelationFilter`
Arquivo: `server/index.js`

Comportamento:
- usa `organizationId` se `req.saas.organizationId` existir
- usa `userId` apenas se ainda não houver organização ativa resolvida

Motivo:
- manter compatibilidade nas relações aninhadas do Prisma durante a transição

### 3. `POST /farms`
Arquivo: `server/index.js`

Comportamento:
- continua gravando `userId` no cadastro da fazenda
- agora também grava `organizationId`

Motivo:
- o modelo legado ainda depende de `Farm.userId`
- remover essa gravação agora quebraria partes do banco e do histórico que ainda referenciam dono direto
- a escrita já está preferencialmente no modelo novo porque a fazenda sai com `organizationId`

## O que já não depende mais de userId espalhado

Ocorrências antigas removidas das rotas críticas:
- `where: { id: String(farmId), userId: req.user.id }`
- `where: { id: farmId, userId: req.user.id }`
- `where: { userId: req.user.id }`
- `farm: { userId: req.user.id }`

## Conclusão

Hoje o `userId` não está mais espalhado como critério principal nas rotas críticas.

Ele ficou restrito a:
- fallback controlado de compatibilidade
- gravação legada ainda necessária em `Farm.userId`

Critério de remoção futura:
- só remover quando o banco, o schema e os contratos já não dependerem mais disso
- registrar prova de desuso antes da exclusão
