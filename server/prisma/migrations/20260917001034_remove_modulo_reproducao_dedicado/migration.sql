/*
  Warnings:

  - You are about to drop the `repro_checkup_records` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `repro_checkup_sessions` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "repro_checkup_records" DROP CONSTRAINT "repro_checkup_records_animal_id_fkey";

-- DropForeignKey
ALTER TABLE "repro_checkup_records" DROP CONSTRAINT "repro_checkup_records_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "repro_checkup_records" DROP CONSTRAINT "repro_checkup_records_session_id_fkey";

-- DropForeignKey
ALTER TABLE "repro_checkup_sessions" DROP CONSTRAINT "repro_checkup_sessions_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "repro_checkup_sessions" DROP CONSTRAINT "repro_checkup_sessions_farm_id_fkey";

-- DropForeignKey
ALTER TABLE "repro_checkup_sessions" DROP CONSTRAINT "repro_checkup_sessions_season_id_fkey";

-- DropTable
DROP TABLE "repro_checkup_records";

-- DropTable
DROP TABLE "repro_checkup_sessions";
