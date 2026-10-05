-- AlterTable
ALTER TABLE "ProductImage" ADD COLUMN     "fileSize" INTEGER,
ADD COLUMN     "mimeType" TEXT,
ADD COLUMN     "storageKey" TEXT;

-- CreateIndex
CREATE INDEX "ProductImage_storageKey_idx" ON "ProductImage"("storageKey");
