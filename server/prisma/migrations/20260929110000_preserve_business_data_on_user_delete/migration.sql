BEGIN;

-- A autoria não pode apagar dados que pertencem à fazenda ou à organização.
DO $$
DECLARE
    link RECORD;
BEGIN
    FOR link IN
        SELECT * FROM (VALUES
            ('Farm', 'userId'),
            ('FieldOccurrence', 'createdById'),
            ('GeneticsAnalysisRun', 'createdById'),
            ('AcasalamentoSession', 'createdById'),
            ('ExternalOperation', 'createdById'),
            ('ExternalOperationLedgerEntry', 'createdById'),
            ('ExternalOperationSettlement', 'createdById'),
            ('CommercialClient', 'createdById'),
            ('CommercialDeal', 'createdById'),
            ('CommercialContract', 'createdById'),
            ('CommercialReminder', 'createdById'),
            ('FeedlotContract', 'createdById'),
            ('FeedlotLedgerEntry', 'createdById'),
            ('FeedlotSettlement', 'createdById')
        ) AS links(table_name, column_name)
    LOOP
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', link.table_name, link.column_name);
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', link.table_name, link.table_name || '_' || link.column_name || '_fkey');
        EXECUTE format(
            'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE',
            link.table_name,
            link.table_name || '_' || link.column_name || '_fkey',
            link.column_name
        );
    END LOOP;
END $$;

-- Fazendas antigas sem organização continuam exigindo um usuário responsável.
ALTER TABLE "Farm"
ADD CONSTRAINT "Farm_has_scope_check"
CHECK ("organizationId" IS NOT NULL OR "userId" IS NOT NULL);

COMMIT;
