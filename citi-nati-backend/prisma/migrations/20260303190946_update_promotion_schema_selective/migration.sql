/*
  Warnings:

  - You are about to drop the column `productCount` on the `Promotion` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Promotion" DROP COLUMN "productCount",
ADD COLUMN     "selectedProductIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
