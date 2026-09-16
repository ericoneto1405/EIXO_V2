-- Somente leitura. Executar no banco alvo e revisar antes de aplicar a migração.
SELECT 'PoAnimal (excluir)' AS item, count(*) AS quantidade FROM "PoAnimal"
UNION ALL SELECT 'PoLot (excluir)', count(*) FROM "PoLot"
UNION ALL SELECT 'PoWeighing (excluir)', count(*) FROM "PoWeighing"
UNION ALL SELECT 'Animal (preservar)', count(*) FROM "Animal"
UNION ALL SELECT 'Animal P.O. (preservar)', count(*) FROM "Animal" WHERE "tipoCadastro" = 'PO'
UNION ALL SELECT 'Sêmen (converter genitor em referência externa)', count(*) FROM "SemenBatch" WHERE "bullPoAnimalId" IS NOT NULL
UNION ALL SELECT 'Embriões (converter genitores em referências externas)', count(*) FROM "EmbryoBatch" WHERE "donorPoAnimalId" IS NOT NULL OR "sirePoAnimalId" IS NOT NULL
UNION ALL SELECT 'Eventos exclusivos (excluir)', count(*) FROM "HerdEvent" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL
UNION ALL SELECT 'Sanidade exclusiva (excluir)', count(*) FROM "SanitaryRecord" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL
UNION ALL SELECT 'Tratos exclusivos (excluir)', count(*) FROM "NutritionExecution" WHERE "poLotId" IS NOT NULL AND "lotId" IS NULL AND "unitId" IS NULL
UNION ALL SELECT 'Custos exclusivos (excluir)', count(*) FROM "NutritionCostEntry" WHERE "poLotId" IS NOT NULL AND "lotId" IS NULL
UNION ALL SELECT 'Planos atribuídos exclusivamente (excluir)', count(*) FROM "NutritionAssignment" WHERE ("poLotId" IS NOT NULL OR "poAnimalId" IS NOT NULL) AND "animalId" IS NULL AND "lotId" IS NULL
UNION ALL SELECT 'Movimentações exclusivas (excluir)', count(*) FROM "PaddockMove" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL
UNION ALL SELECT 'Mortalidades exclusivas (excluir)', count(*) FROM "CriaMortality" WHERE "poAnimalId" IS NOT NULL AND "animalId" IS NULL
UNION ALL SELECT 'Transferências exclusivas (excluir)', count(*) FROM "EmbryoTransfer" t WHERE "recipientPoAnimalId" IS NOT NULL AND "recipientAnimalId" IS NULL AND NOT EXISTS (SELECT 1 FROM "Animal" a WHERE a."embryoTransferId" = t.id)
UNION ALL SELECT 'Sessões exclusivas (excluir)', count(*) FROM "WeighingSession" s WHERE "herdType" = 'PO' AND NOT EXISTS (SELECT 1 FROM "Weighing" w WHERE w."weighingSessionId" = s.id)
UNION ALL SELECT 'Sequências antigas TE (excluir)', count(*) FROM "EmbryoPairSequence" WHERE "herdType" = 'PO'
UNION ALL SELECT 'Rateios (preservar e desvincular lote)', count(*) FROM "FinancialResultAllocation" WHERE "poLotId" IS NOT NULL
UNION ALL SELECT 'Transações financeiras (preservar)', count(*) FROM "FinancialTransaction"
UNION ALL SELECT 'Resultados financeiros (preservar)', count(*) FROM "FinancialResultEntry";
