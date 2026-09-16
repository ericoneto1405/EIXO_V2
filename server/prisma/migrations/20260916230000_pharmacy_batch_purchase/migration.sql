-- AlterTable
ALTER TABLE "PharmacyBatch" ADD COLUMN "supplier" TEXT,
ADD COLUMN "invoice_number" TEXT,
ADD COLUMN "purchased_at" TIMESTAMP(3);
