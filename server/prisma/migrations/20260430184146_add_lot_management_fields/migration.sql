-- AlterTable
ALTER TABLE "Lot" ADD COLUMN     "objective" TEXT,
ADD COLUMN     "phase" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'ATIVO';
