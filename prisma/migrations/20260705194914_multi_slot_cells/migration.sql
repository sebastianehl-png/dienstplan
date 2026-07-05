-- DropIndex
DROP INDEX "WeekCell_planId_rowKey_day_key";

-- AlterTable
ALTER TABLE "RowDefault" DROP CONSTRAINT "RowDefault_pkey",
ADD COLUMN     "slot" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "RowDefault_pkey" PRIMARY KEY ("rowKey", "slot");

-- AlterTable
ALTER TABLE "WeekCell" ADD COLUMN     "slot" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "WeekCell_planId_rowKey_day_slot_key" ON "WeekCell"("planId", "rowKey", "day", "slot");

