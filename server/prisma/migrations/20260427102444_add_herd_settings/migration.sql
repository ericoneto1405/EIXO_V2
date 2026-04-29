-- CreateTable
CREATE TABLE "HerdSettings" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "weighingIntervalDays" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HerdSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HerdCategoryTarget" (
    "id" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "pesoAlvoKg" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HerdCategoryTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HerdSettings_farmId_key" ON "HerdSettings"("farmId");

-- CreateIndex
CREATE UNIQUE INDEX "HerdCategoryTarget_farmId_categoria_key" ON "HerdCategoryTarget"("farmId", "categoria");

-- CreateIndex
CREATE INDEX "HerdCategoryTarget_farmId_idx" ON "HerdCategoryTarget"("farmId");

-- AddForeignKey
ALTER TABLE "HerdSettings" ADD CONSTRAINT "HerdSettings_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HerdCategoryTarget" ADD CONSTRAINT "HerdCategoryTarget_farmId_fkey" FOREIGN KEY ("farmId") REFERENCES "Farm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
