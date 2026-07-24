-- CreateTable
CREATE TABLE "SeedVariety" (
    "id" TEXT NOT NULL,
    "sqccId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nepName" TEXT,
    "cropName" TEXT NOT NULL,
    "cropSlug" TEXT NOT NULL,
    "ownerType" TEXT NOT NULL,
    "narcVariety" BOOLEAN NOT NULL DEFAULT false,
    "typeOpHybrid" TEXT,
    "isRegistered" BOOLEAN NOT NULL DEFAULT false,
    "releasedDate" DATE,
    "releasedFiscalYear" INTEGER,
    "recommendedAreas" TEXT,
    "slug" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeedVariety_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SeedVariety_sqccId_key" ON "SeedVariety"("sqccId");

-- CreateIndex
CREATE INDEX "SeedVariety_cropSlug_idx" ON "SeedVariety"("cropSlug");

-- CreateIndex
CREATE INDEX "SeedVariety_ownerType_idx" ON "SeedVariety"("ownerType");
