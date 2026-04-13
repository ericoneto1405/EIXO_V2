# Status de baseline SaaS — 2026-04-11

## Backup executado

- arquivo: `server/backups/eixo_dev-pre-baseline-20260411-185458.dump`
- formato: `pg_dump -Fc`
- banco: `eixo_dev`

## Comparação feita

Foram comparados:
- banco real em `localhost:5432/eixo_dev`
- schema atual em `server/prisma/schema.prisma`
- migration SaaS em `server/prisma/migrations/20260411183000_saas_foundation/migration.sql`

## Resultado

O banco **não está compatível** para baseline imediato com `migrate resolve --applied`.

Motivo:
- a estrutura real do banco é mais ampla que o schema atual
- o diff do Prisma mostra remoções destrutivas de tabelas, colunas, enums e índices já em uso
- o próprio `prisma db push` acusou perda de dados potencial

## Evidências objetivas

### Estrutura já existente no banco fora do schema atual

Blocos já alinhados ao schema oficial nesta etapa:
- `ActivityLog`
- `BillingEvent`
- `BillingSubscription`
- `repro_checkup_sessions`
- `repro_checkup_records`
- colunas legadas de `Animal`, `Farm`, `Paddock`, `NutritionPlan`, `NutritionAssignment` e `Weighing`
- `CriaMortality`

Tabelas reais que ainda existem no banco e continuam fora do schema atual:
- `NutritionCostEntry`
- `NutritionExecution`
- `ScaleIntegrationConfig`
- `ScaleWeighingSession`
- `SignupOtpChallenge`

### Colunas reais no banco fora do schema atual

As colunas legadas que bloqueavam o baseline neste grupo já foram espelhadas no schema oficial.

Ponto ainda pendente dentro de pesagem/integrações:
- a relação de `Weighing.scaleSessionId` ainda depende de `ScaleWeighingSession`, que continua fora do schema atual

### Diferença prática observada

O comando `prisma migrate diff` indicou que, se o schema atual fosse imposto ao banco, haveria:
- drop de tabelas não vazias
- drop de colunas com dados
- drop de enums ainda existentes
- alteração de colunas opcionais para obrigatórias
- troca de índices e constraints de unicidade

## Conclusão operacional

Neste momento, o caminho seguro é:
1. **não** usar `migrate resolve --applied` agora
2. **não** forçar `db push --accept-data-loss`
3. ajustar o schema de forma incremental e não destrutiva até ele refletir o banco real
4. só depois disso decidir o baseline oficial

## Próxima etapa obrigatória

Fazer um alinhamento incremental entre banco real e schema, em blocos restantes:
- pesagem/integrações
- nutrição complementar
- logs/auditoria complementar
- `SignupOtpChallenge`

Blocos já alinhados nesta etapa:
- billing
- financeiro estrutural (`FinancialPayable` e `FinancialReceivable`)
- check-up reprodutivo
- auditoria estrutural mínima (`ActivityLog`)
- colunas legadas base
- cria estrutural (`CriaMortality`)
- genetics/imports estrutural (`GeneticsAnalysisRun`, `GeneticsAnalysisTopResult` e `HerdImportPending`)
- operações externas/feedlot estrutural (`ExternalOperation*` e `Feedlot*`)

Regra:
- leitura compatível temporária
- escrita preferencial no modelo novo
- remoção de legado só com prova de desuso
