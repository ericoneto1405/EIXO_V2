-- CreateEnum
CREATE TYPE "AppAccessType" AS ENUM ('WEB', 'APP_MANEJO', 'WEB_APP');

-- CreateEnum
CREATE TYPE "FieldProfile" AS ENUM ('VAQUEIRO', 'ADMIN_CAMPO');

-- CreateEnum
CREATE TYPE "AppActivationStatus" AS ENUM ('PENDENTE_ATIVACAO', 'ATIVO', 'CODIGO_EXPIRADO', 'BLOQUEADO', 'APARELHO_REVOGADO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "accessType" "AppAccessType" NOT NULL DEFAULT 'WEB',
ADD COLUMN     "appActivationStatus" "AppActivationStatus",
ADD COLUMN     "fieldProfile" "FieldProfile";

-- CreateTable
CREATE TABLE "AppActivationCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppActivationCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "deviceFingerprint" TEXT NOT NULL,
    "deviceLabel" TEXT,
    "platform" TEXT,
    "appVersion" TEXT,
    "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppActivationCode_userId_createdAt_idx" ON "AppActivationCode"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AppActivationCode_organizationId_expiresAt_idx" ON "AppActivationCode"("organizationId", "expiresAt");

-- CreateIndex
CREATE INDEX "AppActivationCode_farmId_expiresAt_idx" ON "AppActivationCode"("farmId", "expiresAt");

-- CreateIndex
CREATE INDEX "AppDevice_userId_isActive_idx" ON "AppDevice"("userId", "isActive");

-- CreateIndex
CREATE INDEX "AppDevice_organizationId_farmId_isActive_idx" ON "AppDevice"("organizationId", "farmId", "isActive");

-- CreateIndex
CREATE INDEX "AppDevice_deviceFingerprint_idx" ON "AppDevice"("deviceFingerprint");

-- AddForeignKey
ALTER TABLE "AppActivationCode" ADD CONSTRAINT "AppActivationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppDevice" ADD CONSTRAINT "AppDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
