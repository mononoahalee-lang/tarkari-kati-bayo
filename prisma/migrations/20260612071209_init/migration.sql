-- CreateTable
CREATE TABLE "Market" (
    "id" TEXT NOT NULL,
    "nameNe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vegetable" (
    "id" TEXT NOT NULL,
    "nameNe" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameJa" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'vegetable',
    "unit" TEXT NOT NULL DEFAULT 'kg',

    CONSTRAINT "Vegetable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceRecord" (
    "id" TEXT NOT NULL,
    "vegetableId" TEXT NOT NULL,
    "marketId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "minPrice" DOUBLE PRECISION NOT NULL,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "avgPrice" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "PriceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "titleNe" TEXT,
    "titleEn" TEXT NOT NULL,
    "titleJa" TEXT,
    "url" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_nameEn_key" ON "Market"("nameEn");

-- CreateIndex
CREATE UNIQUE INDEX "Vegetable_nameNe_key" ON "Vegetable"("nameNe");

-- CreateIndex
CREATE INDEX "PriceRecord_date_idx" ON "PriceRecord"("date");

-- CreateIndex
CREATE INDEX "PriceRecord_vegetableId_idx" ON "PriceRecord"("vegetableId");

-- CreateIndex
CREATE INDEX "PriceRecord_marketId_idx" ON "PriceRecord"("marketId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceRecord_vegetableId_marketId_date_key" ON "PriceRecord"("vegetableId", "marketId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "NewsItem_url_key" ON "NewsItem"("url");

-- AddForeignKey
ALTER TABLE "PriceRecord" ADD CONSTRAINT "PriceRecord_vegetableId_fkey" FOREIGN KEY ("vegetableId") REFERENCES "Vegetable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceRecord" ADD CONSTRAINT "PriceRecord_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
