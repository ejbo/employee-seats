-- CreateTable
CREATE TABLE "ObjectType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'office',
    "w" INTEGER NOT NULL,
    "d" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,
    "spec" JSONB NOT NULL,
    "thumbnailKey" TEXT,
    "createdById" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ObjectType_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ObjectType_key_key" ON "ObjectType"("key");

-- CreateIndex
CREATE INDEX "ObjectType_isActive_category_idx" ON "ObjectType"("isActive", "category");
