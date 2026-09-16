DO $$
BEGIN
 IF to_regclass('"PoAnimal"') IS NOT NULL OR to_regclass('"PoLot"') IS NOT NULL OR to_regclass('"PoWeighing"') IS NOT NULL THEN RAISE EXCEPTION 'Legado ainda presente'; END IF;
 IF (SELECT count(*) FROM "Animal") <> 2 OR (SELECT count(*) FROM "Animal" WHERE "tipoCadastro" = 'PO') <> 1 THEN RAISE EXCEPTION 'Animais principais alterados'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "Weighing" WHERE id='keep-weight') OR EXISTS (SELECT 1 FROM "WeighingSession" WHERE id='old-session') THEN RAISE EXCEPTION 'Pesagens incorretas'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "WeighingSession" WHERE id='mixed-session' AND "herdType"='COMMERCIAL') THEN RAISE EXCEPTION 'Sessão compartilhada perdida'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "SemenBatch" WHERE id='keep-semen' AND "bullName"='Genitor antigo' AND "bullRegistry"='REG-PO-123' AND "dosesDisponiveis"=7) THEN RAISE EXCEPTION 'Sêmen alterado'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "EmbryoBatch" WHERE id='keep-embryos' AND "donorName"='Genitor antigo' AND "sireRegistry"='REG-PO-123' AND "quantidadeDisponivel"=6) THEN RAISE EXCEPTION 'Embriões alterados'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "SemenMove" WHERE id='keep-semen-move' AND qty=3) THEN RAISE EXCEPTION 'Histórico de estoque alterado'; END IF;
 IF (SELECT count(*) FROM "HerdEvent")<>1 OR (SELECT count(*) FROM "SanitaryRecord")<>1 OR (SELECT count(*) FROM "PaddockMove")<>1 OR (SELECT count(*) FROM "CriaMortality")<>1 OR (SELECT count(*) FROM "NutritionAssignment")<>1 THEN RAISE EXCEPTION 'Limpeza excedeu os registros exclusivos'; END IF;
 IF EXISTS(SELECT 1 FROM "NutritionExecution") OR EXISTS(SELECT 1 FROM "NutritionCostEntry") OR EXISTS(SELECT 1 FROM "EmbryoTransfer") THEN RAISE EXCEPTION 'Registros exclusivos remanescentes'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "FinancialTransaction" WHERE id='keep-transaction' AND valor=123.45 AND "herdEventId" IS NULL AND "sanitaryRecordId" IS NULL) THEN RAISE EXCEPTION 'Caixa alterado'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "FinancialResultEntry" WHERE id='keep-result' AND amount=123.45 AND "herdEventId" IS NULL AND "sanitaryRecordId" IS NULL AND "nutritionExecutionId" IS NULL) THEN RAISE EXCEPTION 'DRE alterada'; END IF;
 IF NOT EXISTS (SELECT 1 FROM "FinancialResultAllocation" WHERE id='keep-allocation' AND amount=123.45 AND "lotNameSnapshot"='Lote antigo') THEN RAISE EXCEPTION 'Rateio alterado'; END IF;
END $$;
SELECT 'Migração validada: cadastro principal, estoque e financeiro preservados' AS resultado;
